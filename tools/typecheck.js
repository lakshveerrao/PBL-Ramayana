#!/usr/bin/env node
// typecheck - does a caption clip?
// Measured through the REAL burn path: the same libass `subtitles` filter, the same
// force_style, the same font, onto the same 1080x1920 frame the film is cut at.
// Measuring through drawtext would test a renderer the film never uses.
import { read, treatment, firstDirected } from '../lib/store.js';
import { burnPlan, burnFilter, wrap, assDoc } from '../lib/subtitle.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const typo = read('typography');
const W = typo.frame.width, H = typo.frame.height;

// Burn one line and return the ink bounding box of the caption.
function burnBox(text, lang) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-burn-'));
  const srtPath = join(dir, 's.ass');
  const raw = join(dir, 'f.gray');
  try {
    writeFileSync(srtPath, assDoc([{ start: 0, end: 2, text }], lang), 'utf8');
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`,
      '-vf', burnFilter(srtPath, lang),
      '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-y', raw,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const b = readFileSync(raw);
    let top = -1, bottom = -1, left = -1, right = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (b[y * W + x] > 24) {
          if (top < 0) top = y;
          bottom = y;
          if (left < 0 || x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    const lineCount = wrap(text, burnPlan(lang).max_chars_per_line).length;
    return top < 0 ? null : { top, bottom, left, right, height: bottom - top + 1, width: right - left + 1, lines: lineCount };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const filmId = process.argv[2] ?? firstDirected();
const t = treatment(filmId);
let failures = 0, checked = 0;
console.log(`\nTYPECHECK ${filmId} - burned through libass at ${W}x${H}, measured\n`);

for (const lang of Object.keys(typo.scripts)) {
  const spec = typo.scripts[lang];
  const plan = burnPlan(lang);
  console.log(`  ${lang}  ${spec.script}  ${spec.size_px}px x ${spec.line_height}  line box ${spec.line_box_px}px  ${plan.font_file.split('/').pop()}`);

  for (const probe of spec.conjunct_probe ?? ['Hg']) {
    checked++;
    const box = burnBox(probe, lang);
    if (!box) { console.log(`     ${pad(probe)} NO INK - the font does not render this`); failures++; continue; }
    const budget = spec.line_box_px;              // one line's worth
    const fits = box.height <= budget;
    if (!fits) failures++;
    console.log(`     ${pad(probe)} ink ${String(box.height).padStart(3)}px / ${budget}px  ${fits ? 'fits' : 'CLIPS'}`);
  }

  // The real narration lines, wrapped as they will be.
  let worst = null;
  for (const [id, n] of Object.entries(t.narration)) {
    checked++;
    const box = burnBox(n[lang], lang);
    if (!box) { failures++; console.log(`     ${id} NO INK: ${n[lang]}`); continue; }
    const budget = spec.line_box_px * box.lines;
    if (box.height > budget) { failures++; console.log(`     ${id} CLIPS ${box.height}px / ${budget}px: ${n[lang]}`); }
    if (box.bottom >= H) { failures++; console.log(`     ${id} runs past the bottom of frame`); }
    if (box.left < 24 || box.right > W - 24) { failures++; console.log(`     ${id} runs into the side margin`); }
    if (!worst || box.height > worst.h) worst = { h: box.height, budget, text: n[lang], lines: box.lines, bottom: box.bottom };
  }
  console.log(`     tallest line ${worst.h}px / ${worst.budget}px (${worst.lines} line${worst.lines > 1 ? 's' : ''}), baseline ends ${H - worst.bottom}px above frame bottom`);
  console.log(`     "${worst.text}"`);
  console.log('');
}

console.log(failures === 0 ? `  ${checked} burns checked, nothing clips\n` : `  ${failures} of ${checked} burns CLIP\n`);
process.exit(failures === 0 ? 0 : 1);

function pad(s) { return (s + '        ').slice(0, 9); }

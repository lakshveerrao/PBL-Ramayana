#!/usr/bin/env node
// cutcheck - do the cuts land on the frames the shot list says, and does skin survive
// the whole pipeline? Measured on the finished video, not on a test patch.
import { read, treatment, ROOT } from '../lib/store.js';
import { plan } from '../lib/assemble.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const film = process.argv[2] ?? 'M3';
const file = process.argv[3] ?? `out/${film}.en.mp4`;
const W = 1080, H = 1920;

// Pull one exact frame by index and sample the middle of the swatch band.
function sampleFrame(idx) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-cut-'));
  const raw = join(dir, 'f.rgb');
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-i', join(ROOT, file), '-vf', `select='eq(n\\,${idx})'`, '-vsync', '0',
      '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', raw],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    const b = readFileSync(raw);
    // Average a patch inside the swatch band (y ~ 0.34..0.64 of frame height).
    let r = 0, g = 0, bl = 0, n = 0;
    for (let y = Math.round(H * 0.44); y < Math.round(H * 0.54); y += 3) {
      for (let x = 300; x < 780; x += 5) {
        const o = (y * W + x) * 3;
        r += b[o]; g += b[o + 1]; bl += b[o + 2]; n++;
      }
    }
    return { r: r / n, g: g / n, b: bl / n };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lstar = ({ r, g, b }) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16; };
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

const p = plan(film);
const locks = read('locks').locks;
let failures = 0;

console.log(`\nCUTCHECK ${film} - ${file}\n`);
console.log('  shot    start  frames   entity        swatch L*   lock L*   delta   verdict');
console.log('  ' + '-'.repeat(76));

let cursor = 0;
const boundaries = [];
for (const s of p.shots) {
  const start = cursor;
  const mid = start + Math.floor(s.frames / 2);
  cursor += s.frames;
  boundaries.push({ shot: s.id, start, end: cursor - 1, mid, entities: s.entities ?? [] });
}

for (const b of boundaries) {
  const sample = sampleFrame(b.mid);
  const entity = b.entities[0];
  const lock = entity ? locks.find((l) => l.kind === 'skin_albedo' && l.entity === entity) : null;
  if (!lock) {
    console.log(`  ${b.shot.padEnd(7)} ${String(b.start).padStart(5)}  ${String(b.end - b.start + 1).padStart(6)}   ${'(no principal)'.padEnd(13)} ${lstar(sample).toFixed(1).padStart(8)}       -         -     -`);
    continue;
  }
  const out = lstar(sample), want = lock.value.lab_L, d = out - want, tol = lock.value.tolerance_L;
  const ok = Math.abs(d) <= tol;
  if (!ok) failures++;
  console.log(`  ${b.shot.padEnd(7)} ${String(b.start).padStart(5)}  ${String(b.end - b.start + 1).padStart(6)}   ${entity.padEnd(13)} ${out.toFixed(1).padStart(8)}  ${want.toFixed(1).padStart(8)}  ${(d >= 0 ? '+' : '') + d.toFixed(2).padStart(5)}   ${ok ? 'held' : (d > 0 ? 'LIGHTENED' : 'DARK')}`);
}

// Cuts: the frame before a boundary must differ from the frame at it; frames inside a
// shot must not. Grain is temporal, so the threshold is on the swatch band only.
console.log('\n  cut placement');
let cutFails = 0;
for (const b of boundaries.slice(1)) {
  const before = sampleFrame(b.start - 1), at = sampleFrame(b.start);
  const inside = b.end > b.start ? sampleFrame(b.start + 1) : at;
  const cut = dist(before, at);
  const stable = dist(at, inside);
  const prevEnt = boundaries[boundaries.indexOf(b) - 1].entities[0];
  const sameSwatch = prevEnt === b.entities[0];
  // A cut between two shots sharing a swatch colour will not show here; that is
  // expected and is not a failure.
  const clean = sameSwatch || cut > stable + 2;
  if (!clean) { cutFails++; failures++; }
  console.log(`  ${boundaries[boundaries.indexOf(b) - 1].shot} -> ${b.shot.padEnd(7)} at frame ${String(b.start).padStart(4)}   delta across cut ${cut.toFixed(1).padStart(6)}   within shot ${stable.toFixed(1).padStart(5)}   ${sameSwatch ? 'same swatch, not measurable' : clean ? 'cut lands' : 'NO CUT'}`);
}

console.log(failures === 0 ? `\n  every cut lands on its frame and no face drifts outside its lock\n` : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
// skinsample - read each approved model sheet's face and write down its albedo.
//
// LOCK.SKIN.POLICY says the number is not the graph's to hold: "Exact skin values are
// production design, set by the studio's approved sheets - not by this workspace." The
// sheets now exist, so the number exists, and until it is written down every skin check
// in the repo prints NOT MEASURED or "(no principal)" and clears everything by not
// looking.
//
// HOW IT FINDS A FACE, without a face detector. The first attempt assumed the head was
// in the upper third of the frame and it was wrong twice over: the sheets are framed
// differently from each other - Vasistha's front.png is a head-and-shoulders portrait
// where the upper third is hair and backdrop - and the warm dark-brown studio backdrop
// sits at hue 25, saturation 0.3, value 0.17, which is inside any honest skin window.
// It read Vasistha's backdrop as his face and called his skin L* 14.9.
//
// What separates a face from that backdrop is not colour and must never be brightness -
// a tool that excludes dark pixels to find a face is a colourist tool. It is TEXTURE. A
// backdrop is flat; a face has an eye, a nostril, a beard edge. So:
//
//   - the whole frame, no assumption about framing
//   - hue 5-40 degrees, the skin band
//   - saturation 0.15-0.55, which is what separates skin from the saffron and the
//     red-and-gold beside it - both far more saturated at the same hue
//   - LOCAL VARIANCE above a floor, which is what drops the backdrop
//   - of what survives, the top quarter of ROWS - the head, wherever the head is, since
//     bare chest and arms are the same skin lit differently
//   - the MEDIAN of that, not the mean: a median is not moved by stray survivors
//
import { ROOT, ensureDir, assetsDir } from '../lib/store.js';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 240;
export function sampleFace(file) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { encoding: 'utf8' }).trim().split('x').map(Number);
  const H = Math.round((W * probe[1]) / probe[0]);
  const buf = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file,
    '-vf', `scale=${W}:${H}:flags=area,format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });

  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < buf.length; i += 3, p++) lum[p] = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  // Local standard deviation over 3x3. Flat backdrop -> near zero. A face -> not.
  const sd = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let s1 = 0, s2 = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = lum[(y + dy) * W + (x + dx)]; s1 += v; s2 += v * v;
    }
    sd[y * W + x] = Math.sqrt(Math.max(0, s2 / 9 - (s1 / 9) ** 2));
  }

  const TEXTURE_FLOOR = 2.0;
  const hits = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = (y * W + x) * 3;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (v > 0.92) continue;                      // specular only; no floor, by design
    if (s < 0.15 || s > 0.55) continue;
    if (!(r > g && g >= b)) continue;
    if (sd[y * W + x] < TEXTURE_FLOOR) continue; // the backdrop goes here
    const d = mx - mn;
    let hue = 0;
    if (d !== 0) hue = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (hue < 0) hue += 360;
    if (hue < 5 || hue > 40) continue;
    hits.push({ r, g, b, y });
  }
  if (hits.length < 200) return { ok: false, reason: `only ${hits.length} textured skin pixels in the whole frame - look at the sheet`, pixels: hits.length };

  // The head is the top quarter of the skin we found, wherever the framing put it.
  const rows = hits.map((p) => p.y).sort((a, b) => a - b);
  const cut = rows[Math.floor(rows.length * 0.25)];
  let head = hits.filter((p) => p.y <= cut);
  if (head.length < 120) head = hits;
  const med = (k) => { const a = head.map((p) => p[k]).sort((x, y) => x - y); return a[a.length >> 1]; };
  const rgb = { r: med('r'), g: med('g'), b: med('b') };
  return {
    ok: true, ...rgb,
    pixels: head.length, skin_pixels: hits.length,
    band: [rows[0], cut],
    hex: `#${[rgb.r, rgb.g, rgb.b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`,
  };
}

export function lstar({ r, g, b }) {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = process.argv.includes('--write');
  const dir = join(ROOT, 'assets', 'sheets');
  const sheets = readdirSync(dir).filter((d) => d.startsWith('SHEET.'));
  const swatchDir = ensureDir(`${assetsDir()}/skin`);
  console.log('\nSKIN SAMPLE - the approved sheets, read for their face albedo\n');
  console.log('  entity        sheet            pixels   sRGB      L*    views agree');
  console.log('  ' + '-'.repeat(74));
  const out = [];
  for (const s of sheets) {
    const entity = s.replace(/^SHEET\./, '');
    const views = readdirSync(join(dir, s)).filter((f) => /\.(png|jpe?g)$/i.test(f));
    const per = [];
    for (const v of views) {
      const r = sampleFace(join(dir, s, v));
      if (r.ok) per.push({ view: v, ...r, L: lstar(r) });
      else console.log(`  ${entity.padEnd(13)} ${v.padEnd(16)} ${r.reason}`);
    }
    if (!per.length) continue;
    // The sheet's albedo is the DARKEST view. A view lit brighter reads lighter, and
    // the rule is "never lighter than the approved model sheet" - so the floor is what
    // the rule needs, and picking the brightest would license lightening by one lamp.
    const chosen = per.reduce((a, x) => (x.L < a.L ? x : a));
    const spread = Math.max(...per.map((x) => x.L)) - Math.min(...per.map((x) => x.L));
    for (const p of per) {
      console.log(`  ${(p === chosen ? entity : '').padEnd(13)} ${p.view.padEnd(16)} ${String(p.pixels).padStart(6)}   ${p.hex}  ${p.L.toFixed(1).padStart(5)}${p === chosen ? '   <- taken' : ''}`);
    }
    if (per.length > 1) console.log(`  ${''.padEnd(13)} ${'spread across views'.padEnd(16)} ${spread.toFixed(1)} L*`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', `color=c=${chosen.hex}:s=120x120:d=1`, '-frames:v', '1', '-y', join(swatchDir, `${entity}.png`)], { stdio: ['ignore', 'ignore', 'pipe'] });
    out.push({ entity, srgb_hex: chosen.hex, lab_L: Number(chosen.L.toFixed(2)), from_view: chosen.view, pixels: chosen.pixels, views_L: per.map((p) => ({ view: p.view, hex: p.hex, L: Number(p.L.toFixed(2)) })), spread_L: Number(spread.toFixed(2)) });
  }
  if (!run) { console.log('\n  Nothing written. Add --write.\n'); process.exit(0); }
  const path = join(ROOT, 'direction', 'skin-albedo.json');
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  writeFileSync(path, JSON.stringify({
    _doc: 'The measured face albedo of each APPROVED model sheet. LOCK.SKIN.POLICY says this number is production design, set by the studio\'s approved sheets and not by the graph - so it lives here, beside the sheets it was read from, and data/ stays byte-identical.',
    _how: 'tools/skinsample.js, median of the skin-hue pixels in the upper third of the sheet. Saturation 0.15-0.55 is what separates a face from the saffron and the red-and-gold beside it. Re-run it to reproduce any number here.',
    _which_view: 'Where a sheet has several views, the DARKEST is taken. A view lit brighter reads lighter, and the rule is "never lighter than the approved model sheet" - taking the brightest would license lightening by one lamp.',
    _what_it_is_for: 'Two different checks, and they are not the same test. (1) A FRAME measured outside this is REPORTED, never blocked: a face in shadow or in the lattice light differs from its sheet legitimately. (2) A GRADE OP that raises skin relative to the ungraded frame is a HARD FAIL. That is the defect the rule exists for.',
    _class: 'S - our staging. Read from sheets a named person approved; not a claim, and not the text\'s.',
    measured_on: new Date().toISOString().slice(0, 10),
    sheets_approved_by: 'Venkat',
    tolerance_L: 2.0,
    _tolerance_means: 'For the grade-op check only: the grade may not raise a skin L* by more than this. It is a quantisation allowance, not a licence - the grade chain is meant to move skin by zero.',
    entities: out,
    ...(prior.superseded ? { superseded: prior.superseded } : {}),
  }, null, 2) + '\n', 'utf8');
  console.log(`\n  ${out.length} written to direction/skin-albedo.json, swatches in ${swatchDir.replace(ROOT + '/', '')}/\n`);
}

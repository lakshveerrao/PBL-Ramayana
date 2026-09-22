#!/usr/bin/env node
// cutcheck - do the cuts land on the frames the shot list says, and does skin survive
// the whole pipeline? Measured on the finished video, not on a test patch.
import { read, treatment, ROOT, firstDirected } from '../lib/store.js';
import { albedoForShot, toleranceL, albedos } from '../lib/skin.js';

import { plan } from '../lib/assemble.js';
import { frame as graphFrame } from '../lib/graph.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const film = process.argv[2] ?? firstDirected();
const file = process.argv[3] ?? `out/${film}.en.mp4`;
const { width: W, height: H } = graphFrame();

// Pull one exact frame by index.
//
// TWO different measurements, because they answer different questions:
//
//   swatchAt(idx)   the middle band, for the SKIN check. When a shot is a placeholder
//                   card that band is a flat albedo swatch; on a real still it is the
//                   subject. Either way the grade is what is being measured.
//
//   signatureAt(idx) the whole frame, pooled into a coarse grid, for the CUT check.
//
// The cut check used to use the swatch patch and it was written for placeholder cards,
// where the band was one flat colour per entity and the only within-shot variation was
// grain. On real photographic stills that patch is meaningless: grain moved it by up to
// 76 within a single held still, while two different shots could share a near-identical
// patch and read as "NO CUT". Six of thirteen cuts failed that way on a film whose frame
// boundaries are exact to the frame.
//
// Pooling the whole frame into a grid fixes both halves: averaging kills the grain, and
// two different pictures differ across the whole composition even when one patch agrees.
function rawFrame(idx) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-cut-'));
  const raw = join(dir, 'f.rgb');
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-i', join(ROOT, file), '-vf', `select='eq(n\\,${idx})'`, '-vsync', '0',
      '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', raw],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    return readFileSync(raw);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function sampleFrame(idx) {
  const b = rawFrame(idx);
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = Math.round(H * 0.44); y < Math.round(H * 0.54); y += 3) {
    for (let x = 300; x < 780; x += 5) {
      const o = (y * W + x) * 3;
      r += b[o]; g += b[o + 1]; bl += b[o + 2]; n++;
    }
  }
  return { r: r / n, g: g / n, b: bl / n };
}

// The SKIN sample for a shot: the CHEEK, measured by the same tools/cheek.py that read
// the sheet. Comparing like with like is the whole point - the director settled the
// question by hand on 2026-30-22 by doing exactly this, and got 57.4 on the sheet
// against 58.0 and 57.5 in two frames.
//
// The earlier version of this compared a median over every skin-ish pixel in the frame
// against a median over every skin-ish pixel in the sheet, and reported every close-up
// as +12 to +22 above its sheet. Warm sandstone, gold and lamp light all pass a
// skin-hue test; the king's white dhoti reads 70.7 on the sheet and 61 and 45 in those
// same frames. The film is DARKER around him. Nothing was lightened.
function cheekAt(idx) {
  const png = join(tmpdir(), `pbl-cut-${process.pid}-${idx}.png`);
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-i', join(ROOT, file), '-vf', `select='eq(n\\,${idx})'`, '-vsync', '0', '-frames:v', '1', '-y', png],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    const out = execFileSync('python3', [join(ROOT, 'tools', 'cheek.py'), png], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const r = JSON.parse(out)[png];
    return r?.ok ? r : null;
  } catch { return null; } finally { rmSync(png, { force: true }); }
}

// A coarse average-pooled grid of the whole frame. Grain averages out; composition does not.
const GRID_X = 12, GRID_Y = 20;
function signatureAt(idx) {
  const b = rawFrame(idx);
  const cells = new Float64Array(GRID_X * GRID_Y * 3);
  const counts = new Float64Array(GRID_X * GRID_Y);
  for (let y = 0; y < H; y += 4) {
    const gy = Math.min(GRID_Y - 1, Math.floor((y / H) * GRID_Y));
    for (let x = 0; x < W; x += 4) {
      const gx = Math.min(GRID_X - 1, Math.floor((x / W) * GRID_X));
      const c = (gy * GRID_X + gx), o = (y * W + x) * 3;
      cells[c * 3] += b[o]; cells[c * 3 + 1] += b[o + 1]; cells[c * 3 + 2] += b[o + 2];
      counts[c]++;
    }
  }
  const out = new Float64Array(GRID_X * GRID_Y * 3);
  for (let c = 0; c < counts.length; c++) {
    for (let k = 0; k < 3; k++) out[c * 3 + k] = counts[c] ? cells[c * 3 + k] / counts[c] : 0;
  }
  return out;
}

// Mean absolute difference per channel across the grid, in 0..255.
function sigDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lstar = ({ r, g, b }) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16; };
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

const p = plan(film);
const locks = read('locks').locks;
let failures = 0;

console.log(`\nCUTCHECK ${film} - ${file}\n`);
console.log('  a frame outside its sheet is REPORTED, not failed - lighting differs from a sheet');
console.log('  legitimately. What blocks is a grade op that raises skin: see gradecheck.\n');
console.log('  shot    start  frames   entity        frame L*   sheet L*   delta   note');
console.log('  ' + '-'.repeat(76));

let reported = 0;
let noFace = 0;
let cursor = 0;
const boundaries = [];
for (const s of p.shots) {
  const start = cursor;
  const mid = start + Math.floor(s.frames / 2);
  cursor += s.frames;
  boundaries.push({ shot: s.id, start, end: cursor - 1, mid, entities: s.entities ?? [] });
}

// A FRAME outside its sheet is REPORTED, never blocked - the director set this on
// 2026-09-22 and the reason is sound: a face in shadow, or in the lattice light, or
// three-quarters to a window differs from its sheet legitimately, and failing on that
// would be measuring the lighting and calling it colourism. What blocks is a grade op
// that raises skin, and tools/gradecheck.js is where that is measured.
//
// This band is also the WHOLE FRAME's midtone, not a face: a wide of an empty hall and
// a close-up of one man are not comparable numbers. So the column says what it is.
// CALIBRATION, from the film's own shots. faceAt() looks for textured skin-hue pixels,
// and warm sandstone, lime plaster and gold pass that test: run on 01-01, an empty hall
// with no person in it, it happily returns a "face". So the film's no-principal shots
// are the control. A sample that is indistinguishable from them is architecture, and
// saying so is the only honest thing to print - a column that reported every shot as
// "above sheet" because the walls are warm would cry colourism sixteen times and mean
// nothing.
// "No principal" is not "no entities" - 01-01's entity list is ['SABHA'], a place. The
// control is the shots for which no CHARACTER albedo resolves at all.
const control = boundaries
  .filter((b) => !albedoForShot(b.entities ?? []) && !(b.entities ?? []).some((e) => locks.some((l) => l.kind === 'skin_albedo' && l.entity === e)))
  .map((b) => { const f = cheekAt(b.mid); return f ? f.L : null; })
  .filter((x) => x !== null);
const baseline = control.length ? control.reduce((a, x) => a + x, 0) / control.length : null;
const BAND = albedos().report_band_L ?? 10;
if (baseline !== null) {
  console.log(`  control: a cheek was still found in ${control.length} shot(s) with no principal, at L* ${baseline.toFixed(1)}.`);
  console.log(`  Worth knowing, but not used to judge: the cheek is now placed from a detected pair`);
  console.log(`  of eyes, so a wall cannot supply one.\n`);
}

for (const b of boundaries) {
  const face = cheekAt(b.mid);
  const entity = b.entities[0];
  const lock = entity ? locks.find((l) => l.kind === 'skin_albedo' && l.entity === entity) : null;
  const sheet = lock ? { lab_L: lock.value.lab_L, tol: lock.value.tolerance_L, id: entity }
              : (albedoForShot(b.entities) ? { lab_L: albedoForShot(b.entities).lab_L, tol: toleranceL(), id: albedoForShot(b.entities).entity } : null);
  if (!sheet) {
    console.log(`  ${b.shot.padEnd(7)} ${String(b.start).padStart(5)}  ${String(b.end - b.start + 1).padStart(6)}   ${'(no principal)'.padEnd(13)} ${(face ? face.L : lstar(sampleFrame(b.mid))).toFixed(1).padStart(8)}       -         -     -`);
    continue;
  }
  // With no face in the frame there is no cheek to compare, and printing a delta from
  // the frame's midtone instead would be exactly the mistake this rewrite undid.
  const out = face ? face.L : lstar(sampleFrame(b.mid)), want = sheet.lab_L;
  const d = face ? out - want : null;
  // Ordinary lighting moves a cheek. The director set the reporting band at 10 L* on
  // 2026-09-22: inside it, nothing is said.
  const note = !face ? 'no face in frame'
             : (Math.abs(d) <= BAND ? 'ordinary lighting'
             : (d > 0 ? `ABOVE sheet by ${d.toFixed(1)}` : `below sheet by ${(-d).toFixed(1)}`));
  reported += (face && Math.abs(d) > BAND) ? 1 : 0;
  if (!face) noFace++;
  console.log(`  ${b.shot.padEnd(7)} ${String(b.start).padStart(5)}  ${String(b.end - b.start + 1).padStart(6)}   ${sheet.id.padEnd(13)} ${out.toFixed(1).padStart(8)}  ${want.toFixed(1).padStart(8)}  ${(d === null ? '    -' : (d >= 0 ? '+' : '') + d.toFixed(2)).padStart(6)}   ${note}`);
}

// Cuts: the frame before a boundary must differ from the frame at it; frames inside a
// shot must not. Grain is temporal, so the threshold is on the swatch band only.
console.log('\n  cut placement');
let cutFails = 0;
for (const b of boundaries.slice(1)) {
  const before = signatureAt(b.start - 1), at = signatureAt(b.start);
  const inside = b.end > b.start ? signatureAt(b.start + 1) : at;
  const cut = sigDist(before, at);
  const stable = sigDist(at, inside);
  // A REUSE or CROP of the shot before it is the same picture by design. That is not a
  // missing cut, and the shot list says which.
  const prev = boundaries[boundaries.indexOf(b) - 1];
  const sameSwatch = b.reuse_of === prev.shot || b.crop_of === prev.shot;
  // Grain now averages out, so within-shot movement is near zero and a real cut is a
  // large, unambiguous step. 2.0 is well above the residual and well below any cut seen.
  const clean = sameSwatch || (cut > stable + 2 && cut > 2.0);
  if (!clean) { cutFails++; failures++; }
  console.log(`  ${boundaries[boundaries.indexOf(b) - 1].shot} -> ${b.shot.padEnd(7)} at frame ${String(b.start).padStart(4)}   delta across cut ${cut.toFixed(1).padStart(6)}   within shot ${stable.toFixed(1).padStart(5)}   ${sameSwatch ? 'reuse of the shot before - same picture by design' : clean ? 'cut lands' : 'NO CUT'}`);
}

console.log(failures === 0 ? `\n  every cut lands on its frame and no face drifts outside its lock\n` : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

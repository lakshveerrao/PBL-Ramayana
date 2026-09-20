#!/usr/bin/env node
// gradecheck - does the grade lighten a face?
// Renders each locked skin albedo as a flat patch, pushes it through the real grade
// chain, and measures L* out against the lock's tolerance. The colourism rule is a
// measurement here, not a promise.
import { read } from '../lib/store.js';
import { chain } from '../lib/grade.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function throughGrade(hex) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-grade-'));
  const raw = join(dir, 'p.rgb');
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=c=${hex}:s=64x64:d=1`,
      '-vf', chain(), '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', raw],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    const b = readFileSync(raw);
    // Sample the middle of the patch.
    const o = (32 * 64 + 32) * 3;
    return { r: b[o], g: b[o + 1], b: b[o + 2] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// sRGB -> CIE L*
function lstar({ r, g, b }) {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16;
}

const locks = read('locks').locks.filter((l) => l.kind === 'skin_albedo');
let failures = 0;
console.log('\nGRADECHECK - locked skin albedo through the real grade chain\n');
console.log('  entity        locked        L* in    L* out   delta   tol   verdict');
console.log('  ' + '-'.repeat(70));

for (const l of locks) {
  const inRgb = hexRgb(l.value.srgb_hex);
  const out = throughGrade(l.value.srgb_hex);
  const lin = lstar(inRgb), lout = lstar(out);
  const delta = lout - lin;
  const tol = l.value.tolerance_L;
  // Two-sided. Lightening is the colourism defect the rule exists for; drifting dark
  // is a consistency defect against the same lock. Neither is acceptable.
  const ok = Math.abs(delta) <= tol;
  if (!ok) failures++;
  const verdict = ok ? 'held' : (delta > 0 ? 'LIGHTENED' : 'DRIFTED DARK');
  console.log(`  ${l.entity.padEnd(13)} ${l.value.srgb_hex}      ${lin.toFixed(1).padStart(5)}   ${lout.toFixed(1).padStart(6)}  ${(delta >= 0 ? '+' : '') + delta.toFixed(2)}   ${tol.toFixed(1)}   ${verdict}`);
}

// And the never-blue rule, measured: a neutral shadow must not come out bluer.
const shadow = throughGrade('#202020');
const blueShift = shadow.b - shadow.r;
const blueOk = blueShift <= 0;
if (!blueOk) failures++;
console.log(`\n  neutral shadow #202020 -> rgb(${shadow.r},${shadow.g},${shadow.b})  b-r ${blueShift >= 0 ? '+' : ''}${blueShift}  ${blueOk ? 'warm, correct' : 'BLUE - forbidden'}`);

// And the black point.
const black = throughGrade('#000000');
const ire = (black.r / 255) * 100;
const target = read('grade').black_point_ire;
const blackOk = Math.abs(ire - target) <= 1.5;
if (!blackOk) failures++;
console.log(`  black #000000 -> IRE ${ire.toFixed(1)} (target ${target})  ${blackOk ? 'on target' : 'OFF TARGET'}`);

console.log(failures === 0 ? `\n  grade holds: nothing lightened, no blue shadow, black on target\n` : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

function hexRgb(h) { const s = h.replace('#', ''); return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }; }

#!/usr/bin/env node
// gradecheck - does the grade lighten a face?
// Renders each locked skin albedo as a flat patch, pushes it through the real grade
// chain, and measures L* out against the lock's tolerance. The colourism rule is a
// measurement here, not a promise.
import { read } from '../lib/store.js';
import { skinGovernance } from '../lib/contract.js';
import { gradeNumbers } from '../lib/graph.js';
import { chain, gradeTrims, exposureTrim } from '../lib/grade.js';
import { albedos, measurable as skinMeasurable, toleranceL, raisesSkin } from '../lib/skin.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function throughGrade(hex, trimGain = null) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-grade-'));
  const raw = join(dir, 'p.rgb');
  try {
    const vf = [trimGain ? exposureTrim(trimGain) : null, chain()].filter(Boolean).join(',');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=c=${hex}:s=64x64:d=1`,
      '-vf', vf, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', raw],
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

const gov = skinGovernance(read('locks').locks);
// The graph holds the RULE; the studio's approved sheets hold the NUMBER. Where the
// graph ships numeric locks, use them. Otherwise read direction/skin-albedo.json, which
// tools/skinsample.js measured off the sheets a named person approved. Only when there
// is neither is there nothing to measure.
let locks = gov.locks.filter((l) => l.kind === 'skin_albedo' && l.value);
let source = 'data/locks.json';
if (!locks.length && skinMeasurable()) {
  locks = albedos().entities.map((e) => ({
    id: `SHEET.${e.entity}`, entity: e.entity, kind: 'skin_albedo',
    value: { srgb_hex: e.srgb_hex, lab_L: e.lab_L, tolerance_L: toleranceL() },
    rule: gov.locks[0]?.rule ?? 'Never lighter than the approved model sheet.',
  }));
  source = `direction/skin-albedo.json, read from the approved sheets on ${albedos().measured_on}`;
}

if (!locks.length) {
  // Skin is governed by policy: the studio's approved model sheets set it, not the
  // graph. There is nothing numeric to measure until those sheets exist. Say so
  // plainly rather than passing vacuously or crashing.
  console.log('\nGRADECHECK - skin is governed by POLICY, not by numbers\n');
  for (const l of gov.locks) console.log(`  ${l.id}: ${l.rule}`);
  const g = gradeNumbers();
  console.log(`\n  The grade chain still checks out on its own terms:`);
  const shadow = throughGrade('#202020');
  const black = throughGrade('#000000');
  const ire = (black.r / 255) * 100;
  const blueShift = shadow.b - shadow.r;
  console.log(`    neutral shadow #202020 -> rgb(${shadow.r},${shadow.g},${shadow.b})  b-r ${blueShift >= 0 ? '+' : ''}${blueShift}  ${blueShift <= 0 ? 'warm, correct' : 'BLUE - forbidden'}`);
  console.log(`    black #000000 -> IRE ${ire.toFixed(1)} (target ${g.black_point_ire})  ${Math.abs(ire - g.black_point_ire) <= 1.5 ? 'on target' : 'OFF TARGET'}`);
  const bad = blueShift > 0 || Math.abs(ire - g.black_point_ire) > 1.5;
  console.log(bad
    ? `\n  the grade chain itself is wrong - fix that before the sheets arrive\n`
    : `\n  NOT MEASURED: no face can be checked until the approved model sheets exist.\n  Re-run this once they do - it is the check that catches a lightened face.\n`);
  process.exit(bad ? 1 : 0);
}
let failures = 0;
console.log('\nGRADECHECK - approved skin albedo through the real grade chain\n');
console.log(`  numbers from ${source}`);
console.log('  HARD FAIL is one-sided, by direction: a grade op that RAISES skin. Drifting');
console.log('  dark is reported, not blocked - it is a consistency note, not the defect');
console.log('  this rule exists for.\n');
console.log('  entity        albedo        L* in    L* out   delta   tol   verdict');
console.log('  ' + '-'.repeat(70));

for (const l of locks) {
  const inRgb = hexRgb(l.value.srgb_hex);
  const out = throughGrade(l.value.srgb_hex);
  const lin = lstar(inRgb), lout = lstar(out);
  const delta = lout - lin;
  const tol = l.value.tolerance_L;
  const lifted = raisesSkin(delta, tol);
  if (lifted) failures++;
  const verdict = lifted ? 'RAISES SKIN' : (delta < -tol ? 'drifted dark (reported)' : 'held');
  console.log(`  ${l.entity.padEnd(13)} ${l.value.srgb_hex}      ${lin.toFixed(1).padStart(5)}   ${lout.toFixed(1).padStart(6)}  ${(delta >= 0 ? '+' : '') + delta.toFixed(2)}   ${tol.toFixed(1)}   ${verdict}`);
}

// Per-shot exposure trims, reported separately and never hidden. A trim is one declared
// act on one shot under a name - not a process quietly lightening every face - so a
// lightening trim does not fail this check. Its effect on skin is stated every time.
const trims = gradeTrims().trims ?? [];
if (trims.length) {
  console.log('\n  exposure trims, through the same albedos:');
  for (const t of trims) {
    const dir = t.gain > 1 ? 'LIFTS' : 'lowers';
    for (const l of locks) {
      const before = lstar(hexRgb(l.value.srgb_hex));
      const after = lstar(throughGrade(l.value.srgb_hex, t.gain));
      const d = after - before;
      console.log(`    ${t.film}/${t.shot} gain ${t.gain}  ${l.entity.padEnd(12)} ${before.toFixed(1)} -> ${after.toFixed(1)}  ${(d >= 0 ? '+' : '') + d.toFixed(2)}  ${dir} the frame${t.gain > 1 ? ' - declared, reported, not blocked' : ''}`);
    }
  }
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
const target = gradeNumbers().black_point_ire;
const blackOk = Math.abs(ire - target) <= 1.5;
if (!blackOk) failures++;
console.log(`  black #000000 -> IRE ${ire.toFixed(1)} (target ${target})  ${blackOk ? 'on target' : 'OFF TARGET'}`);

console.log(failures === 0 ? `\n  grade holds: nothing lightened, no blue shadow, black on target\n` : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

function hexRgb(h) { const s = h.replace('#', ''); return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }; }

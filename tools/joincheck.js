#!/usr/bin/env node
// joincheck - do the continuous joins actually join?
// A continuous join opens on the frame the previous film closed on and carries room
// tone across with no reseat. Checked against the treatments, so it fails long before
// anyone watches a seam.
import { read, treatment } from '../lib/store.js';

const joins = read('transitions').joins.filter((j) => j.kind === 'continuous');
const tone = read('transitions').room_tone;
let failures = 0, checked = 0, skipped = 0;

console.log('\nJOINCHECK - continuous joins across arc 7\n');

for (const j of joins) {
  const a = treatment(j.from), b = treatment(j.to);
  if (!a || !b) {
    skipped++;
    console.log(`  ${j.from} -> ${j.to}   not checkable: ${!a ? j.from : j.to} has no treatment yet`);
    continue;
  }
  checked++;
  const close = a.shots[a.shots.length - 1];
  const open = b.shots[0];
  const problems = [];

  for (const k of ['size', 'lens_mm', 'height', 'camera_move']) {
    if (close[k] !== open[k]) problems.push(`${k}: ${j.from} closes on ${close[k]}, ${j.to} opens on ${open[k]}`);
  }
  const ca = JSON.stringify((close.entities ?? []).slice().sort());
  const ob = JSON.stringify((open.entities ?? []).slice().sort());
  if (ca !== ob) problems.push(`in frame: ${j.from} closes on ${ca}, ${j.to} opens on ${ob}`);
  if (close.expression !== open.expression) problems.push(`expression: "${close.expression}" -> "${open.expression}"`);
  if (j.room_tone !== 'carry') problems.push('room tone is not declared as carried');
  if (!j.shared_frame) problems.push('the join does not declare a shared frame');

  if (problems.length) failures++;
  console.log(`  ${j.from} -> ${j.to}   ${problems.length ? 'SEAM' : 'continuous'}`);
  for (const p of problems) console.log(`      ${p}`);
}

console.log(`\n  room tone ${tone.id} at ${tone.lufs} LUFS, carried across every continuous join`);
console.log(failures === 0
  ? `  ${checked} join(s) checked, ${skipped} not yet checkable, no seam\n`
  : `  ${failures} of ${checked} joins would show a seam\n`);
process.exit(failures === 0 ? 0 : 1);

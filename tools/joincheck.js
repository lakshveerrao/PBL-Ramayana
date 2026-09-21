#!/usr/bin/env node
// joincheck - do the continuous joins actually join?
//
// A continuous join opens on the frame the previous film closed on, and room tone
// carries with no reseat. The binding evidence is `continues_from` on the opening
// shot - not the performance note, which may legitimately read differently on either
// side of the cut ("shock" closing, "shock, settling" opening) because it describes
// the beat, not the frame.
import { read, treatment } from '../lib/store.js';
import { joins as normJoins, roomTone } from '../lib/graph.js';

// A shot may be referred to by its full id ("02-18") or by its number within the
// film ("18"). Both name the same frame.
const sameShot = (ref, id) => {
  if (ref === id) return true;
  const n = String(ref).replace(/^.*[\/-]/, '').replace(/^0+/, '');
  const m = String(id).replace(/^.*-/, '').replace(/^0+/, '');
  return n === m;
};

const joins = normJoins().filter((j) => j.kind === 'continuous');
const rt = roomTone();
let failures = 0, checked = 0, skipped = 0;

console.log('\nJOINCHECK - continuous joins\n');

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

  // 1. The opening shot must SAY it continues, and say from where.
  const cf = open.continues_from;
  if (!cf) {
    problems.push(`${j.to} shot ${open.id} does not declare continues_from`);
  } else {
    const ref = typeof cf === 'string' ? cf : `${cf.film ?? ''}/${cf.shot ?? ''}`;
    if (!ref.includes(j.from)) problems.push(`${j.to} shot ${open.id} continues from "${ref}", not from ${j.from}`);
    // "M2/18" names shot 18 of M2, whose id is "02-18". Both notations are in use.
    const shot = typeof cf === 'string' ? cf.split(/[\/ ]/).pop() : cf.shot;
    if (shot && !sameShot(shot, close.id)) {
      problems.push(`${j.to} opens on ${j.from}/${shot}, but ${j.from} closes on ${close.id}`);
    }
  }

  // 2. It must be the same frame: same size, lens, height, camera, and people.
  for (const k of ['size', 'lens_mm', 'height', 'camera_move']) {
    if (close[k] !== open[k]) problems.push(`${k}: ${j.from} closes on ${close[k]}, ${j.to} opens on ${open[k]}`);
  }
  const ca = JSON.stringify((close.entities ?? []).slice().sort());
  const ob = JSON.stringify((open.entities ?? []).slice().sort());
  if (ca !== ob) problems.push(`in frame: ${j.from} closes on ${ca}, ${j.to} opens on ${ob}`);

  // 3. The opening shot is a held frame, not a new generation.
  if (open.source === 'generate') problems.push(`${j.to} shot ${open.id} is source=generate - a continuous join opens on a frame that already exists`);

  // 4. Tone carries.
  if (j.room_tone !== 'carry') problems.push('room tone is not carried across this join');

  if (problems.length) failures++;
  console.log(`  ${j.from} -> ${j.to}   ${problems.length ? 'SEAM' : 'continuous'}`);
  for (const p of problems) console.log(`      ${p}`);
}

console.log(`\n  room tone: ${rt.rule}`);
console.log(failures === 0
  ? `  ${checked} join(s) checked, ${skipped} not yet checkable, no seam\n`
  : `  ${failures} of ${checked} joins would show a seam\n`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
// freeze_film - freeze every declared lamp in a film, in one pass, and verify each.
//
// Shot by shot was how this started and it does not scale: there are lit lamps in
// nearly every M1 shot - tall standing lamps in the background of half of them, lamps
// at the edges of others - so a flame was drifting somewhere in almost every shot while
// only a handful were frozen.
//
// direction/<film>-flame-freeze.json holds the regions, found by a person looking at
// each approved still. This applies them all and runs the director's test on every one:
// the bright-pixel centroid inside the mask must not move, and nothing flame-sized may
// come loose near it.
import { ROOT } from '../lib/store.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const filmId = process.argv[2] ?? 'M1';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)?.split(',');
const spec = JSON.parse(readFileSync(join(ROOT, 'direction', `${filmId.toLowerCase()}-flame-freeze.json`), 'utf8'));
const outDir = join(ROOT, 'assets', 'motion', filmId, 'frozen');
mkdirSync(outDir, { recursive: true });

const stillOf = (shot) => ['png', 'jpg', 'jpeg']
  .map((e) => join(ROOT, 'assets', 'stills', filmId, `${shot}.${e}`))
  .find((p) => existsSync(p));

const py = (script, args) => JSON.parse(execFileSync('python3', [join(ROOT, 'tools', script), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }));

const shots = Object.keys(spec.shots).filter((s) => !only || only.includes(s)).sort();
console.log(`\nFREEZE ${filmId} - ${shots.length} shots, ${shots.reduce((a, s) => a + spec.shots[s].regions.length, 0)} lamps\n`);
let fails = 0;
for (const shot of shots) {
  const clip = join(ROOT, 'assets', 'motion', filmId, `${shot}.mp4`);
  if (!existsSync(clip)) { console.log(`  ${shot}  no clip - skipped`); continue; }
  const regions = JSON.stringify(spec.shots[shot].regions);
  const out = join(outDir, `${shot}.mp4`);
  const mask = join(outDir, `${shot}.mask.png`);

  const before = py('flameverify.py', [clip, regions]);
  const r = py('flamefreeze.py', [`--regions=${regions}`, clip, stillOf(shot), out]);
  if (!r.ok || r.frozen === false) {
    fails++;
    console.log(`  ${shot}  REFUSED  ${r.reason}`);
    if (r.regions_with_motion) for (const h of r.regions_with_motion) console.log(`      region ${JSON.stringify(h.region)} has motion ${h.motion}`);
    continue;
  }
  const after = py('flameverify.py', [clip.replace(`/${shot}.mp4`, `/frozen/${shot}.mp4`), regions, mask]);
  // The pass is the MASK-CORE drift. The ring-around-the-mask number is reported but no
  // longer decides anything: once a mask is large the ring wraps it, everything bright
  // around it joins into one component, and its centroid mixes a dozen independent
  // objects - 01-05 reported a "30 px mover" that was a 231x624 ring blob wrapped round
  // the lamp. What remains moving in the whole frame is people, their gold and their
  // cloth, which the director's own test exempts, so that half of it is decided by
  // watching and not by a number.
  const ok = after.centroid_drift_px <= 1.0;
  if (!ok) fails++;
  console.log(`  ${shot}  ${String(spec.shots[shot].regions.length).padStart(2)} lamp(s)  mask ${(r.mask_fraction * 100).toFixed(2)}%  `
    + `drift ${before.centroid_drift_px.toFixed(2)} -> ${after.centroid_drift_px.toFixed(3)}  `
    + `(ring ${after.worst_nearby_blob_drift_px.toFixed(1)}px, reported only)  ${ok ? 'OK' : 'CHECK'}`);
}
console.log(`\n  ${shots.length - fails} of ${shots.length} shots clean. Nothing is approved.\n`);
process.exit(fails ? 1 : 0);

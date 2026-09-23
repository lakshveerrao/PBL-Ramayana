#!/usr/bin/env node
import { assemble, probe, plan } from '../lib/assemble.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstDirected, read, ROOT } from '../lib/store.js';
import { frame as graphFrame } from '../lib/graph.js';
import { directedTreatment } from '../lib/cut.js';

const filmId = process.argv[2] ?? firstDirected();
const langs = (process.argv[3] ?? Object.keys(read('narrator').languages).join(',')).split(',');
const p = plan(filmId);

console.log(`\nASSEMBLE ${filmId} - ${p.shots.length} shots, ${p.totalFrames} frames at ${p.fps}fps = ${p.duration_s}s`);
let reported = false;
if (p.placeholders) console.log(`  ${p.placeholders} of ${p.shots.length} frames are PLACEHOLDER cards - no render exists for them yet.\n`);

const t = directedTreatment(filmId);
for (const lang of langs) {
  const r = await assemble(filmId, lang);
  const pr = probe(r.file);
  // The DIRECTED treatment's length, not the frozen package's. Cutting 01-01 took M1
  // from 963 frames to 885, and checking the delivered film against 963 reported a
  // MISMATCH on a film that is exactly the length the cut says it should be.
  const expected = Math.round(t.duration_s * t.fps);
  const fr = graphFrame();
  const ok = pr.width === fr.width && pr.height === fr.height && pr.fps === t.fps && pr.frames === expected;
  console.log(`  ${r.file.padEnd(18)} ${pr.width}x${pr.height} ${pr.fps}fps  ${pr.frames} frames (want ${expected})  ${pr.duration_s.toFixed(3)}s  ${ok ? 'OK' : 'MISMATCH'}`);
  if (r.animated?.length && !reported) {
    console.log(`  ${r.animated.length} shot(s) animated: ${r.animated.join(', ')}`);
    const held = p.shots.filter((s) => !r.animated.includes(s.id)).map((s) => s.id);
    if (held.length) console.log(`  ${held.length} held as frames: ${held.join(', ')}`);
    // Only shots that are still IN the film. 01-01's lamp was frozen and then 01-01 was
    // cut; listing it would report work on a shot nobody will see.
    const inFilm = new Set(p.shots.map((s) => s.id));
    const fz = (existsSync(join(ROOT, 'direction', `${filmId.toLowerCase()}-flame-freeze.json`))
      ? Object.keys(JSON.parse(readFileSync(join(ROOT, 'direction', `${filmId.toLowerCase()}-flame-freeze.json`), 'utf8')).shots ?? {})
      : []).filter((id) => inFilm.has(id)).sort();
    if (fz.length) console.log(`  ${fz.length} with a lamp frozen: ${fz.join(', ')}`);
    if (p.cut?.length) console.log(`  ${p.cut.length} cut: ${p.cut.join(', ')}`);
    reported = true;
  }
}
console.log('');

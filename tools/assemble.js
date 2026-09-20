#!/usr/bin/env node
import { assemble, probe, plan } from '../lib/assemble.js';
import { firstDirected, read } from '../lib/store.js';
import { treatment } from '../lib/store.js';

const filmId = process.argv[2] ?? firstDirected();
const langs = (process.argv[3] ?? Object.keys(read('narrator').languages).join(',')).split(',');
const p = plan(filmId);

console.log(`\nASSEMBLE ${filmId} - ${p.shots.length} shots, ${p.totalFrames} frames at ${p.fps}fps = ${p.duration_s}s`);
if (p.placeholders) console.log(`  ${p.placeholders} of ${p.shots.length} frames are PLACEHOLDER cards - no render exists for them yet.\n`);

const t = treatment(filmId);
for (const lang of langs) {
  const r = await assemble(filmId, lang);
  const pr = probe(r.file);
  const expected = Math.round(t.duration_s * t.fps);
  const fr = read('typography').frame;
  const ok = pr.width === fr.width && pr.height === fr.height && pr.fps === t.fps && pr.frames === expected;
  console.log(`  ${r.file.padEnd(18)} ${pr.width}x${pr.height} ${pr.fps}fps  ${pr.frames} frames (want ${expected})  ${pr.duration_s.toFixed(3)}s  ${ok ? 'OK' : 'MISMATCH'}`);
}
console.log('');

#!/usr/bin/env node
/**
 * atmos_film - run the atmosphere pass over a whole film.
 *
 * Every shot gets the same air and the same grade, so the film reads as one room on one
 * morning. What differs per shot is the camera, which is authored in
 * direction/<film>-atmos.json against that shot's own beat, and the light gain, which
 * follows the shot's declared `lit` - back-keyed air glows, frontlit air does not.
 *
 * A shot that was ANIMATED keeps its generative clip and gets air and grade only, with
 * the camera left alone: those four shots move because people move in them, and putting
 * a push on top of a walk is two moves fighting. The held stills move because the camera
 * does. Every shot ends up with exactly its own frame count, so the result drops into
 * assemble where the still or the clip was.
 *
 *   node tools/atmos_film.js [film] [shot,shot,...]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { ROOT, firstDirected, read } from '../lib/store.js';
import { plan, frameFor, motionClipFor } from '../lib/assemble.js';
import { frame as graphFrame } from '../lib/graph.js';

const filmId = process.argv[2] ?? firstDirected();
const only = (process.argv[3] ?? '').split(',').filter(Boolean);

const dirPath = join(ROOT, 'direction', `${filmId.toLowerCase()}-atmos.json`);
if (!existsSync(dirPath)) {
  console.error(`no atmosphere direction for ${filmId} - expected direction/${filmId.toLowerCase()}-atmos.json`);
  process.exit(1);
}
const D = JSON.parse(readFileSync(dirPath, 'utf8'));
const fr = graphFrame();
const p = plan(filmId);
const outDir = join(ROOT, 'renders', filmId, 'atmos');
mkdirSync(outDir, { recursive: true });
const work = join(ROOT, 'out', '_work', filmId, 'atmos');
mkdirSync(work, { recursive: true });

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

console.log(`\nATMOSPHERE ${filmId} - ${p.shots.length} shots, ${p.totalFrames} frames at ${p.fps}fps\n`);
let done = 0, skipped = 0;
for (const s of p.shots) {
  const d = D.shots?.[s.id];
  if (!d) { console.log(`  ${s.id}  no direction - skipped`); skipped++; continue; }
  if (only.length && !only.includes(s.id)) { skipped++; continue; }

  // The source. A clip shot uses its generative clip; everything else uses the still the
  // treatment resolves to, following reuse_of - 01-15 is 01-13's frame again, and 01-16
  // is 01-14's.
  let source, sourceKind, tiedTo;
  if (d.kind === 'clip') {
    source = motionClipFor(filmId, s.id);
    if (!source) { console.log(`  ${s.id}  direction says clip but no motion clip resolves - skipped`); skipped++; continue; }
    sourceKind = 'clip';
    tiedTo = join(ROOT, 'renders', filmId, 'motion', `${s.id}.json`);
  } else {
    if (s.frame.placeholder) { console.log(`  ${s.id}  no still - skipped`); skipped++; continue; }
    source = join(ROOT, s.frame.path);
    sourceKind = 'still';
    tiedTo = join(ROOT, 'renders', filmId, `${s.frame.from}.json`);
  }

  const spec = {
    source, source_kind: sourceKind, frames: s.frames,
    protect: d.protect ?? [], lit: d.lit ?? 'keyed', seed: d.seed ?? 5,
    zoom_from: d.zoom_from ?? 1.0, zoom_to: d.zoom_to ?? 1.0,
    bg_from: d.bg_from ?? d.zoom_from ?? 1.0, bg_to: d.bg_to ?? d.zoom_to ?? 1.0,
    anchor: d.anchor ?? [0.5, 0.5], pan: d.pan ?? [0, 0],
    parallax_kind: d.parallax_kind ?? 'none',
    ease: d.ease ?? 'inout', hold: d.hold ?? 0.82,
  };
  if (spec.parallax_kind === 'matte') {
    const m = join(ROOT, 'assets', 'atmos', filmId, `${d.matte_of ?? s.id}_matte.png`);
    if (!existsSync(m)) { console.log(`  ${s.id}  parallax is matte but ${m} is missing - skipped`); skipped++; continue; }
    spec.matte = m;
  }
  const specFile = join(work, `${s.id}.json`);
  writeFileSync(specFile, JSON.stringify(spec, null, 2));

  const clipRel = `renders/${filmId}/atmos/${s.id}.mp4`;
  const clipAbs = join(ROOT, clipRel);
  // Raw frames straight into the encoder. -frames:v is what makes the count exact; a
  // duration in seconds does not survive 2.2s at 30fps, which is how an earlier build
  // landed a shot one frame late.
  const py = spawnSync('python3', [join(ROOT, 'tools', 'atmos.py'), specFile], { maxBuffer: 1 << 30 });
  if (py.status !== 0) {
    console.error(`  ${s.id}  FAILED\n${py.stderr?.toString().split('\n').slice(-12).join('\n')}`);
    process.exit(1);
  }
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
    '-s', `${fr.width}x${fr.height}`, '-r', String(p.fps), '-i', '-', '-frames:v', String(s.frames),
    '-vf', 'noise=alls=5:allf=t+u,format=yuv420p', '-c:v', 'libx264', '-crf', '15', '-preset', 'medium',
    clipAbs], { input: py.stdout, maxBuffer: 1 << 30 });
  if (ff.status !== 0) {
    console.error(`  ${s.id}  ENCODE FAILED\n${ff.stderr?.toString()}`);
    process.exit(1);
  }
  const got = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', clipAbs]).toString().trim());
  if (got !== s.frames) {
    console.error(`  ${s.id}  ${got} frames, wanted ${s.frames} - refusing to record a clip the cut cannot use`);
    process.exit(1);
  }

  // Tie the clip to what it was made FROM, the way motion clips are tied to their still:
  // re-supply the still and this clip becomes a picture of a frame that no longer exists.
  let tie = null;
  if (existsSync(tiedTo)) {
    const r = JSON.parse(readFileSync(tiedTo, 'utf8'));
    tie = r.sha256 ?? (r.clip && existsSync(join(ROOT, r.clip)) ? sha(join(ROOT, r.clip)) : null);
  }
  writeFileSync(join(outDir, `${s.id}.json`), JSON.stringify({
    film: filmId, shot: s.id, clip: clipRel, frames: s.frames, fps: p.fps,
    source: sourceKind === 'still' ? s.frame.path : source.replace(ROOT + '/', ''),
    source_kind: sourceKind, source_sha256: tie,
    beat: d._beat ?? null, move: d._move ?? null, spec,
    bytes: statSync(clipAbs).size, made: new Date().toISOString(),
  }, null, 2) + '\n');

  const mv = spec.zoom_from === spec.zoom_to && !spec.pan[0] && !spec.pan[1]
    ? 'locked' : `${spec.zoom_from.toFixed(3)}->${spec.zoom_to.toFixed(3)}`;
  console.log(`  ${s.id}  ${String(s.frames).padStart(3)}f  ${sourceKind.padEnd(5)}  ${mv.padEnd(14)}  ${spec.parallax_kind.padEnd(6)}  ${(spec.lit).padEnd(10)}  ${(d._beat ?? '')}`);
  done++;
}
console.log(`\n  ${done} rendered, ${skipped} skipped\n`);

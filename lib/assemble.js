// assemble.js - frames held for their exact durations, graded, grained, captioned.
//
// Timings come from the shot list in frames, never in seconds: a concat demuxer given
// float durations drifts, and a 44s film that ends at 44.03s is a defect.
import { read, treatment, ensureDir, ROOT } from './store.js';
import { frame as graphFrame, sharedPlateFor } from './graph.js';
import { chain as gradeChain, grainChain } from './grade.js';
import { ass, burnFilter, burnPlan } from './subtitle.js';
import { loadRecord } from './render.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function frameFor(filmId, shot) {
  // A reuse or a crop resolves to the frame it points at. Inside a film that is
  // reuse_of or crop_of; ACROSS films a treatment cannot say, because it only knows its
  // own shots, so the chain comes from HANDOFF §7 via direction/shared-plates.json.
  // Without it the fallback below lands on the shot's own id, finds no render, and lays
  // a placeholder - the still sage would have been a placeholder card in M3, M4 and M5.
  let sourceFilm = filmId;
  let id = shot.reuse_of ?? shot.crop_of ?? null;
  if (!id && shot.source !== 'generate') {
    const shared = sharedPlateFor(filmId, shot.id);
    if (shared) { sourceFilm = shared.film; id = shared.shot; }
  }
  id = id ?? shot.id;

  // A chain can be two links long: M4/04-06 crops M4/04-04, which reuses M4/04-01,
  // which shows M2/02-03. Follow it to the frame that was actually made.
  for (let hop = 0; hop < 8; hop++) {
    const rec0 = loadRecord(sourceFilm, id);
    if (rec0) break;
    const t0 = treatment(sourceFilm);
    const s0 = t0?.shots?.find((x) => x.id === id);
    if (!s0 || s0.source === 'generate') break;
    const next = s0.reuse_of ?? s0.crop_of ?? null;
    if (next) { id = next; continue; }
    const shared = sharedPlateFor(sourceFilm, s0.id);
    if (!shared) break;
    sourceFilm = shared.film; id = shared.shot;
  }

  const rec = loadRecord(sourceFilm, id);
  if (rec?.local_path && existsSync(join(ROOT, rec.local_path))) {
    return { path: rec.local_path, placeholder: false, from: id, from_film: sourceFilm };
  }
  const still = `renders/${sourceFilm}/${id}.png`;
  if (existsSync(join(ROOT, still))) return { path: still, placeholder: false, from: id, from_film: sourceFilm };
  return { path: null, placeholder: true, from: id, from_film: sourceFilm };
}

// A placeholder card. It is not the film and never pretends to be: it carries the shot
// id, the lens, and a swatch at the locked albedo so the grade can be measured through
// the finished video rather than only on a test patch.
export function makePlaceholder(filmId, shot, outPath) {
  const typo = graphFrame();
  const locks = read('locks').locks;
  const entity = (shot.entities ?? [])[0];
  const lock = entity ? locks.find((l) => l.kind === 'skin_albedo' && l.entity === entity) : null;
  const swatch = lock?.value.srgb_hex ?? '#3A322A';
  const font = burnPlan('en').font_file;

  const label = `${shot.id}  ${shot.size} ${shot.lens_mm}mm`.replace(/:/g, '\\:');
  const sub = `${shot.source}${entity ? '  ' + entity : ''}  PLACEHOLDER`.replace(/:/g, '\\:');

  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=0x1C1814:s=${typo.width}x${typo.height}:d=1`,
    '-vf', [
      `drawbox=x=0:y=${Math.round(typo.height * 0.34)}:w=${typo.width}:h=${Math.round(typo.height * 0.30)}:color=${swatch}:t=fill`,
      `drawtext=fontfile='${font}':text='${label}':fontcolor=0xE8E0D4:fontsize=54:x=(w-text_w)/2:y=${Math.round(typo.height * 0.22)}`,
      `drawtext=fontfile='${font}':text='${sub}':fontcolor=0x9A8F81:fontsize=34:x=(w-text_w)/2:y=${Math.round(typo.height * 0.70)}`,
    ].join(','),
    '-frames:v', '1', '-y', outPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  return outPath;
}

export function plan(filmId) {
  const t = treatment(filmId);
  const fps = t.fps;
  const shots = t.shots.map((s) => {
    const frames = Math.round(s.duration_s * fps);
    return { ...s, frames, frame: frameFor(filmId, s) };
  });
  const totalFrames = shots.reduce((a, s) => a + s.frames, 0);
  return {
    film: filmId, fps, totalFrames,
    expected_frames: Math.round(t.duration_s * fps),
    duration_s: totalFrames / fps,
    shots,
    placeholders: shots.filter((s) => s.frame.placeholder).length,
  };
}

export async function assemble(filmId, lang, { outDir = 'out' } = {}) {
  const t = treatment(filmId);
  const p = plan(filmId);
  if (p.totalFrames !== p.expected_frames) {
    throw new Error(`shot list totals ${p.totalFrames} frames but the film declares ${p.expected_frames}`);
  }

  const work = ensureDir(`${outDir}/_work/${filmId}`);
  const out = ensureDir(outDir);

  // 1. Resolve every frame, making a placeholder card where no render exists.
  const files = [];
  for (const s of p.shots) {
    let path;
    if (s.frame.placeholder) {
      path = join(work, `${s.id}.png`);
      makePlaceholder(filmId, s, path);
    } else {
      path = join(ROOT, s.frame.path);
    }
    files.push({ id: s.id, path, frames: s.frames });
  }

  // 2. One video segment per shot, each of EXACTLY its frame count.
  //
  // This used to hand the concat demuxer a list of `duration` lines in decimal seconds
  // - (frames / fps).toFixed(6) - under a comment claiming they were exact frame counts
  // expressed as a rational. They are neither: 2.2 has no exact decimal at 30fps, the
  // demuxer accumulates the error across sixteen entries, and six of M1's thirteen cuts
  // landed ONE FRAME LATE. The film was still 963 frames, so nothing downstream noticed;
  // cutcheck did, by finding the frame at a boundary identical to the frame before it.
  //
  // A segment built with -frames:v N has exactly N frames by construction. Concatenating
  // segments carries no durations to round.
  const segDir = join(work, 'seg');
  mkdirSync(segDir, { recursive: true });
  const segs = [];
  for (const f of files) {
    const seg = join(segDir, `${f.id}.mkv`);
    // Every segment is built AT THE FRAME SIZE. The concat demuxer cannot carry a
    // resolution change: with 01-01 and 01-03 at 1152x2048 and the rest at 1080x1920,
    // it re-initialised mid-stream and the encode came out at 132 Mbps - 507MiB for 32
    // seconds of held stills, where each shot alone compresses to about a megabyte.
    // Normalising here also means the final pass no longer scales, so the grade and the
    // grain see exactly the pixels that will ship.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-loop', '1', '-framerate', String(p.fps), '-i', f.path,
      '-frames:v', String(f.frames),
      '-vf', `scale=${graphFrame().width}:${graphFrame().height}:force_original_aspect_ratio=decrease:flags=lanczos,`
           + `pad=${graphFrame().width}:${graphFrame().height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      '-c:v', 'ffv1', '-pix_fmt', 'rgb24', '-y', seg], { stdio: ['ignore', 'ignore', 'pipe'] });

    // A segment that is not the frame size would silently corrupt the concat.
    const dims = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x', seg], { encoding: 'utf8' }).trim();
    if (dims !== `${graphFrame().width}x${graphFrame().height}`) {
      throw new Error(`segment ${f.id} is ${dims}, not ${graphFrame().width}x${graphFrame().height} - the concat demuxer cannot carry a resolution change`);
    }
    segs.push(seg);
  }
  const listPath = join(work, 'concat.txt');
  writeFileSync(listPath, segs.map((x) => `file '${x.replace(/'/g, "'\\''")}'`).join('\n') + '\n', 'utf8');

  // 3. The subtitle script, pinned to the real frame size.
  const assPath = join(work, `${filmId}.${lang}.ass`);
  writeFileSync(assPath, ass(t, lang), 'utf8');

  // 4. Grade, then grain, then the caption. The caption must not sit in the grain.
  const vf = [
    gradeChain(),
    grainChain(),
    burnFilter(assPath, lang),
    `fps=${p.fps}`,
  ].filter(Boolean).join(',');

  const outFile = join(out, `${filmId}.${lang}.mp4`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', vf,
    '-frames:v', String(p.totalFrames),
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '18',
    '-r', String(p.fps), '-y', outFile], { stdio: ['ignore', 'ignore', 'pipe'] });

  return { film: filmId, lang, file: `${outDir}/${filmId}.${lang}.mp4`, frames: p.totalFrames, fps: p.fps, duration_s: p.duration_s, placeholders: p.placeholders };
}

export function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration',
    '-of', 'json', join(ROOT, file)], { encoding: 'utf8' });
  const s = JSON.parse(out).streams[0];
  const [n, d] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: n / d, frames: Number(s.nb_frames), duration_s: Number(s.duration) };
}

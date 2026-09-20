// assemble.js - frames held for their exact durations, graded, grained, captioned.
//
// Timings come from the shot list in frames, never in seconds: a concat demuxer given
// float durations drifts, and a 44s film that ends at 44.03s is a defect.
import { read, treatment, ensureDir, ROOT } from './store.js';
import { chain as gradeChain, grainChain } from './grade.js';
import { ass, burnFilter, burnPlan } from './subtitle.js';
import { loadRecord } from './render.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function frameFor(filmId, shot) {
  // A reuse or a crop resolves to the frame it points at.
  const id = shot.reuse_of ?? shot.crop_of ?? shot.id;
  const rec = loadRecord(filmId, id);
  if (rec?.local_path && existsSync(join(ROOT, rec.local_path))) return { path: rec.local_path, placeholder: false, from: id };
  const still = `renders/${filmId}/${id}.png`;
  if (existsSync(join(ROOT, still))) return { path: still, placeholder: false, from: id };
  return { path: null, placeholder: true, from: id };
}

// A placeholder card. It is not the film and never pretends to be: it carries the shot
// id, the lens, and a swatch at the locked albedo so the grade can be measured through
// the finished video rather than only on a test patch.
export function makePlaceholder(filmId, shot, outPath) {
  const typo = read('typography').frame;
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

  // 2. The concat list. Durations in exact frame counts, expressed as a rational.
  const listPath = join(work, `concat.txt`);
  const lines = [];
  for (const f of files) {
    lines.push(`file '${f.path.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${(f.frames / p.fps).toFixed(6)}`);
  }
  // The concat demuxer drops the final entry's duration unless the file repeats.
  lines.push(`file '${files[files.length - 1].path.replace(/'/g, "'\\''")}'`);
  writeFileSync(listPath, lines.join('\n') + '\n', 'utf8');

  // 3. The subtitle script, pinned to the real frame size.
  const assPath = join(work, `${filmId}.${lang}.ass`);
  writeFileSync(assPath, ass(t, lang), 'utf8');

  // 4. Grade, then grain, then the caption. The caption must not sit in the grain.
  const vf = [
    `scale=${read('typography').frame.width}:${read('typography').frame.height}:force_original_aspect_ratio=decrease`,
    `pad=${read('typography').frame.width}:${read('typography').frame.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
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

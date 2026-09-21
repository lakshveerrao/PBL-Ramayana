#!/usr/bin/env node
// platecheck - measure a set of anchor candidates instead of asserting about them.
//
//   node tools/platecheck.js assets/sheets/VISHVAMITRA/candidates
//
// Two things it can actually measure, and it reports nothing it cannot:
//
//   BLANK   a frame with no picture in it. fal returns a black frame when its own
//           filter rejects a generation, and bills for it. One of ten came back black
//           and was recorded as a candidate, because nothing looked.
//   L*      mean lightness over the whole plate and over the band where a face sits in
//           a 9:16 portrait. LOCK.SKIN.POLICY forbids lightening, so a face band well
//           above its siblings is worth looking at. It is a FLAG, not a verdict: the
//           band contains background as well as face, so a pale wall pushes it up and
//           a dark one pulls it down. Use it to decide what to look at, never to decide.
//
// It does NOT judge a face, a fabric or a marking. Those need eyes.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// sRGB -> L*, the same relative-luminance path gradecheck uses, so the numbers here
// and there mean the same thing.
function lstar(mean8) {
  const y = mean8 / 255;
  const lin = y <= 0.04045 ? y / 12.92 : ((y + 0.055) / 1.055) ** 2.4;
  return lin <= 216 / 24389 ? lin * 24389 / 27 : 116 * Math.cbrt(lin) - 16;
}

function grayStats(file, crop) {
  const args = ['-v', 'error', '-i', file];
  if (crop) args.push('-vf', `crop=${crop}`);
  args.push('-f', 'rawvideo', '-pix_fmt', 'gray', '-');
  const buf = execFileSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  let sum = 0, min = 255, max = 0;
  for (const v of buf) { sum += v; if (v < min) min = v; if (v > max) max = v; }
  return { mean: sum / buf.length, min, max, pixels: buf.length };
}

export function platecheck(dir) {
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  return files.map((f) => {
    const p = join(dir, f);
    const whole = grayStats(p);
    // The middle third across, the second quarter down: where a head sits on a 9:16
    // full-figure plate.
    const face = grayStats(p, 'iw/3:ih/6:iw/3:ih/5');
    const blank = whole.max - whole.min < 12;
    return {
      file: f, bytes: statSync(p).size, blank,
      whole_L: +lstar(whole.mean).toFixed(1),
      face_L: +lstar(face.mean).toFixed(1),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error('\n  usage: node tools/platecheck.js <directory of candidates>\n'); process.exit(2); }
  const rows = platecheck(dir);
  const live = rows.filter((r) => !r.blank);
  const med = live.map((r) => r.face_L).sort((a, b) => a - b)[Math.floor(live.length / 2)] ?? 0;

  console.log('\nPLATECHECK - what can be measured. The face, the cloth and the markings need eyes.\n');
  console.log('  file             bytes    whole L*   face L*   note');
  for (const r of rows) {
    const note = r.blank ? 'BLANK - no picture. Billed and worthless.'
      : r.face_L > med + 8 ? `+${(r.face_L - med).toFixed(1)} L* over the median - look at this one for lightening (background is in the band)`
      : r.face_L < med - 8 ? `-${(med - r.face_L).toFixed(1)} L* under the median (a dark background pulls this down too)`
      : '';
    console.log(`  ${r.file.padEnd(16)} ${String(r.bytes).padStart(7)}  ${String(r.whole_L).padStart(7)}   ${String(r.face_L).padStart(7)}   ${note}`);
  }
  console.log(`\n  median face-band L* across ${live.length} live plates: ${med.toFixed(1)}`);
  console.log('  The band is face AND background. This says where to look, not what is true.');
  const blanks = rows.filter((r) => r.blank).length;
  if (blanks) console.log(`  ${blanks} blank frame(s). That is spend with nothing to show, and it should be re-run.`);
  console.log('');
}

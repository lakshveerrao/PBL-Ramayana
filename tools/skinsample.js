#!/usr/bin/env node
// skinsample - read each approved model sheet's CHEEK and write down its albedo.
//
// LOCK.SKIN.POLICY says the number is not the graph's to hold: "Exact skin values are
// production design, set by the studio's approved sheets - not by this workspace." The
// sheets exist, so the number exists.
//
// It is the CHEEK, and it is measured by tools/cheek.py - one implementation, used for
// the sheet and for the frame, because "compare like with like" is a promise that a
// second implementation would quietly break. The reference view is the
// head-and-shoulders sheet: the one whose face fills the most frame.
//
// An earlier version of this file took the DARKEST of all views, as a floor for "never
// lighter than the approved model sheet". That instinct was right for a different
// question. This one asks whether two pictures show the same skin, and that needs like
// compared with like, not a floor.
import { ROOT, ensureDir, assetsDir } from '../lib/store.js';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function cheekOf(files) {
  const out = execFileSync('python3', [join(ROOT, 'tools', 'cheek.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return JSON.parse(out);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = process.argv.includes('--write');
  const dir = join(ROOT, 'assets', 'sheets');
  const sheets = readdirSync(dir).filter((d) => d.startsWith('SHEET.'));
  const swatchDir = ensureDir(`${assetsDir()}/skin`);
  console.log('\nSKIN SAMPLE - the approved sheets, read at the CHEEK\n');
  console.log('  the cheek is placed from the EYES: a disc below and outside each eye, at a');
  console.log('  fixed fraction of the interocular distance. A beard, a crown and a turn of');
  console.log('  the head do not move it.\n');
  console.log('  entity        view             pixels   sRGB      L*     face');
  console.log('  ' + '-'.repeat(72));
  const out = [];
  for (const s of sheets) {
    const entity = s.replace(/^SHEET\./, '');
    const views = readdirSync(join(dir, s)).filter((f) => /\.(png|jpe?g)$/i.test(f));
    const res = cheekOf(views.map((v) => join(dir, s, v)));
    const per = [];
    for (const v of views) {
      const r = res[join(dir, s, v)];
      if (r?.ok) per.push({ view: v, ...r });
      else console.log(`  ${entity.padEnd(13)} ${v.padEnd(16)} ${r?.reason ?? 'no result'}`);
    }
    if (!per.length) continue;
    // The head-and-shoulders sheet, measured rather than named: the view whose face
    // fills the most frame. A tight portrait gives the cheek the most pixels and the
    // least chance of catching something that is not a face.
    const chosen = per.reduce((a, x) => (x.face_fraction > a.face_fraction ? x : a));
    for (const p of per) {
      console.log(`  ${(p === chosen ? entity : '').padEnd(13)} ${p.view.padEnd(16)} ${String(p.pixels).padStart(6)}   ${p.hex}  ${p.L.toFixed(1).padStart(5)}  ${(p.face_fraction * 100).toFixed(0).padStart(3)}%${p === chosen ? '   <- taken' : ''}`);
    }
    const spread = Math.max(...per.map((x) => x.L)) - Math.min(...per.map((x) => x.L));
    if (per.length > 1) console.log(`  ${''.padEnd(13)} ${'spread across views'.padEnd(16)} ${spread.toFixed(2)} L*`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', `color=c=${chosen.hex}:s=120x120:d=1`, '-frames:v', '1', '-y', join(swatchDir, `${entity}.png`)], { stdio: ['ignore', 'ignore', 'pipe'] });
    out.push({
      entity, srgb_hex: chosen.hex, lab_L: Number(chosen.L.toFixed(2)),
      from_view: chosen.view, region: 'cheek', pixels: chosen.pixels,
      interocular_px: chosen.interocular,
      views_L: per.map((p) => ({ view: p.view, hex: p.hex, L: Number(p.L.toFixed(2)), face_fraction: p.face_fraction })),
      spread_L: Number(spread.toFixed(2)),
    });
  }
  if (!run) { console.log('\n  Nothing written. Add --write.\n'); process.exit(0); }
  writeFileSync(join(ROOT, 'direction', 'skin-albedo.json'), JSON.stringify({
    _doc: 'The measured CHEEK albedo of each approved model sheet. LOCK.SKIN.POLICY says this number is production design, set by the studio\'s approved sheets and not by the graph - so it lives here, beside the sheets it was read from, and data/ stays byte-identical.',
    _how: 'tools/cheek.py. The cheek is placed from the EYES - a disc below and outside each eye at a fixed fraction of the interocular distance - because a beard, a crown and a turn of the head do not move it, while Haar\'s face box wanders: on Dasaratha the crown pulled the box down until the "cheek" landed on his gold necklace and read L* 68.',
    _which_view: 'The head-and-shoulders sheet, measured rather than named: the view whose face fills the most frame.',
    _validated: 'The director measured the king\'s cheek by hand on 2026-09-22 and got 57.4. This reads 57.6 from the same sheet.',
    _what_it_is_for: 'Two different checks. (1) A FRAME\'s cheek is compared with the sheet\'s cheek - the same region in both - and REPORTED only outside the band below; inside it is ordinary lighting. (2) A GRADE OP that raises skin relative to the ungraded frame is a HARD FAIL. That is the defect the rule exists for.',
    _why_not_a_floor: 'An earlier version took the darkest of all views. That is the right test for "is this face lighter than it should be" and the wrong one for "is this the same skin", which is what a frame-to-sheet comparison asks.',
    _class: 'S - our staging. Read from sheets a named person approved; not a claim, and not the text\'s.',
    measured_on: new Date().toISOString().slice(0, 10),
    sheets_approved_by: 'Venkat',
    report_band_L: 10,
    _report_band_means: 'A frame\'s cheek within this of its sheet is ordinary lighting and is not reported. The director set it on 2026-09-22.',
    grade_tolerance_L: 2.0,
    _grade_tolerance_means: 'For the grade-op check only: the grade may not raise a skin L* by more than this. A quantisation allowance, not a licence.',
    entities: out,
  }, null, 2) + '\n', 'utf8');
  console.log(`\n  ${out.length} written to direction/skin-albedo.json, swatches in ${swatchDir.replace(ROOT + '/', '')}/\n`);
}

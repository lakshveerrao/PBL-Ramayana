#!/usr/bin/env node
// dryrun - exercise the pipeline end to end with mock responses. No key, no spend.
// This is what proves the wiring before a key is ever used.
import { read, treatment, firstDirected } from '../lib/store.js';
import { effectsShots } from '../lib/graph.js';
import { estimate, shotOf, renderMotion } from '../lib/render.js';
import { assemble } from '../lib/prompt.js';
import { checkFilm } from '../lib/consistency.js';
import { normaliseImage, normaliseVideo } from '../lib/fal.js';
import { estimateFilm, estimateArc, priceOf } from '../lib/cost.js';
import { srt, fitsBox, burnPlan } from '../lib/subtitle.js';
import { assertNoRestrictedText } from '../lib/sources.js';

const FILM = process.argv[2] ?? firstDirected();
const line = (s = '') => console.log(s);
const head = (s) => { line(); line(`== ${s}`); };

line(`\nDRYRUN - ${FILM}, mock responses only. No key used, nothing spent.`);

head('1. treatment loads and holds its timings');
const t = treatment(FILM);
const total = Math.round(t.shots.reduce((a, s) => a + s.duration_s, 0) * 1e6) / 1e6;
line(`   ${t.shots.length} shots, ${total}s declared ${t.duration_s}s  ${total === t.duration_s ? 'OK' : 'MISMATCH'}`);
line(`   sources: ${['generate', 'reuse', 'crop'].map((k) => `${k} ${t.shots.filter((s) => s.source === k).length}`).join(', ')}`);

head('2. the director contract, against a mock response');
const mock = {
  shots: t.shots.map((s) => ({ ...s })),
  narration: Object.fromEntries(Object.entries(t.narration).map(([k, v]) => [k, { shot: v.shot, en: v.en, speaker: v.speaker }])),
};
const contract = checkDirectorShape(mock, t);
line(`   shape: ${contract.ok ? 'OK' : 'FAILED'}${contract.ok ? '' : ' - ' + contract.problems.join('; ')}`);

head('3. the consistency gate');
const gate = checkFilm(t.shots);
line(`   ${gate.blocked} of ${gate.total} shots refused, ${gate.allowed_count} allowed`);
line(`   still allowed: ${gate.still_allowed[0] ?? 'n/a'}`);

head('4. prompt assembly, from data');
const sample = t.shots.find((s) => s.source === 'generate' && (s.entities ?? []).length);
const asm = assemble(sample, FILM);
line(`   shot ${sample.id}: prompt from ${asm.source}, ${asm.negatives.length} negatives`);
line(`   source: ${asm.assembled_from.join(' + ')}`);
const guarded = ['arch', 'dome', 'marble', 'stitched garment', 'lightened skin'].filter((b) => (asm.negative + asm.prompt).toLowerCase().includes(b));
line(`   guarded against: ${guarded.join(', ')}`);

head('5. the fal adapter against three response shapes');
for (const [name, body] of [
  ['images[].url', { images: [{ url: 'https://mock/a.png' }], seed: 1, model: 'mock-v1' }],
  ['output.images[].image_url', { output: { images: [{ image_url: 'https://mock/b.png' }], seed: 2 } }],
  ['bare string array', { output: ['https://mock/c.png'] }],
]) {
  const r = normaliseImage(body);
  line(`   ${name.padEnd(28)} -> ${r.url}`);
}
line(`   video shape                  -> ${normaliseVideo({ video: { url: 'https://mock/v.mp4' } }).url}`);

head('6. the motion refusal');
for (const id of Object.keys(effectsShots()).filter((k) => effectsShots()[k].film === FILM)) {
  try { await renderMotion(FILM, id, { allow_spend: false }); line(`   ${id}: permitted`); }
  catch (e) { line(`   ${id}: ${e.name} - ${e.name === 'MotionRefusal' ? 'refuses, correctly' : e.message.slice(0, 60)}`); }
}

head('7. money, before anything is spent');
const est = estimate(FILM);
line(`   images  ${est.shots_to_generate} x $0.025 = $${est.usd.image.toFixed(4)}`);
line(`   motion  ${est.motion_clips} clip(s)      = $${est.usd.motion.toFixed(4)}`);
line(`   voice   ${est.voice_characters} chars    = $${est.usd.voice.toFixed(4)}`);
line(`   total                         = $${est.usd.total.toFixed(4)}`);
line(`   writing one film (cached)     = $${estimateFilm({ first_film: false }).usd.toFixed(4)}`);
line(`   writing all of arc 7          = $${estimateArc(7).usd.toFixed(2)}`);

head('8. subtitles, per script');
for (const lang of Object.keys(read('narrator').languages)) {
  const p = burnPlan(lang);
  const cues = srt(t, lang).trim().split('\n\n').length;
  const bad = Object.values(t.narration).filter((n) => !fitsBox(n[lang], lang).fits);
  line(`   ${lang}  ${String(p.size_px).padStart(2)}px/${p.line_height}  box ${String(p.line_box_px).padStart(2)}px  ${cues} cues  ${bad.length ? bad.length + ' OVERRUN' : 'all fit'}  font: ${p.font_file ? p.font_file.split('/').pop() : 'MISSING'}`);
}

head('9. the rights gate on an outbound payload');
try {
  assertNoRestrictedText({ film: FILM, shots: t.shots, narration: t.narration }, 'dryrun export');
  line('   a full treatment payload passes - it carries locators, not text');
} catch (e) { line(`   REFUSED: ${e.message} ${JSON.stringify(e.detail)}`); }

head('10. the ledger');
const spend = read('spend', { fresh: true });
line(`   ${spend.totals.calls} calls, $${spend.totals.usd.toFixed(4)} spent`);

line(`\nDRYRUN complete. Nothing was sent and nothing was spent.\n`);

function checkDirectorShape(out, against) {
  const problems = [];
  if (!Array.isArray(out.shots)) problems.push('shots is not an array');
  if (!out.narration || typeof out.narration !== 'object') problems.push('narration is not an object');
  const sum = Math.round((out.shots ?? []).reduce((a, s) => a + (s.duration_s ?? 0), 0) * 1e6) / 1e6;
  if (sum !== against.duration_s) problems.push(`durations sum to ${sum}, not ${against.duration_s}`);
  for (const s of out.shots ?? []) {
    if (Math.abs(s.duration_s * 30 - Math.round(s.duration_s * 30)) > 1e-6) problems.push(`shot ${s.id} is not a whole number of frames`);
  }
  return { ok: problems.length === 0, problems };
}

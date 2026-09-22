#!/usr/bin/env node
// arc7_estimate - what the whole arc costs, by phase, at today's verified prices.
//
// PRODUCTION_ORDERS §2 asks for this at Gate 2. Nothing here is spent; it is arithmetic
// over the installed graph, and it says which numbers are verified and which are not.
import { read, treatment } from '../lib/store.js';
import { refcount } from './refcount.js';
import { allPlans } from '../lib/sheetprompt.js';
import { openaiImageCost, UNIT } from '../lib/cost.js';
import { imageModel } from '../lib/openai.js';

const QUALITY = process.env.PBL_IMAGE_QUALITY ?? 'high';
const model = imageModel();
const r = refcount();

// --- Phase A: the sheets -----------------------------------------------------------
// Four revisions conditioned on the Codex portraits, plus two back views, plus for each
// principal three further views, an expression row and a hands plate.
const plans = allPlans();
const revisions = 4 + 2;                       // Visvamitra, Rama, Laksmana, Kausalya x2 + two back views
const perCharacter = plans.map((p) => ({
  id: p.character,
  views: p.step_2_views.length,
  expressions: p.step_3_expressions.length,
  plates: p.step_4_detail_plates.length,
}));
const sheetImages = revisions + perCharacter.reduce((a, c) => a + c.views + c.expressions + c.plates, 0);

// --- Phase B: the stills -----------------------------------------------------------
const hist = r.histogram;
const stills = Object.entries(hist).map(([refs, n]) => ({ refs: Number(refs), n }));

// --- Phase C: motion ---------------------------------------------------------------
const motionShots = Object.entries(read('effects').shots ?? {}).filter(([, v]) => v.motion === true).length;

// --- Phase D: sound ----------------------------------------------------------------
const langs = Object.keys(read('narrator').languages);
let chars = 0;
for (const f of read('films').films) {
  let t; try { t = treatment(f.id); } catch { continue; }
  for (const n of Object.values(t?.narration ?? {})) for (const l of langs) chars += (n[l] ?? '').length;
}

const one = (refs) => openaiImageCost({ model, quality: QUALITY, references: refs }).usd;
const phaseA = sheetImages * one(1);
const phaseB = stills.reduce((a, s) => a + s.n * one(s.refs), 0);
const phaseC = motionShots * UNIT.motion.usd;
const phaseD = chars * UNIT.voice.usd;

const usd = (n) => '$' + n.toFixed(2);
console.log(`\nARC 7 ESTIMATE - ${model}, quality=${QUALITY}. Nothing is spent by running this.\n`);
console.log(`  PHASE A  sheets          ${String(sheetImages).padStart(4)} images   ${usd(phaseA).padStart(9)}`);
console.log(`           ${revisions} revisions conditioned on the Codex portraits, then per principal:`);
for (const c of perCharacter) console.log(`             ${c.id.padEnd(12)} ${c.views} views, ${c.expressions} expressions, ${c.plates} plates`);
console.log(`\n  PHASE B  stills          ${String(r.generate_shots).padStart(4)} shots    ${usd(phaseB).padStart(9)}`);
for (const s of stills.sort((a, b) => a.refs - b.refs)) {
  console.log(`             ${String(s.n).padStart(3)} shots with ${s.refs} reference${s.refs === 1 ? ' ' : 's'}  at ${usd(one(s.refs))} each`);
}
console.log(`\n  PHASE C  motion          ${String(motionShots).padStart(4)} clips    ${usd(phaseC).padStart(9)}   fal image-to-video, provider not yet chosen`);
console.log(`  PHASE D  narration    ${String(chars).padStart(7)} chars    ${usd(phaseD).padStart(9)}   ${langs.length} languages`);
console.log(`           sound effects and music: no unit price until Phase D chooses the routes`);
console.log(`  PHASE E  assembly                         ${usd(0).padStart(9)}   the studio, no provider`);
console.log(`\n  TOTAL, phases A-D                        ${usd(phaseA + phaseB + phaseC + phaseD).padStart(9)}`);
console.log(`\n  VERIFIED: the per-token prices (OpenAI's published table, 2026-09-22), the shot and`);
console.log(`  reference counts (the installed graph), the narration character count.`);
console.log(`  MEASURED: the image token counts, from real responses at quality=auto on 2026-09-22.`);
console.log(`  They replaced a scaled guess that was eleven times too high - $0.29 an image against`);
console.log(`  the measured $0.03. Scaling gpt-image-1's published counts by pixel area was simply`);
console.log(`  not how this model prices an image.`);
console.log(`  NOT MEASURED: quality=high, which is what the finished stills will use. It is priced`);
console.log(`  here as auto, so PHASE A and B could both rise. One high-quality image settles it.`);
console.log(`  Motion is fal's list price for a ~3s clip; the model is chosen by test at Phase C.`);
console.log(`  Retries are not included: a rejected candidate costs the same as an accepted one.\n`);

#!/usr/bin/env node
// make_sheets - generate model sheet candidates, anchor-first.
//
//   node tools/make_sheets.js                 the plan and the estimate, nothing sent
//   node tools/make_sheets.js VISHVAMITRA     the plan for one character
//   node tools/make_sheets.js VISHVAMITRA --run   generate the anchor candidates
//
// Never approves anything. A sheet is approved by a named human through
// POST /api/sheets/:id/approve, and only then does the consistency gate open.
import { allPlans, plan, order, decisions } from '../lib/sheetprompt.js';
import { UNIT } from '../lib/cost.js';
import { assertWithinCeiling, recordSpend } from '../lib/state.js';
import { spendAllowed, loadEnv } from '../lib/env.js';
import * as providers from '../lib/providers.js';
import { ensureDir, ROOT } from '../lib/store.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv();
const args = process.argv.slice(2);
const run = args.includes('--run');
const who = args.find((a) => !a.startsWith('--'));
const plans = who ? [plan(who)] : allPlans();

const d = decisions();
console.log(`\nMODEL SHEETS - anchor-first, per the character briefs`);
console.log(`  decisions of ${d.decided_on}, by ${d.decided_by}:`);
for (const x of d.decisions) console.log(`    ${x.id} ${x.subject.padEnd(12)} ${x.chosen}`);

// Cost first. Nothing spends without an estimate.
const perCharacter = plans[0] ? plans[0].step_1_anchor.candidates + 3 : 0;
const images = plans.reduce((a, p) => a + p.step_1_anchor.candidates + p.step_2_views.length + p.step_3_expressions.length, 0);
const usd = images * UNIT.image.usd;
console.log(`\n  ${plans.length} character(s), ${images} images at $${UNIT.image.usd} = $${usd.toFixed(2)}`);
console.log(`  (${perCharacter} for a first character's anchor plus its three views)`);

for (const p of plans) {
  console.log(`\n  ${p.order}. ${p.character}${p.why_first ? '  <- first: ' + p.why_first : ''}`);
  console.log(`     anchor: ${p.step_1_anchor.candidates} front candidates, then ${p.step_2_views.length} views conditioned on the chosen one`);
  console.log(`     then ${p.step_3_expressions.length} expression(s), then ${p.step_4_detail_plates.length} detail plate(s)`);
}

if (!run) {
  console.log(`\n  Nothing was sent. Add --run to generate the anchor candidates.`);
  console.log(`  Prompts: node tools/make_sheets.js <ID> --print\n`);
  if (args.includes('--print') && who) {
    const p = plans[0];
    console.log('--- ANCHOR ---\n' + p.step_1_anchor.prompt + '\n');
    console.log('--- NEGATIVE ---\n' + p.step_1_anchor.negative + '\n');
    for (const v of p.step_2_views) console.log(`--- ${v.slot.toUpperCase()} (conditioned on ${v.conditioned_on}) ---\n${v.prompt}\n`);
  }
  process.exit(0);
}

if (!who) { console.error('\n  --run needs a character. Generate one at a time, anchor first.\n'); process.exit(2); }

// Is the provider actually reachable? Say so plainly rather than failing mid-run.
const ping = await providers.image.ping();
if (!ping.ok) {
  console.error(`\n  CANNOT RUN: ${ping.reason}`);
  console.error(`  ${ping.detail}`);
  console.error(`\n  Nothing was sent and nothing was spent.\n`);
  process.exit(1);
}

const p = plans[0];
const est = p.step_1_anchor.candidates * UNIT.image.usd;
assertWithinCeiling(est);
if (!spendAllowed()) {
  console.log(`\n  ALLOW_SPEND is not 1. This run would spend $${est.toFixed(2)} on ${p.step_1_anchor.candidates} candidates.`);
  console.log(`  Nothing was sent.\n`);
  process.exit(0);
}

const dir = ensureDir(`assets/sheets/${who}/candidates`);
console.log(`\n  generating ${p.step_1_anchor.candidates} anchor candidates for ${who}...`);
const made = [];
for (let i = 1; i <= p.step_1_anchor.candidates; i++) {
  const out = await providers.image.generate({ prompt: p.step_1_anchor.prompt, width: 1080, height: 1920 });
  recordSpend({ provider: 'fal', route: 'sheet-anchor', model: out.model_version, label: `${who}/anchor-${i}`, usd: UNIT.image.usd, estimate_usd: UNIT.image.usd });
  made.push({ n: i, url: out.url, seed: out.seed, model_version: out.model_version });
  console.log(`    ${i}/${p.step_1_anchor.candidates}  seed ${out.seed ?? '-'}  ${out.url}`);
}
writeFileSync(join(dir, 'anchors.json'), JSON.stringify({
  character: who, generated: new Date().toISOString(),
  prompt: p.step_1_anchor.prompt, negative: p.step_1_anchor.negative,
  assembled_from: p.step_1_anchor.assembled_from,
  acceptance: p.acceptance, candidates: made,
  next: 'Choose ONE anchor. Generate the three other views conditioned on it, never on each other. Then approve by name.',
}, null, 2) + '\n', 'utf8');
console.log(`\n  ${made.length} candidates recorded in assets/sheets/${who}/candidates/anchors.json`);
console.log(`  Nothing is approved. Choose an anchor, build the views from it, then approve by name.\n`);

#!/usr/bin/env node
// make_sheets - generate model sheet candidates, anchor-first.
//
//   node tools/make_sheets.js                 the plan and the estimate, nothing sent
//   node tools/make_sheets.js VISHVAMITRA     the plan for one character
//   node tools/make_sheets.js VISHVAMITRA --run   generate the anchor candidates
//
// Never approves anything. A sheet is approved by a named human through
// POST /api/sheets/:id/approve, and only then does the consistency gate open.
import { allPlans, plan, order, decisions, adjustments } from '../lib/sheetprompt.js';
import { endpointCost } from '../lib/cost.js';
import { assertWithinCeiling, recordSpend } from '../lib/state.js';
import { spendAllowed, loadEnv } from '../lib/env.js';
import * as providers from '../lib/providers.js';
import { ensureDir, ROOT } from '../lib/store.js';
import { imageEndpoint, decodeInline } from '../lib/fal.js';
import { acceptsReference } from '../lib/endpoints.js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// A frame with no picture in it: every pixel within a hair of every other.
function isBlank(file) {
  try {
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
    let min = 255, max = 0;
    for (const v of buf) { if (v < min) min = v; if (v > max) max = v; }
    return max - min < 12;
  } catch { return false; }   // no ffmpeg is not a reason to claim a frame is blank
}
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
// Price the endpoint that is actually configured. A flat rate made every estimate
// wrong the moment FAL_IMAGE_MODEL changed.
const endpoint = imageEndpoint();
const priced = endpointCost(endpoint);
const usd = images * priced.usd;
console.log(`\n  endpoint ${endpoint}${acceptsReference(endpoint) ? ' (reference-conditioned)' : ' (text-to-image)'}`);
if (!priced.known) console.log(`  ${priced.note}`);
console.log(`  ${plans.length} character(s), ${images} images at $${priced.usd} = $${usd.toFixed(2)}`);
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
// An anchor is the FIRST authored image of a face: there is nothing to condition it
// on, so a text-to-image endpoint is the right tool here and only here.
if (acceptsReference(endpoint)) {
  console.log(`\n  note: ${endpoint} is reference-conditioned. An anchor has no reference,`);
  console.log(`  so it will be generated text-only. That is correct for an anchor and for nothing else.`);
}
const est = p.step_1_anchor.candidates * priced.usd;
assertWithinCeiling(est);
if (!spendAllowed()) {
  console.log(`\n  ALLOW_SPEND is not 1. This run would spend $${est.toFixed(2)} on ${p.step_1_anchor.candidates} candidates.`);
  console.log(`  Nothing was sent.\n`);
  process.exit(0);
}

const dir = ensureDir(`assets/sheets/${who}/candidates`);
console.log(`\n  generating ${p.step_1_anchor.candidates} anchor candidates for ${who}...`);
const made = [];
const blanks = [];
for (let i = 1; i <= p.step_1_anchor.candidates; i++) {
  const out = await providers.image.generate({ prompt: p.step_1_anchor.prompt, negative: p.step_1_anchor.negative, width: 1080, height: 1920 });
  recordSpend({ provider: 'fal', route: 'sheet-anchor', model: out.model_version, label: `${who}/anchor-${i}`, usd: priced.usd, estimate_usd: priced.usd });

  // Write the bytes down. A candidate that lives only as a URL on the provider's CDN
  // is not an asset - it is a link that will one day 404, and the sheet is the thing
  // every later frame is conditioned on.
  const inline = decodeInline(out.url);
  let file = null, sha = null;
  if (inline) {
    file = `anchor-${String(i).padStart(2, '0')}.${inline.contentType.includes('png') ? 'png' : 'jpg'}`;
    writeFileSync(join(dir, file), inline.bytes);
    sha = createHash('sha256').update(inline.bytes).digest('hex');
  } else {
    try {
      const r = await fetch(out.url);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        file = `anchor-${String(i).padStart(2, '0')}.jpg`;
        writeFileSync(join(dir, file), buf);
        sha = createHash('sha256').update(buf).digest('hex');
      }
    } catch { /* the URL is recorded either way; say so rather than pretend */ }
  }
  // fal returns a BLACK FRAME when its own filter rejects a generation, and bills for
  // it. One of ten came back black and was recorded as a candidate beside the other
  // nine, because nothing looked at the bytes.
  const blank = file ? isBlank(join(dir, file)) : false;
  if (blank) blanks.push(i);
  made.push({ n: i, url: out.url, file, sha256: sha, seed: out.seed, model_version: out.model_version, endpoint, blank });
  console.log(`    ${i}/${p.step_1_anchor.candidates}  seed ${String(out.seed ?? '-').padEnd(12)} ${file ?? 'NOT SAVED - ' + out.url}${blank ? '   BLANK - no picture, billed anyway' : ''}`);
}
writeFileSync(join(dir, 'anchors.json'), JSON.stringify({
  character: who, generated: new Date().toISOString(),
  endpoint, usd_each: priced.usd, price_known: priced.known,
  prompt: p.step_1_anchor.prompt, negative: p.step_1_anchor.negative,
  assembled_from: p.step_1_anchor.assembled_from,
  judging_order: (adjustments().judging?.order ?? null),
  acceptance: p.acceptance, candidates: made,
  next: 'Choose ONE anchor. Generate the three other views conditioned on it, never on each other. Then approve by name.',
}, null, 2) + '\n', 'utf8');
console.log(`\n  ${made.length} candidates recorded in assets/sheets/${who}/candidates/anchors.json`);
if (blanks.length) {
  console.log(`\n  ${blanks.length} of ${made.length} came back BLANK (candidate ${blanks.join(', ')}): billed, no picture.`);
  console.log(`  That is $${(blanks.length * priced.usd).toFixed(2)} spent on nothing. Re-run those before judging the set.`);
}
console.log(`  Nothing is approved. Choose an anchor, build the views from it, then approve by name.\n`);

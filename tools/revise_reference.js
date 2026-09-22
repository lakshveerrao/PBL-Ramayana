#!/usr/bin/env node
// revise_reference - PRODUCTION_ORDERS §3, the revisions.
//
// Each is conditioned on that character's Codex portrait: same face, same costume, only
// the listed change. This is also the first conditioning test - whether identity holds
// through an edit is the question the whole reference-conditioned plan rests on.
//
// No candidate is approved. A named human approves.
import { plan } from '../lib/sheetprompt.js';
import { openaiImageCost } from '../lib/cost.js';
import { assertWithinCeiling, recordSpend } from '../lib/state.js';
import { spendAllowed, loadEnv } from '../lib/env.js';
import * as providers from '../lib/providers.js';
import { imageModel } from '../lib/openai.js';
import { ensureDir, ROOT } from '../lib/store.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

loadEnv();

// The revisions the kit's README asks for, in its own words. Written as positive
// description, never as a list of prohibitions - two paid rounds established that
// naming a thing to forbid it summons it (direction/prompt-findings.md).
export const REVISIONS = {
  VISHVAMITRA: {
    reference: 'references/codex-portraits/01_Visvamitra_Head_Shoulders.png',
    change: 'Seated cross-legged on a black antelope skin, spine straight, the full figure in frame. '
          + 'His expression is composed and commanding: the eyes at rest, the brow smooth and level, the mouth easy. '
          + 'This is the still sage, used in fourteen shots - design him for stillness. '
          + 'Keep the same man exactly: the same face, the same jata bun, the same saffron cloth, the same rudraksa, '
          + 'the same staff and kamandalu, the same warm light on a plain dark ground.',
    why: 'the still sage carries 14 shots across four films; the original is scowling, which is his M5 anger and not his M1 composure',
  },
};

const who = process.argv.find((a) => !a.startsWith('--') && a === a.toUpperCase() && a.length > 2);
const run = process.argv.includes('--run');
const n = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 3);

if (!who || !REVISIONS[who]) {
  console.error(`\n  usage: node tools/revise_reference.js <${Object.keys(REVISIONS).join('|')}> [--n=3] [--run]\n`);
  process.exit(2);
}

const spec = REVISIONS[who];
const p = plan(who);
const model = imageModel();
const priced = openaiImageCost({ model, references: 1, quality: process.env.PBL_IMAGE_QUALITY ?? 'high' });
const est = priced.usd * n;

console.log(`\nREVISE ${who} - conditioned on ${spec.reference}\n`);
console.log(`  why: ${spec.why}`);
console.log(`\n  ${n} candidates on ${model} at ~$${priced.usd.toFixed(4)} each = ~$${est.toFixed(2)}`);
console.log(`  ${priced.note}`);

// The prompt: the brief's own subject description, then the single change asked for.
const prompt = `${spec.change}\n\nThe subject, unchanged from the reference image: ${p.step_1_anchor.prompt}`;
console.log(`\n  prompt (${prompt.length} chars), conditioned on ONE reference image.`);

if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }

assertWithinCeiling(est);
if (!spendAllowed()) { console.log(`\n  ALLOW_SPEND is not 1. This run would spend ~$${est.toFixed(2)}. Nothing was sent.\n`); process.exit(0); }

const refBytes = readFileSync(join(ROOT, spec.reference));
const dir = ensureDir(`assets/sheets/${who}/revision`);
const made = [];
for (let i = 1; i <= n; i++) {
  const out = await providers.image.generateFromReference({
    prompt,
    references: [{ bytes: refBytes, contentType: 'image/png', name: 'reference.png' }],
    width: 1080, height: 1920,
  });
  const usd = openaiImageCost({ model, references: 1, quality: process.env.PBL_IMAGE_QUALITY ?? 'high' }).usd;
  recordSpend({ provider: 'openai', route: 'sheet-revision', model: out.model_version, label: `${who}/revision-${i}`, usd, estimate_usd: usd });
  const m = String(out.url).match(/^data:([^;]+);base64,(.*)$/s);
  const bytes = m ? Buffer.from(m[2], 'base64') : Buffer.from(await (await fetch(out.url)).arrayBuffer());
  const file = `revision-${String(i).padStart(2, '0')}.png`;
  writeFileSync(join(dir, file), bytes);
  made.push({
    n: i, file, sha256: createHash('sha256').update(bytes).digest('hex'),
    generated_size: out.generated_size, needs_scale_to_frame: out.needs_scale_to_frame,
    usage: out.usage ?? null, revised_prompt: out.revised_prompt ?? null,
  });
  console.log(`    ${i}/${n}  ${file}  ${out.generated_size}  tokens=${JSON.stringify(out.usage ?? {})}`);
}

writeFileSync(join(dir, 'revision.json'), JSON.stringify({
  character: who, generated: new Date().toISOString(),
  conditioned_on: spec.reference, change: spec.change, why: spec.why,
  model, prompt, candidates: made,
  approved: false,
  next: 'A named human approves. Until then the consistency gate stays shut for this character.',
}, null, 2) + '\n', 'utf8');
console.log(`\n  ${made.length} candidates in assets/sheets/${who}/revision/. Nothing is approved.\n`);

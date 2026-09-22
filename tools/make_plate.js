#!/usr/bin/env node
// make_plate - a reference plate for an entity that has no portrait and never will.
//
// COURT is "the ministers and court" - the graph types it as a person, so the
// consistency gate demands a sheet, and a crowd has no face to lock. The director's
// answer: one court plate, approved like a character, and every court shot conditioned
// on it. That keeps the gate intact instead of loosening it.
//
// Text-to-image, because there is nothing to condition on: this IS the first authored
// image of the court. Everything after it is conditioned on this.
import { openaiImageCost } from '../lib/cost.js';
import { assertWithinCeiling, recordSpend } from '../lib/state.js';
import { spendAllowed, loadEnv } from '../lib/env.js';
import * as providers from '../lib/providers.js';
import { imageModel } from '../lib/openai.js';
import { negativePrompt } from '../lib/prompt.js';
import { foldNegatives } from '../lib/prompt.js';
import { ensureDir, ROOT } from '../lib/store.js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

loadEnv();

export const PLATES = {
  COURT: {
    brief: 'A formal reference plate of the ministers and court of Ayodhya, seated along the hall. '
         + 'Eight to ten men of varied ages and varied faces - some grey, some middle-aged, none young - '
         + 'seated on the floor in two receding rows along one wall, in three-quarter view, all attending to '
         + 'something out of frame at the left. '
         + 'They wear draped cream and undyed white silk, one shoulder bare in the manner of the court. '
         + 'Modest gold: a plain collar, a single armlet, a ring - visibly LESS than a king would wear, and no '
         + 'crown or mukuta on any of them. Bare feet. '
         + 'The hall: post-and-lintel timber and lime plaster, sandstone, one motivated source - high lattice '
         + 'openings throwing long bars of light across stone from frame-left - and one brass lamp. '
         + 'Palette sandstone, teak brown, undyed cream, one deep red, one ochre, brass. '
         + 'They are a body, not a portrait: no single face dominates and none is the subject.',
    why: 'a crowd cannot have a model sheet, and the gate will not pass a person without one. A plate approved '
       + 'like a character keeps the gate honest and gives the arc one consistent court across six shots.',
    shots: ['01-03', '01-10', '02-11', '04-08'],
  },
};

const who = process.argv.find((a) => a === a.toUpperCase() && a.length > 2 && !a.startsWith('--'));
const run = process.argv.includes('--run');
const n = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 4);
if (!who || !PLATES[who]) {
  console.error(`\n  usage: node tools/make_plate.js <${Object.keys(PLATES).join('|')}> [--n=4] [--run]\n`);
  process.exit(2);
}

const spec = PLATES[who];
const model = imageModel();
const priced = providers.image.cost({ references: 0 });
const est = priced.usd * n;

// OpenAI has no negative field, so the world's negatives go in the body - short, last,
// and never repeating what the brief already says positively.
const folded = foldNegatives(spec.brief, negativePrompt().text);

console.log(`\nPLATE ${who}\n`);
console.log(`  why: ${spec.why}`);
console.log(`  conditions ${spec.shots.length} shots: ${spec.shots.join(', ')}`);
console.log(`\n  ${n} candidates on ${priced.endpoint} at $${priced.usd.toFixed(4)} each = $${est.toFixed(2)}`);
console.log(`  negatives: ${folded.folded.length} folded into the body, ${folded.dropped_as_already_stated} already stated, ${folded.dropped_for_length} left out`);
if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }

assertWithinCeiling(est);
if (!spendAllowed()) { console.log(`\n  ALLOW_SPEND is not 1. Would spend $${est.toFixed(2)}. Nothing sent.\n`); process.exit(0); }

const dir = ensureDir(`assets/sheets/${who}/plate`);
const made = [], failed = [];
for (let i = 1; i <= n; i++) {
  try {
    const out = await providers.image.generate({ prompt: folded.prompt, width: 1080, height: 1920 });
    recordSpend({ provider: 'openai', route: 'plate', model: out.model_version, label: `${who}/plate-${i}`, usd: priced.usd, estimate_usd: priced.usd });
    const m = String(out.url).match(/^data:([^;]+);base64,(.*)$/s);
    const bytes = m ? Buffer.from(m[2], 'base64') : Buffer.from(await (await fetch(out.url)).arrayBuffer());
    const file = `plate-${String(i).padStart(2, '0')}.${m && /jpeg/.test(m[1]) ? 'jpg' : 'png'}`;
    writeFileSync(join(dir, file), bytes);
    made.push({ n: i, file, sha256: createHash('sha256').update(bytes).digest('hex'), usage: out.usage ?? null });
    console.log(`    ${i}/${n}  ${file}`);
  } catch (e) {
    failed.push({ n: i, status: e.status ?? null, refusal: e.refusal ?? null, message: String(e.message).slice(0, 160) });
    console.log(`    ${i}/${n}  FAILED: ${e.status ?? ''} ${String(e.message).slice(0, 80)}`);
  }
}
writeFileSync(join(dir, 'plate.json'), JSON.stringify({
  entity: who, generated: new Date().toISOString(), model, prompt: folded.prompt,
  negatives_folded: folded.folded, negatives_all: folded.all_negatives,
  conditions_shots: spec.shots, why: spec.why, candidates: made, failed, approved: false,
  next: 'A named human approves one. Every court shot is then conditioned on it.',
}, null, 2) + '\n', 'utf8');
console.log(`\n  ${made.length} of ${n} in assets/sheets/${who}/plate/. Nothing is approved.\n`);

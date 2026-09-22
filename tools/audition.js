#!/usr/bin/env node
// audition - the narrator audition line, in every language the graph declares.
//
// HANDOFF §8: "Narrators for English, Hindi and Telugu. Audition line: He said no. /
// उन्होंने ना कह दिया। / ఆయన కాదన్నాడు. Reject anyone who performs it."
//
// Three level words. That is the whole test: a reader who reaches for it has failed,
// and three words give them nowhere to hide. Telugu goes first because Telugu is the
// language whose register is easiest to get wrong - granthika endings turn it into a
// recital - and because the typography work already showed Telugu is where this film
// is hardest.
//
// Nothing here chooses a voice. A narrator is approved by a named person, like a sheet.
import { read } from '../lib/store.js';
import { UNIT } from '../lib/cost.js';
import { spendAllowed, loadEnv, env } from '../lib/env.js';
import { assertWithinCeiling, recordSpend } from '../lib/state.js';
import { settings } from '../lib/eleven.js';
import * as eleven from '../lib/eleven.js';
import { ensureDir, assetsDir, ROOT } from '../lib/store.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
loadEnv();

// The line, per language. It is HANDOFF's, not this tool's - and it is checked against
// each language's own attribution markers, because "he said no" is a REPORTED refusal
// and the narrator has to sound like someone reporting it.
const LINE = {
  te: 'ఆయన కాదన్నాడు.',
  hi: 'उन्होंने ना कह दिया।',
  en: 'He said no.',
};
const ORDER = ['te', 'hi', 'en'];

const run = process.argv.includes('--run');
const narrator = read('narrator');
const langs = ORDER.filter((l) => narrator.languages[l]);
const missing = Object.keys(narrator.languages).filter((l) => !LINE[l]);

console.log('\nAUDITION - the narrator line, Telugu first\n');
if (missing.length) {
  console.log(`  this graph declares ${missing.join(', ')}, which HANDOFF's audition line does not cover. Nothing is invented for them.\n`);
}

let chars = 0;
for (const l of langs) {
  const spec = narrator.languages[l];
  const voice = env(spec.voice_env);
  chars += LINE[l].length;
  console.log(`  ${l}  ${LINE[l]}`);
  console.log(`      ${spec.persona}`);
  console.log(`      forbidden: ${spec.forbidden.join('; ')}`);
  console.log(`      voice: ${voice ? voice : `NOT SET - ${spec.voice_env} is empty`}`);
  const marker = (spec.attribution_markers ?? []).find((m) => LINE[l].includes(m));
  console.log(`      the line carries this language's own attribution marker: ${marker ? `"${marker}"` : 'NONE - check the line against data/narrator.json'}`);
  console.log('');
}
const est = chars * UNIT.voice.usd;
console.log(`  ${chars} characters across ${langs.length} languages = $${est.toFixed(4)}`);
console.log(`  settings: ${JSON.stringify(settings())}`);

// Two things have to be true before a character is sent.
const noVoice = langs.filter((l) => !env(narrator.languages[l].voice_env));
const probe = await eleven.ping();
console.log(`\n  credential: ${probe.ok ? 'ok' : `NOT USABLE - ${probe.reason}`}`);
if (!probe.ok) console.log(`    ${probe.detail}`);
if (noVoice.length) {
  console.log(`\n  no voice chosen for: ${noVoice.map((l) => narrator.languages[l].voice_env).join(', ')}`);
  console.log(`    A narrator is approved by a named person, like a sheet. HANDOFF §8: "Reject anyone who performs it."`);
}
if (!probe.ok || noVoice.length) {
  console.log(`\n  Nothing sent. Both have to be true: a credential ElevenLabs accepts, and a chosen voice per language.\n`);
  process.exit(0);
}
if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }
if (!spendAllowed()) { console.log('\n  ALLOW_SPEND is not 1. Nothing sent.\n'); process.exit(0); }
assertWithinCeiling(est);

const dir = ensureDir(`${assetsDir()}/audition`);
for (const l of langs) {
  const out = await eleven.speak({ text: LINE[l], lang: l });
  const file = join(dir, `audition.${l}.mp3`);
  writeFileSync(file, out.bytes);
  recordSpend({ provider: 'elevenlabs', route: 'audition', model: out.model ?? null, label: `audition/${l}`, usd: LINE[l].length * UNIT.voice.usd, estimate_usd: LINE[l].length * UNIT.voice.usd });
  console.log(`  ${l}  ${file.replace(ROOT + '/', '')}  ${(out.bytes.length / 1024).toFixed(0)} KB`);
}
console.log('\n  Nothing is approved. A narrator is approved by a named person.\n');

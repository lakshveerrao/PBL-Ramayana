#!/usr/bin/env node
// render_film - every generate shot in a film, and a report of what landed.
//
// A batch must never die on one shot. The edits endpoint fails often enough that
// aborting on the first error would mean never finishing a film.
import { shotOf, renderShot, estimate } from '../lib/render.js';
import { treatment } from '../lib/store.js';
import { spendAllowed, loadEnv } from '../lib/env.js';
loadEnv();

const filmId = process.argv[2] ?? 'M1';
const run = process.argv.includes('--run');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)?.split(',');

const t = treatment(filmId);
const shots = t.shots.filter((s) => s.source === 'generate' && (!only || only.includes(s.id)));
const est = estimate(filmId);

console.log(`\nRENDER ${filmId} - ${shots.length} shots to generate, ${t.shots.length - shots.length} reused\n`);
console.log(`  ${est.endpoint.name} at $${est.endpoint.usd_each} each  ~$${est.usd.image}`);
console.log(`  gate: ${est.gate.allowed ? 'all allowed' : est.gate.blocked + ' of ' + est.gate.of + ' blocked'}`);
if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }
if (!spendAllowed()) { console.log('\n  ALLOW_SPEND is not 1. Nothing sent.\n'); process.exit(0); }

const done = [], failed = [];
for (const s of shots) {
  const t0 = Date.now();
  try {
    const r = await renderShot(filmId, s.id, { allow_spend: true });
    done.push(r);
    console.log(`  ${s.id}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  $${r.usd}  ${r.conditioned_on.length} ref  ${r.local_path}`);
  } catch (e) {
    failed.push({ shot: s.id, status: e.status ?? null, refusal: e.refusal ?? null, message: String(e.message).slice(0, 140) });
    console.log(`  ${s.id}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  FAILED  ${e.status ?? ''} ${String(e.message).slice(0, 70)}`);
  }
}
console.log(`\n  ${done.length} of ${shots.length} rendered, $${done.reduce((a, r) => a + r.usd, 0).toFixed(4)}`);
if (failed.length) {
  console.log(`  ${failed.length} failed - re-run to fill them in:`);
  for (const f of failed) console.log(`    ${f.shot}  ${f.refusal ? 'REFUSED ' + JSON.stringify(f.refusal) : f.status + ' ' + f.message.slice(0, 60)}`);
}
console.log('');

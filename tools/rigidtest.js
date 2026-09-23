#!/usr/bin/env node
// rigidtest - can a motion provider hold a RIGID OBJECT?
//
// The crown was never the only failure. A crown, a pair of hands and a flame all fail
// the same way: a generative video model treats them as texture, not as things, and
// redraws them every frame. So the test is three shots that each ask for a different
// rigid thing, three runs each, and a shot passes only if all three runs hold.
//
//   01-04  the king begins to rise    - the CROWN: silhouette and ornament
//   01-06  water over the feet        - the HANDS: finger count and shape, the vessel
//                                       one rigid object, the water falling downward
//   01-13  the king seated at ease    - the CROWN and his GOLD: necklaces, armlets, rings
//
// Three runs because one clip proves nothing either way: the same prompt is a fresh
// roll of the dice every time, and a provider that holds once in three is a provider
// that fails two shots in six.
//
// Nothing here is frozen, masked or patched afterwards. A shot either works or stays a
// still.
import { treatment, ROOT, ensureDir, assetsDir } from '../lib/store.js';
import { MOTION_ENDPOINTS } from '../lib/endpoints.js';
import { spendAllowed, loadEnv, assertProxyInUse } from '../lib/env.js';
import { assertWithinCeiling, recordSpend, spentSoFar } from '../lib/state.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
loadEnv();

const endpoint = process.argv.find((a) => a.startsWith('--endpoint='))?.slice(11)
  ?? 'fal-ai/bytedance/seedance/v1/pro/image-to-video';
const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? 3);
const run = process.argv.includes('--run');
const filmId = 'M1';

// One instruction per shot, written for what is being judged. The standing rules ride
// last, as they do everywhere else.
const RULES = [
  'The camera does not move. Nothing enters the frame and nothing leaves it.',
  'Every rigid object keeps its exact shape, size and design: no ornament, jewellery or metalwork changes form, and nothing gains or loses a part.',
  'Flames stay on their wicks. They may flicker in place; they never slide, drift, detach, multiply or change count. No new flame or light appears.',
];
const CASES = {
  '01-04': { judge: 'the crown',
    instruction: 'The seated king leans forward and BEGINS to rise, lifting a little - he does not complete the stand. The crown is rigid. It is fixed on his head and moves exactly with it; its silhouette, its size and every piece of its ornament stay exactly as they are. His draped cloth shifts a little as he leans. His face does not change. Nobody else moves.' },
  '01-06': { judge: 'the hands, the vessel, the water',
    instruction: 'Hands tilt a metal vessel and water pours from it downward, under gravity, over a pair of bare feet on stone, splashing and running away across the floor. The hands keep five fingers each and do not change shape. The vessel is one solid object and keeps its exact form; it does not bend, split or change size. The water falls downward and never floats, rises or hangs still. No face is visible. Nothing else in the frame changes.' },
  '01-13': { judge: 'the crown and the gold',
    instruction: 'A seated king at ease, almost still: breath, and one slow blink. The crown is rigid and fixed on his head. His necklaces, armlets, bracelets and rings are solid metal and keep their exact shape, size and design - nothing melts, merges, multiplies or changes pattern. His face does not change. Nothing else in the frame moves.' },
};

const price = MOTION_ENDPOINTS[endpoint];
if (!price?.exists) { console.error(`\n  ${endpoint} is not a usable endpoint in lib/endpoints.js\n`); process.exit(2); }
const t = treatment(filmId);
const shots = Object.keys(CASES);
const total = shots.length * runs;

console.log(`\nRIGID TEST - ${endpoint}`);
console.log(`  ${shots.length} shots x ${runs} runs = ${total} clips`);
console.log(`  $${price.usd.toFixed(2)} each = $${(price.usd * total).toFixed(2)}  ESTIMATED - fal's pricing page is not readable from here`);
console.log(`  spent so far $${spentSoFar().toFixed(2)}`);
for (const s of shots) console.log(`    ${s}  judge: ${CASES[s].judge}`);
console.log(`\n  A shot passes only if ALL ${runs} runs hold. Nothing is frozen, masked or patched afterwards.`);
if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }
if (!spendAllowed()) { console.log('\n  ALLOW_SPEND is not 1. Nothing sent.\n'); process.exit(0); }
assertProxyInUse('fal.run');
assertWithinCeiling(price.usd * total);

const QUEUE_TIMEOUT_MS = Number(process.env.PBL_MOTION_TIMEOUT_MS ?? 900000);
async function throughQueue(ep, body) {
  const submit = await fetch(`https://queue.fal.run/${ep}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const sb = await submit.text();
  if (!submit.ok) throw Object.assign(new Error(sb.slice(0, 200)), { status: submit.status });
  const q = JSON.parse(sb);
  const deadline = Date.now() + QUEUE_TIMEOUT_MS;
  for (let wait = 3000; Date.now() < deadline; wait = Math.min(15000, wait * 1.3)) {
    await new Promise((r) => setTimeout(r, wait));
    const st = await fetch(q.status_url, { headers: { accept: 'application/json' } });
    const stb = await st.text();
    if (!st.ok) throw Object.assign(new Error(stb.slice(0, 200)), { status: st.status });
    const status = JSON.parse(stb).status;
    if (status === 'COMPLETED') {
      const res = await fetch(q.response_url, { headers: { accept: 'application/json' } });
      const rb = await res.text();
      if (!res.ok) throw Object.assign(new Error(rb.slice(0, 200)), { status: res.status });
      return JSON.parse(rb);
    }
    if (status && status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') throw new Error(`queue status ${status}`);
  }
  throw new Error(`queue request ${q.request_id} did not finish in ${QUEUE_TIMEOUT_MS / 1000}s - it may still run, and may still be billed`);
}

const dataUri = (path) => {
  const tmp = join(ensureDir(`${assetsDir()}/rigidtest/_enc`), `${createHash('sha256').update(path).digest('hex').slice(0, 12)}.jpg`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-q:v', '2', '-frames:v', '1', '-y', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  return `data:image/jpeg;base64,${readFileSync(tmp).toString('base64')}`;
};

const outDir = ensureDir(`${assetsDir()}/rigidtest`);
const results = [];
for (const shot of shots) {
  const rec = JSON.parse(readFileSync(join(ROOT, 'renders', filmId, `${shot}.json`), 'utf8'));
  const img = dataUri(join(ROOT, rec.local_path));
  const prompt = [CASES[shot].instruction, ...RULES].join(' ').replace(/\s+/g, ' ').trim();
  console.log(`\n  ${shot} - judging ${CASES[shot].judge}`);
  for (let i = 1; i <= runs; i++) {
    const t0 = Date.now();
    const out = join(outDir, `${shot}.run${i}.mp4`);
    try {
      const j = await throughQueue(endpoint, { prompt, image_url: img, resolution: '1080p', duration: '5' });
      const url = j.video?.url ?? j.url ?? null;
      if (!url) throw new Error(`no video: ${Object.keys(j).join(',')}`);
      writeFileSync(out, url.startsWith('data:') ? Buffer.from(url.split(',')[1], 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer()));
      const got = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'csv=p=0:s=,', out], { encoding: 'utf8' }).trim();
      recordSpend({ provider: 'fal', route: 'rigid-test', model: endpoint, label: `${filmId}/${shot}#${i}`, usd: price.usd, estimate_usd: price.usd });
      results.push({ shot, run: i, file: `assets/rigidtest/${shot}.run${i}.mp4`, probe: got });
      console.log(`    run ${i}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  ${got}`);
    } catch (e) {
      results.push({ shot, run: i, failed: String(e.message).slice(0, 160) });
      console.log(`    run ${i}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  FAILED ${String(e.message).slice(0, 90)}`);
    }
  }
}
writeFileSync(join(ROOT, 'renders', 'rigidtest.json'), JSON.stringify({
  at: new Date().toISOString(), endpoint, runs, cases: CASES, rules: RULES, results,
  note: 'Nothing here is approved, and nothing is frozen, masked or patched. A shot passes only if all runs hold, judged by a person watching.',
}, null, 2) + '\n', 'utf8');
const ok = results.filter((r) => !r.failed);
console.log(`\n  ${ok.length} of ${total} clips returned, $${(ok.length * price.usd).toFixed(2)}. Nothing is approved.\n`);

#!/usr/bin/env node
// motiontest - which motion provider can be trusted with this film?
//
// The question is not "which looks best". It is the two things a 44-second film made of
// held frames cannot survive losing:
//
//   1. Does the FACE survive the motion? Every shot is conditioned on an approved
//      sheet. A provider that redraws the face has undone the whole identity chain.
//   2. Does CLOTH move like cloth? Uncut draped handloom, not a rubber sheet and not a
//      stiff board. This is the one thing in frame that MUST move.
//
// So the test is three stills that ask different questions: a body rising, a held face,
// and a walk at distance. A provider has to pass all three; the arc has all three in it.
//
// Nothing here is judged by this tool. It measures what can be measured - face drift
// against the still it started from - and lays the clips out for a person to watch.
import { MOTION_ENDPOINTS } from '../lib/endpoints.js';
import { treatment, ensureDir, assetsDir, ROOT } from '../lib/store.js';
import { spendAllowed, loadEnv } from '../lib/env.js';
import { assertWithinCeiling, recordSpend, spentSoFar } from '../lib/state.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
loadEnv();

// The three stills, and what each one is asking of a provider.
const CASES = [
  { shot: '01-04', asks: 'a body rising',     prompt: 'The seated king rises to his feet, unhurried. His draped cloth settles as he stands. The camera does not move. Nothing else in the room moves.' },
  { shot: '01-13', asks: 'a held face',       prompt: 'A held face, almost still. The smallest life only - breath, a lamp flame drifting, draped cloth settling. The camera does not move.' },
  { shot: '01-02', asks: 'a walk at distance', prompt: 'The sage walks up the aisle toward the camera, small in the frame, unhurried. His draped cloth moves as he walks. The camera does not move.' },
];

const DEFAULT_SHORTLIST = [
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  'fal-ai/minimax/hailuo-02/standard/image-to-video',
  'fal-ai/wan/v2.2-a14b/image-to-video',
  'fal-ai/kling-video/v1.6/standard/image-to-video',
];

const run = process.argv.includes('--run');
const only = process.argv.find((a) => a.startsWith('--endpoints='))?.slice(12)?.split(',');
const endpoints = only ?? DEFAULT_SHORTLIST;
const filmId = 'M1';
const t = treatment(filmId);

const stillFor = (shot) => {
  const rec = join(ROOT, 'renders', filmId, `${shot}.json`);
  if (!existsSync(rec)) throw new Error(`shot ${shot} has no render record - motion needs a frame to move`);
  const r = JSON.parse(readFileSync(rec, 'utf8'));
  const p = join(ROOT, r.local_path);
  if (!existsSync(p)) throw new Error(`shot ${shot}'s record names ${r.local_path}, which is not there`);
  return { path: p, record: r };
};

// fal takes image_url. A local still has no URL, so it travels as a data URI - the same
// way references reach the image endpoint. JPEG, because a 5 MB PNG base64s to 6.7 MB
// of JSON body and the edits endpoint has already shown what an oversized body does.
// The PIXELS are untouched at full frame size: only the encoding changes, never what is
// in the reference.
const dataUri = (path) => {
  const tmp = join(ensureDir(`${assetsDir()}/motiontest/_enc`), `${createHash('sha256').update(path).digest('hex').slice(0, 12)}.jpg`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path,
    '-q:v', '2', '-frames:v', '1', '-y', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  return { uri: `data:image/jpeg;base64,${readFileSync(tmp).toString('base64')}`, bytes: readFileSync(tmp).length };
};


// fal's SYNCHRONOUS host holds the connection open for the whole generation, and a
// motion clip takes minutes. This environment's proxy drops an idle connection at about
// thirty seconds: all twelve clips of the first run died at 30-31s with "502 upstream
// request failed", which is the same signature - and the same cause - as the OpenAI
// image 502s that streaming fixed. Size was not it there and is not it here.
//
// So motion goes through fal's QUEUE host instead. Submit, get a request_id back in a
// second, then poll. Every call is short, so nothing is ever idle for thirty seconds.
//
// A 502 from the proxy is NOT proof that nothing was billed: fal may have accepted and
// run the job while the connection was dropped on this side. The queue removes the
// ambiguity as well as the failure - a request_id is a thing that can be asked about.
const QUEUE_TIMEOUT_MS = Number(process.env.PBL_MOTION_TIMEOUT_MS ?? 600000);
async function throughQueue(endpoint, body) {
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const submitBody = await submit.text();
  if (!submit.ok) throw Object.assign(new Error(submitBody.slice(0, 200)), { status: submit.status });
  const q = JSON.parse(submitBody);
  if (!q.status_url || !q.response_url) throw new Error(`the queue returned no status_url: ${submitBody.slice(0, 160)}`);

  const deadline = Date.now() + QUEUE_TIMEOUT_MS;
  for (let wait = 3000; Date.now() < deadline; wait = Math.min(15000, wait * 1.3)) {
    await new Promise((r) => setTimeout(r, wait));
    const st = await fetch(q.status_url, { headers: { accept: 'application/json' } });
    const stBody = await st.text();
    if (!st.ok) throw Object.assign(new Error(stBody.slice(0, 200)), { status: st.status });
    const status = JSON.parse(stBody).status;
    if (status === 'COMPLETED') {
      const res = await fetch(q.response_url, { headers: { accept: 'application/json' } });
      const resBody = await res.text();
      if (!res.ok) throw Object.assign(new Error(resBody.slice(0, 200)), { status: res.status });
      return JSON.parse(resBody);
    }
    if (status && status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      throw new Error(`queue returned status ${status} for ${q.request_id}`);
    }
  }
  throw new Error(`queue request ${q.request_id} did not finish within ${QUEUE_TIMEOUT_MS / 1000}s - it may still be running, and may still be billed`);
}

console.log(`\nMOTION PROVIDER TEST - ${CASES.length} stills x ${endpoints.length} endpoints = ${CASES.length * endpoints.length} clips\n`);
let est = 0;
const anyEstimated = endpoints.some((e) => MOTION_ENDPOINTS[e]?.estimated);
for (const e of endpoints) {
  const d = MOTION_ENDPOINTS[e];
  if (!d) { console.error(`  ${e} is not in the motion registry - probe it before spending on it`); process.exit(2); }
  if (!d.exists) { console.error(`  ${e} was probed and is not usable: ${d.note}`); process.exit(2); }
  est += d.usd * CASES.length;
  console.log(`  ${e.padEnd(50)} $${d.usd.toFixed(2)} x ${CASES.length} = $${(d.usd * CASES.length).toFixed(2)}  min ${d.seconds}s`);
}
console.log(`\n  shots:`);
for (const c of CASES) {
  const s = t.shots.find((x) => x.id === c.shot);
  console.log(`    ${c.shot}  ${c.asks.padEnd(18)} ${s.duration_s}s in the film (${Math.round(s.duration_s * 30)} frames)`);
}
console.log(`\n  ESTIMATE $${est.toFixed(2)}${anyEstimated ? '  - every price is ESTIMATED. fal.ai answers 403 through this proxy, so the pricing page cannot be read from here and no figure was taken from it. The real bill may differ.' : ''}`);
console.log(`  spent so far $${spentSoFar().toFixed(2)}`);
if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }
if (!spendAllowed()) { console.log('\n  ALLOW_SPEND is not 1. Nothing sent.\n'); process.exit(0); }
assertWithinCeiling(est);

const outDir = ensureDir(`${assetsDir()}/motiontest`);
const results = [];
for (const c of CASES) {
  const still = stillFor(c.shot);
  const img = dataUri(still.path);
  console.log(`\n  ${c.shot} - ${c.asks}  (${(img.bytes / 1024).toFixed(0)} KB as jpeg)`);
  for (const e of endpoints) {
    const d = MOTION_ENDPOINTS[e];
    const t0 = Date.now();
    const tag = `${c.shot}__${e.replace(/[^a-z0-9]+/gi, '-')}`;
    try {
      const j = await throughQueue(e, { prompt: c.prompt, image_url: img.uri, duration: String(d.seconds) });
      const url = j.video?.url ?? j.url ?? j.output?.url ?? null;
      if (!url) throw new Error(`no video in the response: ${Object.keys(j).join(',')}`);
      const bytes = url.startsWith('data:')
        ? Buffer.from(url.split(',')[1], 'base64')
        : Buffer.from(await (await fetch(url)).arrayBuffer());
      const file = join(outDir, `${tag}.mp4`);
      writeFileSync(file, bytes);
      recordSpend({ provider: 'fal', route: 'motion-test', model: e, label: `${filmId}/${c.shot}`, usd: d.usd, estimate_usd: d.usd });
      results.push({ shot: c.shot, endpoint: e, file: `assets/motiontest/${tag}.mp4`, bytes: bytes.length, usd: d.usd, seconds: ((Date.now() - t0) / 1000) });
      console.log(`    ${e.padEnd(50)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  ${(bytes.length / 1024 / 1024).toFixed(1)} MB  ${file.replace(ROOT + '/', '')}`);
    } catch (err) {
      results.push({ shot: c.shot, endpoint: e, failed: String(err.message).slice(0, 180), status: err.status ?? null });
      console.log(`    ${e.padEnd(50)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  FAILED ${err.status ?? ''} ${String(err.message).slice(0, 80)}`);
    }
  }
}
writeFileSync(join(ROOT, 'renders', 'motiontest.json'), JSON.stringify({
  at: new Date().toISOString(), film: filmId, cases: CASES, endpoints, results,
  prices_are_estimated: anyEstimated,
  note: 'Nothing here is approved. A provider is chosen by a person watching the clips, against two questions: does the face survive, and does cloth move like cloth.',
}, null, 2) + '\n', 'utf8');
const ok = results.filter((r) => !r.failed);
console.log(`\n  ${ok.length} of ${results.length} clips returned, $${ok.reduce((a, r) => a + r.usd, 0).toFixed(2)} spent. Nothing is approved.\n`);

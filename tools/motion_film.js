#!/usr/bin/env node
// motion_film - animate a film's stills on the chosen provider, and cut each clip down
// to the window the shot actually needs.
//
// Three decisions from the director, 2026-09-22, are built in:
//
//   1. kling-video/v2.5-turbo/pro. It was the only candidate that both performed the
//      beat and held the face, and the only one that returns 1080x1920.
//   2. The film stays 30 fps. Ask kling for 30; if it will not, convert 24->30 with
//      OPTICAL FLOW, never frame duplication. Measured on 01-04 and 01-02: duplication
//      leaves 30 still frames in 149 and a judder roughness of 1.452 against the
//      source's 0.123; minterpolate leaves none and lands at 0.194. No smear on either -
//      the staff in 01-02, the thinnest fast-moving thing in the film, stays clean.
//   3. Take the best 2 s window out of each 5 s clip - "for 01-04 the rise itself, not
//      the settle after it". So the window is CHOSEN, by measurement: for an action shot
//      the window with the most movement in it, for a subtle-life shot the quietest.
//      Which is which comes from direction/m1-motion-instructions.json, not from a guess.
import { treatment, ROOT, ensureDir, assetsDir } from '../lib/store.js';
import { effectsShots } from '../lib/graph.js';
import { MOTION_ENDPOINTS } from '../lib/endpoints.js';
import { spendAllowed, loadEnv, assertProxyInUse } from '../lib/env.js';
import { assertWithinCeiling, recordSpend, spentSoFar } from '../lib/state.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
loadEnv();

// A standing rule is appended to EVERY instruction the film sends, rather than pasted
// into each one by hand. A rule that has to be remembered fourteen times is a rule that
// will be forgotten once - and the flame rule exists because of exactly that class of
// omission: nothing in M1's fourteen instructions told the model that a flame is
// attached to its wick, so in 01-03 the diya's flames slid along the rim and one came
// off it. The instruction stays the shot's; the rule rides last, where a prompt reads
// it as the final word.
export function promptFor(inst, rules = null) {
  const standing = rules ?? (spec.standing_rules ?? []);
  return [inst.instruction, ...standing].join(' ').replace(/\s+/g, ' ').trim();
}

// The best window of `frames` frames: the busiest for an action shot, the quietest for
// subtle life. Returns the start frame.
export function chooseWindow(prof, frames, kind) {
  if (prof.length <= frames) return 0;
  let best = null;
  for (let i = 0; i + frames <= prof.length; i++) {
    const sum = prof.slice(i, i + frames).reduce((a, x) => a + x, 0);
    if (best === null || (kind === 'action' ? sum > best.sum : sum < best.sum)) best = { i, sum };
  }
  return best.i;
}


if (import.meta.url === `file://${process.argv[1]}`) {
  const filmId = process.argv[2] ?? 'M1';
  const run = process.argv.includes('--run');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)?.split(',');
  const spec = JSON.parse(readFileSync(join(ROOT, 'direction', `${filmId.toLowerCase()}-motion-instructions.json`), 'utf8'));
  const endpoint = spec.endpoint;
  const price = MOTION_ENDPOINTS[endpoint];
  const t = treatment(filmId);
  const fx = effectsShots();

  const shots = t.shots.filter((s) => {
    if (only && !only.includes(s.id)) return false;
    if (s.motion_allowed === false) return false;
    if (fx[s.id]?.motion === false) return false;
    return Boolean(spec.shots[s.id]);
  });
  const refused = t.shots.filter((s) => s.motion_allowed === false || fx[s.id]?.motion === false);

  console.log(`\nMOTION ${filmId} - ${shots.length} shots to animate, ${refused.length} refused by the graph\n`);
  console.log(`  ${endpoint}`);
  console.log(`  $${price.usd.toFixed(2)} x ${shots.length} = $${(price.usd * shots.length).toFixed(2)}  ESTIMATED - fal's pricing page is not readable from here`);
  console.log(`  spent so far $${spentSoFar().toFixed(2)}`);
  console.log(`  refuses motion: ${refused.map((s) => s.id).join(', ') || '(none)'}`);
  if (!run) { console.log('\n  Nothing was sent. Add --run.\n'); process.exit(0); }
  if (!spendAllowed()) { console.log('\n  ALLOW_SPEND is not 1. Nothing sent.\n'); process.exit(0); }
  assertProxyInUse('fal.run');
  assertWithinCeiling(price.usd * shots.length);

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
    const tmp = join(ensureDir(`${assetsDir()}/motion/_enc`), `${createHash('sha256').update(path).digest('hex').slice(0, 12)}.jpg`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-q:v', '2', '-frames:v', '1', '-y', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    return `data:image/jpeg;base64,${readFileSync(tmp).toString('base64')}`;
  };

  // The per-frame movement profile, coarse. Used to choose the window.
  function profile(file) {
    const out = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-i', file,
      '-vf', 'scale=96:171:flags=area,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return [...out.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1])).slice(1);
  }

  const outDir = ensureDir(`${assetsDir()}/motion/${filmId}`);
  const recDir = ensureDir(`renders/${filmId}/motion`);
  const fps = 30;
  const done = [], failed = [];
  for (const s of shots) {
    const t0 = Date.now();
    const inst = spec.shots[s.id];
    const rec = JSON.parse(readFileSync(join(ROOT, 'renders', filmId, `${s.id}.json`), 'utf8'));
    const frames = Math.round(s.duration_s * fps);
    try {
      const j = await throughQueue(endpoint, {
        prompt: promptFor(inst),
        image_url: dataUri(join(ROOT, rec.local_path)),
        duration: String(price.seconds),
        fps,                       // asked for; kling may ignore it, and the record says which
      });
      const url = j.video?.url ?? j.url ?? null;
      if (!url) throw new Error(`no video: ${Object.keys(j).join(',')}`);
      const raw = join(outDir, `${s.id}.raw.mp4`);
      writeFileSync(raw, url.startsWith('data:') ? Buffer.from(url.split(',')[1], 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer()));
      const got = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0:s=,', raw], { encoding: 'utf8' }).trim().split(',');
      const gotFps = eval(got[2]);

      // 30 fps, by conversion if it was not given to us. Optical flow, never duplication.
      const at30 = join(outDir, `${s.id}.30.mp4`);
      const converted = Math.abs(gotFps - fps) > 0.01;
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', raw,
        '-vf', converted ? `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1` : `fps=${fps}`,
        '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-y', at30], { stdio: ['ignore', 'ignore', 'pipe'] });

      const prof = profile(at30);
      const start = chooseWindow(prof, frames, inst.kind);
      const cut = join(outDir, `${s.id}.mp4`);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', at30,
        '-vf', `select='gte(n\\,${start})',setpts=N/${fps}/TB,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920`,
        '-frames:v', String(frames), '-r', String(fps), '-an', '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-y', cut], { stdio: ['ignore', 'ignore', 'pipe'] });

      recordSpend({ provider: 'fal', route: 'motion', model: endpoint, label: `${filmId}/${s.id}`, usd: price.usd, estimate_usd: price.usd });
      writeFileSync(join(recDir, `${s.id}.json`), JSON.stringify({
        film: filmId, shot: s.id, endpoint, kind: inst.kind, instruction: inst.instruction,
      prompt_sent: promptFor(inst), standing_rules: spec.standing_rules ?? [],
        still: rec.local_path, still_sha256: rec.sha256,
        clip: `assets/motion/${filmId}/${s.id}.mp4`,
        asked_fps: fps, returned: { size: `${got[0]}x${got[1]}`, fps: gotFps },
        fps_conversion: converted ? 'optical flow (minterpolate mci/aobmc/bidir/vsbmc) - never duplication' : 'none needed, returned at 30',
        window: { start_frame: start, frames, of: prof.length, chosen: inst.kind === 'action' ? 'the busiest window in the clip' : 'the quietest window in the clip' },
        sha256: createHash('sha256').update(readFileSync(cut)).digest('hex'),
        approved: false,
        at: new Date().toISOString(),
      }, null, 2) + '\n', 'utf8');
      done.push(s.id);
      console.log(`  ${s.id}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  ${got[0]}x${got[1]}@${gotFps}${converted ? '->30 flow' : ''}  window ${start}/${prof.length} (${inst.kind})  ${frames}f`);
    } catch (e) {
      failed.push({ shot: s.id, message: String(e.message).slice(0, 140) });
      console.log(`  ${s.id}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  FAILED ${String(e.message).slice(0, 80)}`);
    }
  }
  console.log(`\n  ${done.length} of ${shots.length} animated. Nothing is approved.\n`);
  if (failed.length) for (const f of failed) console.log(`    ${f.shot}  ${f.message}`);

}

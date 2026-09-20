// fal.js - the fal adapter. Everything fal-shaped stops here.
// lib/providers.js is the interface and the rest of the codebase must not learn a
// provider's shape: callers get {url, seed, model_version, raw} and nothing else.
import { env } from './env.js';

const IMAGE_ENDPOINT = env('FAL_IMAGE_MODEL', 'fal-ai/flux/dev');
const MOTION_ENDPOINT = env('FAL_MOTION_MODEL', 'fal-ai/kling-video/v1/standard/image-to-video');

function headers() {
  const key = env('FAL_KEY');
  if (!key) throw new Error('FAL_KEY is not set. Run npm run preflight.');
  return { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
}

// fal has shipped several response shapes across endpoints and versions. Normalising
// here is the whole job of this file - a caller never sees which one came back.
export function normaliseImage(body) {
  const candidates = [
    body?.images?.[0],
    body?.image,
    body?.output?.images?.[0],
    body?.output?.image,
    body?.data?.images?.[0],
    Array.isArray(body?.output) ? body.output[0] : null,
  ].filter(Boolean);

  const first = candidates[0];
  const url =
    (typeof first === 'string' ? first : null) ??
    first?.url ?? first?.image_url ?? first?.uri ?? first?.src ??
    body?.image_url ?? body?.url ?? null;

  if (!url) {
    const err = new Error('fal returned no recognisable image url');
    err.detail = { seen_keys: Object.keys(body ?? {}), body_sample: JSON.stringify(body ?? {}).slice(0, 400) };
    throw err;
  }

  const seed = body?.seed ?? body?.seeds?.[0] ?? body?.output?.seed ?? first?.seed ?? null;
  const model_version =
    body?.model ?? body?.model_version ?? body?.meta?.model ?? body?.output?.model ?? null;

  return { url, seed, model_version, width: first?.width ?? null, height: first?.height ?? null, raw: body };
}

export function normaliseVideo(body) {
  const candidates = [
    body?.video, body?.videos?.[0], body?.output?.video, body?.output?.videos?.[0], body?.data?.video,
  ].filter(Boolean);
  const first = candidates[0];
  const url = (typeof first === 'string' ? first : null) ?? first?.url ?? first?.uri ?? body?.video_url ?? null;
  if (!url) {
    const err = new Error('fal returned no recognisable video url');
    err.detail = { seen_keys: Object.keys(body ?? {}), body_sample: JSON.stringify(body ?? {}).slice(0, 400) };
    throw err;
  }
  return { url, seed: body?.seed ?? null, model_version: body?.model ?? body?.model_version ?? null, raw: body };
}

async function post(endpoint, payload) {
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { _unparsed: text.slice(0, 400) }; }
  if (!res.ok) {
    const err = new Error(`fal ${endpoint} returned ${res.status}`);
    err.status = res.status; err.body = body;
    throw err;
  }
  return body;
}

export async function image({ prompt, seed = null, width = 1080, height = 1920 }) {
  const payload = { prompt, image_size: { width, height }, num_images: 1 };
  if (seed !== null) payload.seed = seed;
  return normaliseImage(await post(IMAGE_ENDPOINT, payload));
}

export async function motion({ image_url, prompt, duration_s = 3 }) {
  return normaliseVideo(await post(MOTION_ENDPOINT, { image_url, prompt, duration: Math.round(duration_s) }));
}

export async function ping() {
  if (!env('FAL_KEY')) return { ok: false, reason: 'no key set', detail: 'FAL_KEY is empty in .env' };
  try {
    // Cheapest non-billable probe: an auth-checked HEAD at the host.
    const res = await fetch('https://fal.run/', { method: 'HEAD', headers: headers() });
    return { ok: true, reason: `host reachable (${res.status})`, detail: 'no generation performed' };
  } catch (e) {
    return { ok: false, reason: reasonFor(e), detail: e.message.slice(0, 200) };
  }
}

function reasonFor(e) {
  const m = String(e?.cause?.message ?? e.message);
  if (/403|CONNECT|tunnel|EPROTO|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(m)) return 'host unreachable (egress policy or network)';
  return 'failed';
}

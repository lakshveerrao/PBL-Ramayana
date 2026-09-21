// fal.js - the fal adapter. Everything fal-shaped stops here.
// lib/providers.js is the interface and the rest of the codebase must not learn a
// provider's shape: callers get {url, seed, model_version, raw} and nothing else.
import { env } from './env.js';
import { referenceField, acceptsReference, unknown as unknownEndpoint } from './endpoints.js';

// Read on each call, never captured at module load. A const here would be fixed
// before any caller - or any test - could set FAL_IMAGE_MODEL, because ESM evaluates
// every import before the importing module's body runs. store.js had exactly this bug
// and it made the regressions read production data for weeks.
export function imageEndpoint() { return env('FAL_IMAGE_MODEL', 'fal-ai/flux/dev'); }
function motionEndpoint() { return env('FAL_MOTION_MODEL', 'fal-ai/kling-video/v1/standard/image-to-video'); }

// Two ways to authenticate, and the safer one keeps the key out of this container
// entirely: an environment API credential, which the agent proxy attaches to matching
// hosts after the request has left the session VM. In that mode there is no key here
// to send, and sending one would collide with the header the proxy adds.
export function authMode() {
  if (env('FAL_KEY')) return 'key';
  if (env('FAL_AUTH_VIA_PROXY') === '1') return 'proxy';
  return 'none';
}

function headers() {
  const mode = authMode();
  if (mode === 'proxy') return { 'Content-Type': 'application/json' };
  const key = env('FAL_KEY');
  if (!key) throw new Error('FAL_KEY is not set, and FAL_AUTH_VIA_PROXY is not 1. Run npm run preflight.');
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

  return {
    url, seed, model_version,
    inline: typeof url === 'string' && url.startsWith('data:'),
    width: first?.width ?? null, height: first?.height ?? null,
    raw: body,
  };
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

// sync_mode returns the image inline as a data URI from fal.run itself, rather than a
// URL on fal.media. That matters when the media host is not in the egress allowlist:
// without it the studio can generate every frame and then fail to download one.
export async function image({ prompt, negative = null, seed = null, width = 1080, height = 1920, inline = true }) {
  const payload = buildImagePayload({ prompt, negative, seed, width, height, inline });
  return normaliseImage(await post(imageEndpoint(), payload));
}

// Separated so a test can inspect what would actually be SENT. The negative prompt was
// assembled, validated and regression-tested for weeks and then dropped here, because
// every check looked at the assembly and none looked at the payload.
export function buildImagePayload({ prompt, negative = null, seed = null, width = 1080, height = 1920, inline = true }) {
  const payload = { prompt, image_size: { width, height }, num_images: 1 };
  if (negative && String(negative).trim()) payload.negative_prompt = String(negative).trim();
  if (seed !== null) payload.seed = seed;
  if (inline) payload.sync_mode = true;
  return payload;
}

// Reference-conditioned generation. data/render_policy.json says
//
//   "method": "reference-conditioned; never text-only"
//   "rule":   "Every generation references the AUTHORED SHEET, never a previous frame."
//
// and until now the studio had no way to honour it: image() is text-only, so the sheet
// files were collected, written into the render record under "references", and never
// sent. The record asserted a conditioning that had not happened.
export async function imageFromReference({ prompt, references, negative = null, seed = null, width = 1080, height = 1920, inline = true, endpoint = null }) {
  const ep = endpoint ?? imageEndpoint();
  const payload = buildReferencePayload({ prompt, references, negative, seed, width, height, inline, endpoint: ep });
  return normaliseImage(await post(ep, payload));
}

// Separated for the same reason buildImagePayload is: a test can read what would
// actually be SENT. Assembling a reference and dropping it at the payload is the exact
// failure this file has already had once.
export function buildReferencePayload({ prompt, references, negative = null, seed = null, width = 1080, height = 1920, inline = true, endpoint = null }) {
  const ep = endpoint ?? imageEndpoint();
  const refs = (Array.isArray(references) ? references : [references]).filter(Boolean).map(String);
  if (!refs.length) {
    throw new Error('reference-conditioned generation was asked for with no reference. Nothing was sent.');
  }
  const field = referenceField(ep);
  if (!field) {
    // Silence here would be the whole defect: fal accepts unknown fields and ignores
    // them, so an image_url sent to a text-to-image endpoint produces a text-only
    // picture and a 200. Refuse instead.
    throw new Error(
      unknownEndpoint(ep)
        ? `${ep} is not in lib/endpoints.js, so whether it can take a reference is unknown. Add it there after probing, rather than hoping.`
        : `${ep} is text-to-image: it has no field for a reference. render_policy.json requires reference-conditioned generation. Set FAL_IMAGE_MODEL to a reference-conditioned endpoint.`,
    );
  }

  const payload = { prompt };
  if (field === 'image_urls') payload.image_urls = refs;
  else {
    if (refs.length > 1) {
      throw new Error(`${ep} takes one reference (image_url) and ${refs.length} were given. Two principals in frame need an endpoint that accepts image_urls.`);
    }
    payload.image_url = refs[0];
  }
  if (negative && String(negative).trim()) payload.negative_prompt = String(negative).trim();
  if (seed !== null) payload.seed = seed;
  if (inline) payload.sync_mode = true;
  payload.image_size = { width, height };
  payload.num_images = 1;
  return payload;
}

export { acceptsReference };

// Split a data URI into bytes. A caller that gets one of these never needs the media
// host at all.
export function decodeInline(url) {
  const m = String(url ?? '').match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return null;
  return { contentType: m[1], bytes: Buffer.from(m[2], 'base64') };
}

export async function motion({ image_url, prompt, duration_s = 3 }) {
  return normaliseVideo(await post(motionEndpoint(), { image_url, prompt, duration: Math.round(duration_s) }));
}

export async function ping() {
  const mode = authMode();
  if (mode === 'none') {
    return { ok: false, reason: 'no credential', detail: 'FAL_KEY is unset and FAL_AUTH_VIA_PROXY is not 1' };
  }
  try {
    // Cheapest non-billable probe: an auth-checked HEAD at the host.
    const res = await fetch('https://fal.run/', { headers: headers() });
    const body = (await res.text()).slice(0, 200);
    const blocked = egressBlock(res.status, body);
    if (blocked) return { ok: false, reason: 'host blocked by network policy', detail: blocked };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'key rejected', detail: `HTTP ${res.status} from fal` };
    return {
      ok: true,
      reason: `reachable, credential accepted (HTTP ${res.status})`,
      detail: mode === 'proxy' ? 'auth attached by the agent proxy - no key in this container' : 'no generation performed',
    };
  } catch (e) {
    return { ok: false, reason: reasonFor(e), detail: e.message.slice(0, 200) };
  }
}

// The egress proxy answers a blocked host with a 403 and says so in the body. That is
// a network policy refusal, not a bad key, and reporting it as "reachable" would send
// someone hunting for a credential problem that does not exist.
export function egressBlock(status, body) {
  if (status !== 403) return null;
  const m = String(body ?? '').match(/Host not in allowlist:\s*([^.\s]+(?:\.[^.\s]+)*)/i);
  if (!m) return null;
  return `the proxy refused ${m[1]} - add it to the environment's network egress settings`;
}

function reasonFor(e) {
  const m = String(e?.cause?.message ?? e.message);
  if (/403|CONNECT|tunnel|EPROTO|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(m)) return 'host unreachable (egress policy or network)';
  return 'failed';
}

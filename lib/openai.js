// openai.js - the OpenAI images adapter. Everything OpenAI-shaped stops here.
//
// PRODUCTION_ORDERS §2 makes OpenAI images the single stills endpoint, reference-
// conditioned for every shot containing a person. Three things differ from fal and the
// rest of the studio must not learn any of them:
//
//   no negative_prompt   render_policy.json's negatives fold into the prompt BODY.
//                        The payload invariant still holds: what is assembled is sent.
//   no seed              so a run cannot be reproduced. The OUTPUT is the record, which
//                        is why every generation is written to disk with its sha256.
//   several references   /v1/images/edits takes `image[]`, so the 11 two-person shots
//                        go through the same endpoint as the other 78. One endpoint,
//                        no register shift between cuts.
import { env, proxyStatus } from './env.js';
import { authHeader, describeAuth, explainUnauthorised } from './auth.js';
import { execFileSync } from 'node:child_process';
globalThis.__pblExecFileSync = execFileSync;

const BASE = 'https://api.openai.com/v1';

export function imageModel() { return env('OPENAI_IMAGE_MODEL', 'gpt-image-2'); }

// The frame is 1080x1920 (data/render_policy.json) and NO OpenAI image model will
// produce it. Two different regimes, both probed live on 2026-09-22 by asking for
// 1080x1920 and reading the refusal:
//
//   gpt-image-1        "Supported sizes are 1024x1024, 1024x1536, 1536x1024, and auto."
//                      Its portrait option is 2:3 - not 9:16. Cropping 1024x1536 to
//                      9:16 means 864x1536, throwing away 16% of the width, and then
//                      UPSCALING to 1080x1920. Both losses, on every one of 89 shots.
//   gpt-image-2 and
//   gpt-image-2.5-*    "Width and height must both be divisible by 16." Arbitrary
//                      otherwise - and 1080 is not divisible by 16, which is why the
//                      frame itself is refused.
//
// 1152x2048 is the answer: exactly 9:16, both divisible by 16, accepted by every
// gpt-image-2 model. It DOWNSCALES to 1080x1920 by 0.9375 with no crop and no
// distortion - a reduction, which costs nothing visible, rather than an enlargement.
//
// That is why the default model here is gpt-image-2 and not gpt-image-1: the choice is
// made by what the frame requires, not by preference.
export const FIXED_SIZES = ['1024x1024', '1024x1536', '1536x1024'];

export function generationSize(width, height, model = null) {
  const m = model ?? imageModel();
  const want = width / height;

  if (/^gpt-image-1/.test(m)) {
    // Pick the fixed size closest in aspect, and say what it will cost.
    const best = FIXED_SIZES
      .map((s) => { const [w, h] = s.split('x').map(Number); return { s, w, h, err: Math.abs(w / h - want) }; })
      .sort((a, b) => a.err - b.err)[0];
    const cropW = Math.round(best.h * want);
    return {
      size: best.s, width: best.w, height: best.h,
      exact: best.err < 1e-9,
      crop_to: cropW < best.w ? `${cropW}x${best.h}` : null,
      then_scale: cropW < best.w ? +(width / cropW).toFixed(4) : +(width / best.w).toFixed(4),
      note: best.err < 1e-9 ? null
        : `${m} cannot make ${width}x${height}. Nearest is ${best.s}; reaching ${width}x${height} means cropping to `
        + `${cropW}x${best.h} (losing ${Math.round(100 * (1 - cropW / best.w))}% of the width) and then enlarging.`,
    };
  }

  // The divisible-by-16 family: find the smallest exact-aspect size at or above the
  // frame, so the final step is always a reduction.
  const up16 = (n) => Math.ceil(n / 16) * 16;
  for (let k = 1; k <= 64; k++) {
    const w = 16 * 9 * k, h = 16 * 16 * k;       // 144x256, 288x512, ... always 9:16
    if (Math.abs(w / h - want) > 1e-9) break;
    if (w >= width && h >= height) {
      return { size: `${w}x${h}`, width: w, height: h, exact: true, crop_to: null,
               then_scale: +(width / w).toFixed(4),
               note: `${w}x${h} is exactly ${width}:${height}'s aspect and divisible by 16. Downscale to ${width}x${height}.` };
    }
  }
  // Not a 9:16 frame: round up to the grid and report the aspect error honestly.
  const w = up16(width), h = up16(height);
  return { size: `${w}x${h}`, width: w, height: h, exact: Math.abs(w / h - want) < 1e-9,
           crop_to: null, then_scale: +(width / w).toFixed(4),
           note: `rounded up to the divisible-by-16 grid; aspect is ${(w / h).toFixed(4)} against ${want.toFixed(4)}` };
}

// Measured on 2026-09-22: with the environment credential configured, a deliberately
// WRONG bearer token still returned 200. So the proxy REPLACES whatever is sent here.
// A key in this container is therefore neither needed nor trusted, and preflight must
// never report "key valid" for a request that carried no key.
export function authMode() { return describeAuth('OPENAI_API_KEY').mode; }

function headers(extra = {}) {
  return { ...authHeader('Authorization', 'OPENAI_API_KEY', 'Bearer'), ...extra };
}

// The agent proxy answers 502 "upstream request failed" intermittently on these calls.
// Measured 2026-09-22: the identical request failed once and succeeded on the retry,
// both taking ~30s. Over an 89-shot run that is not an edge case, it is a certainty.
//
// Retried ONLY on the statuses that mean "nothing happened upstream" - a gateway error
// or a rate limit. A 400 or a content refusal is never retried: it would be the same
// answer at more cost, and a refusal has to be recorded exactly, not papered over.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
export const MAX_ATTEMPTS = Number(process.env.PBL_OPENAI_ATTEMPTS ?? 6);

export function shouldRetry(status) { return RETRY_STATUS.has(status); }

async function post(path, body, extraHeaders = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await postOnce(path, body, extraHeaders);
    } catch (e) {
      lastErr = e;
      if (!shouldRetry(e.status) || attempt === MAX_ATTEMPTS) throw e;
      // A multipart body built from a FormData can be re-sent as-is; fetch re-reads it.
      // Jittered, so a batch of shots that all fail at once does not retry in lockstep.
      const wait = Math.round(2000 * 2 ** (attempt - 1) * (0.7 + Math.random() * 0.6));
      process.stderr.write(`    ${path} returned ${e.status}; retrying in ${wait / 1000}s (attempt ${attempt + 1} of ${MAX_ATTEMPTS})\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function postOnce(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(extraHeaders), body });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { _unparsed: text.slice(0, 400) }; }
  if (!res.ok) {
    const err = new Error(`openai ${path} returned ${res.status}: ${parsed?.error?.message ?? ''}`.trim());
    err.status = res.status;
    err.body = parsed;
    // Its content rules are stricter than fal's. PRODUCTION_ORDERS §2 says record a
    // refusal exactly rather than paraphrasing it - later arcs contain violence.
    err.refusal = /safety|content.policy|moderation|rejected/i.test(parsed?.error?.message ?? '')
      ? { message: parsed.error.message, code: parsed.error.code ?? null, type: parsed.error.type ?? null }
      : null;
    throw err;
  }
  return parsed;
}

// OpenAI returns b64_json by default for the gpt-image family, and a URL for some
// others. Normalise to the same {url, ...} shape every other adapter returns, with the
// bytes inline so nothing downstream needs a second host.
export function normaliseImage(body, model) {
  const first = body?.data?.[0];
  if (!first) {
    const err = new Error('openai returned no image');
    err.detail = { seen_keys: Object.keys(body ?? {}), body_sample: JSON.stringify(body ?? {}).slice(0, 400) };
    throw err;
  }
  // The media type has to match what was actually asked for, or a caller writing the
  // bytes to disk names a JPEG ".png".
  const mime = (body?.output_format ?? responseFormat().output_format) === 'png' ? 'image/png' : 'image/jpeg';
  const url = first.b64_json ? `data:${mime};base64,${first.b64_json}` : (first.url ?? null);
  if (!url) throw new Error('openai returned an image with neither b64_json nor url');
  return {
    url,
    seed: null,                         // there is no seed. Saying null is the honest answer.
    model_version: body?.model ?? model ?? null,
    inline: url.startsWith('data:'),
    width: null, height: null,
    revised_prompt: first.revised_prompt ?? null,
    usage: body?.usage ?? null,
    raw: { ...body, data: [{ ...first, b64_json: first.b64_json ? '<omitted>' : undefined }] },
  };
}

// Separated so a test can read what would actually be SENT. Twice now a value has been
// assembled, recorded and never sent; the payload is checked, not the assembly.
export function buildGeneratePayload({ prompt, width = 1080, height = 1920, model = null, quality = null }) {
  if (!prompt || !String(prompt).trim()) throw new Error('a generation was asked for with no prompt. Nothing was sent.');
  const m = model ?? imageModel();
  // Never send the frame size blind: the model would refuse 1080x1920 outright.
  const gen = generationSize(width, height, m);
  const payload = { model: m, prompt: String(prompt), size: gen.size, n: 1, ...responseFormat() };
  if (quality) payload.quality = quality;
  return payload;
}

export async function image({ prompt, negative = null, width = 1080, height = 1920, model = null, quality = null }) {
  if (negative && String(negative).trim()) {
    // There is no field for it, and silently dropping it is exactly the defect this
    // codebase already shipped once. The caller folds negatives into the prompt body.
    throw new Error('OpenAI images has no negative_prompt field. Fold the negatives into the prompt body (see lib/prompt.js) rather than passing them here, so what is assembled is what is sent.');
  }
  const payload = buildGeneratePayload({ prompt, width, height, model, quality });
  const out = normaliseImage(await post('/images/generations', JSON.stringify(payload), { 'Content-Type': 'application/json' }), payload.model);
  // The caller asked for 1080x1920 and got 1152x2048. Say so rather than let a later
  // stage discover it: the record has to match what was actually produced.
  return { ...out, generated_size: payload.size, frame: `${width}x${height}`, needs_scale_to_frame: payload.size !== `${width}x${height}` };
}

// Reference-conditioned. /v1/images/edits is multipart, and takes several references
// under the repeated field `image[]`.
// Ask for the image back as JPEG, not PNG.
//
// A 1152x2048 PNG comes back as a ~4MB base64 blob and the agent proxy drops roughly
// one such response in three with a 502. Measured 2026-09-22: PNG succeeded 1 of 3,
// JPEG at quality 90 succeeded 3 of 4, and the response fell from 4MB to ~340KB.
//
// Nothing visible is lost. Every still is downscaled from 1152x2048 to the 1080x1920
// frame and then encoded into H.264, so a JPEG at 90 is well inside what survives the
// pipeline. Set PBL_IMAGE_OUTPUT=png where a lossless intermediate actually matters.
export function responseFormat() {
  const fmt = process.env.PBL_IMAGE_OUTPUT ?? 'jpeg';
  if (fmt === 'png') return { output_format: 'png' };
  return { output_format: 'jpeg', output_compression: Number(process.env.PBL_IMAGE_JPEG_QUALITY ?? 90) };
}

// A large reference breaks the request outright: the proxy answered 502 for a 2.7MB
// body, and succeeded with the same image re-encoded to 308KB. Re-encoding changes the
// BYTES, not the dimensions - and OpenAI charges input image tokens by dimensions, so
// this costs nothing that matters. Done here so no caller can forget.
export const MAX_REFERENCE_BYTES = Number(process.env.PBL_MAX_REFERENCE_BYTES ?? 900_000);

function shrinkIfHuge(bytes, name) {
  if (bytes.length <= MAX_REFERENCE_BYTES) return { bytes, type: null, name };
  try {
    const out = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-q:v', '3', '-f', 'mjpeg', 'pipe:1'],
      { input: bytes, maxBuffer: 1 << 28 });
    if (out.length && out.length < bytes.length) {
      return { bytes: out, type: 'image/jpeg', name: name.replace(/\.[a-z0-9]+$/i, '.jpg') };
    }
  } catch { /* no ffmpeg: send it as it is and let the proxy answer */ }
  return { bytes, type: null, name };
}

export function buildEditForm({ prompt, references, width = 1080, height = 1920, model = null, quality = null }) {
  const refs = (Array.isArray(references) ? references : [references]).filter(Boolean);
  if (!refs.length) throw new Error('reference-conditioned generation was asked for with no reference. Nothing was sent.');
  if (!prompt || !String(prompt).trim()) throw new Error('a reference-conditioned generation was asked for with no prompt. Nothing was sent.');

  const m = model ?? imageModel();
  const gen = generationSize(width, height, m);
  const fields = { model: m, prompt: String(prompt), size: gen.size, n: '1', ...responseFormat() };
  if (quality) fields.quality = quality;

  const files = refs.map((r, i) => {
    const raw = asBlobParts(r, i);
    const small = shrinkIfHuge(raw.bytes, raw.name);
    return { field: 'image[]', name: small.name, type: small.type ?? raw.type, bytes: small.bytes };
  });

  const { body, contentType } = multipart(fields, files);
  return { body, contentType, sent_references: refs.length, size: gen.size, bytes: body.length };
}

// Built by hand into a single Buffer, with a Content-Length, instead of using FormData.
//
// Node's fetch sends a FormData body with chunked transfer encoding and no
// Content-Length. Measured 2026-09-22: through this agent proxy, curl (which sets a
// Content-Length) succeeded 3 times in 4, while node's FormData failed 6 times in 6 on
// the identical request, retries and all. The proxy does not handle the chunked upload.
//
// A buffer costs memory - a few hundred KB per reference - and buys a request that
// actually arrives.
export function multipart(fields, files) {
  const boundary = `----pbl${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\n`
      + `Content-Type: ${f.type ?? 'image/png'}\r\n\r\n`));
    parts.push(f.bytes);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// A reference may arrive as a data URI, raw bytes, or {bytes, contentType, name}.
function asBlobParts(ref, i) {
  if (ref && typeof ref === 'object' && ref.bytes) {
    return { bytes: ref.bytes, type: ref.contentType ?? 'image/png', name: ref.name ?? `ref-${i}.png` };
  }
  if (Buffer.isBuffer(ref)) return { bytes: ref, type: 'image/png', name: `ref-${i}.png` };
  const m = String(ref).match(/^data:([^;]+);base64,(.*)$/s);
  if (m) return { bytes: Buffer.from(m[2], 'base64'), type: m[1], name: `ref-${i}.${m[1].includes('jpeg') ? 'jpg' : 'png'}` };
  throw new Error(`a reference was given as a ${typeof ref} the adapter cannot send: OpenAI edits takes file parts, not URLs. Read the file first.`);
}

export async function imageFromReference({ prompt, references, negative = null, width = 1080, height = 1920, model = null, quality = null }) {
  if (negative && String(negative).trim()) {
    throw new Error('OpenAI images has no negative_prompt field. Fold the negatives into the prompt body rather than passing them here.');
  }
  const { body, contentType, size } = buildEditForm({ prompt, references, width, height, model, quality });
  const out = normaliseImage(await post('/images/edits', body, { 'Content-Type': contentType, 'Content-Length': String(body.length) }), model ?? imageModel());
  return { ...out, generated_size: size, frame: `${width}x${height}`, needs_scale_to_frame: size !== `${width}x${height}` };
}

export async function ping() {
  try {
    const res = await fetch(`${BASE}/models`, { headers: headers() });
    const text = await res.text();
    if (res.status === 403 && /Host not in allowlist/i.test(text)) {
      return { ok: false, reason: 'host blocked by network policy', detail: 'api.openai.com is not in the environment egress allowlist' };
    }
    if (res.status === 401) {
      // Almost always this, in this environment: the credential lives in the agent
      // proxy and node went around it. Say which, rather than "key rejected".
      const px = proxyStatus();
      if (px.bypassing) {
        return { ok: false, reason: 'the request bypassed the agent proxy',
                 detail: `no OPENAI_API_KEY here and node is not using HTTPS_PROXY, so the credential the proxy attaches never arrived. ${px.fix}.` };
      }
      return { ok: false, reason: 'not authenticated', detail: explainUnauthorised(401, 'OpenAI', 'api.openai.com') };
    }
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, detail: text.slice(0, 200) };

    let models = [];
    try { models = (JSON.parse(text)?.data ?? []).map((m) => m.id); } catch { /* the status already answered the question */ }
    return {
      ok: true,
      reason: 'a real request was answered as authenticated',
      detail: `${describeAuth('OPENAI_API_KEY').detail}. No image generated.`,
      models: models.filter((m) => /image/.test(m)),
    };
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: String(e.message).slice(0, 200) };
  }
}

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

const BASE = 'https://api.openai.com/v1';

export function imageModel() { return env('OPENAI_IMAGE_MODEL', 'gpt-image-1'); }

// Measured on 2026-09-22: with the environment credential configured, a deliberately
// WRONG bearer token still returned 200. So the proxy REPLACES whatever is sent here.
// A key in this container is therefore neither needed nor trusted, and preflight must
// never report "key valid" for a request that carried no key.
export function authMode() { return describeAuth('OPENAI_API_KEY').mode; }

function headers(extra = {}) {
  return { ...authHeader('Authorization', 'OPENAI_API_KEY', 'Bearer'), ...extra };
}

async function post(path, body, extraHeaders = {}) {
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
  const url = first.b64_json ? `data:image/png;base64,${first.b64_json}` : (first.url ?? null);
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
export function buildGeneratePayload({ prompt, width = 1024, height = 1536, model = null, quality = null }) {
  if (!prompt || !String(prompt).trim()) throw new Error('a generation was asked for with no prompt. Nothing was sent.');
  const payload = { model: model ?? imageModel(), prompt: String(prompt), size: `${width}x${height}`, n: 1 };
  if (quality) payload.quality = quality;
  return payload;
}

export async function image({ prompt, negative = null, width = 1024, height = 1536, model = null, quality = null }) {
  if (negative && String(negative).trim()) {
    // There is no field for it, and silently dropping it is exactly the defect this
    // codebase already shipped once. The caller folds negatives into the prompt body.
    throw new Error('OpenAI images has no negative_prompt field. Fold the negatives into the prompt body (see lib/prompt.js) rather than passing them here, so what is assembled is what is sent.');
  }
  const payload = buildGeneratePayload({ prompt, width, height, model, quality });
  return normaliseImage(await post('/images/generations', JSON.stringify(payload), { 'Content-Type': 'application/json' }), payload.model);
}

// Reference-conditioned. /v1/images/edits is multipart, and takes several references
// under the repeated field `image[]`.
export function buildEditForm({ prompt, references, width = 1024, height = 1536, model = null, quality = null }) {
  const refs = (Array.isArray(references) ? references : [references]).filter(Boolean);
  if (!refs.length) throw new Error('reference-conditioned generation was asked for with no reference. Nothing was sent.');
  if (!prompt || !String(prompt).trim()) throw new Error('a reference-conditioned generation was asked for with no prompt. Nothing was sent.');

  const form = new FormData();
  form.append('model', model ?? imageModel());
  form.append('prompt', String(prompt));
  form.append('size', `${width}x${height}`);
  form.append('n', '1');
  if (quality) form.append('quality', quality);
  refs.forEach((r, i) => {
    const { bytes, type, name } = asBlobParts(r, i);
    form.append('image[]', new Blob([bytes], { type }), name);
  });
  return { form, sent_references: refs.length };
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

export async function imageFromReference({ prompt, references, negative = null, width = 1024, height = 1536, model = null, quality = null }) {
  if (negative && String(negative).trim()) {
    throw new Error('OpenAI images has no negative_prompt field. Fold the negatives into the prompt body rather than passing them here.');
  }
  const { form } = buildEditForm({ prompt, references, width, height, model, quality });
  return normaliseImage(await post('/images/edits', form), model ?? imageModel());
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

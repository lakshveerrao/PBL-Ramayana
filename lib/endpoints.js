// endpoints.js - what each fal image endpoint can actually do.
//
// This file exists because of a question that looked like taste and was not:
// "is flux-pro good?". flux-pro v1.1 makes the best single photograph of the
// endpoints probed, and cannot do the job data/render_policy.json mandates:
//
//   "method": "reference-conditioned; never text-only"
//
// A text-to-image endpoint has no field for a reference. It is not that it does it
// badly - there is nowhere to put the sheet. So the capability, not the quality, is
// what decides, and it has to be a property the code can read rather than something
// remembered.
//
// `reference` names the field that carries the approved sheet, or null for text-only.
// Probed against the live API on 2026-09-21 by POSTing an empty body: a real endpoint
// answers 422 and names its required fields, a nonexistent one answers 404. Nothing is
// generated, so nothing is billed.
//
// `usd` is per image. Prices marked estimated: false were taken from fal's published
// list; the rest are pessimistic placeholders, because fal.ai is not in this
// environment's egress allowlist and the pricing page cannot be read from here. An
// estimated price is never presented as a known one - see cost.js.

export const ENDPOINTS = {
  // --- text-to-image: an anchor has nothing to be conditioned on, so this is its place
  'fal-ai/flux/schnell':                    { reference: null, usd: 0.003, estimated: false, note: 'fast, plainly illustrative' },
  'fal-ai/flux/dev':                        { reference: null, usd: 0.025, estimated: false, note: 'reads as concept art; the probes showed it' },
  'fal-ai/flux-pro/v1.1':                   { reference: null, usd: 0.04,  estimated: false, note: 'photographic; the anchor endpoint' },
  'fal-ai/flux-pro/v1.1-ultra':             { reference: null, usd: 0.06,  estimated: false, note: 'higher resolution, same family' },
  'fal-ai/flux-pro/kontext/max/text-to-image': { reference: null, usd: 0.08, estimated: true, note: 'kontext family, text-only variant' },
  'fal-ai/bytedance/seedream/v3/text-to-image': { reference: null, usd: 0.03, estimated: true },
  'fal-ai/recraft-v3':                      { reference: null, usd: 0.04,  estimated: true },
  'fal-ai/flux-realism':                    { reference: null, usd: 0.025, estimated: true },

  // --- reference-conditioned: the sheet travels in the request
  'fal-ai/flux-pro/kontext':                { reference: 'image_url',  usd: 0.04, estimated: true, note: 'edit conditioned on one reference' },
  'fal-ai/flux-pro/kontext/max':            { reference: 'image_url',  usd: 0.08, estimated: true, note: 'strongest single-reference identity in the flux family' },
  'fal-ai/flux-kontext/dev':                { reference: 'image_url',  usd: 0.025, estimated: true },
  'fal-ai/flux/dev/image-to-image':         { reference: 'image_url',  usd: 0.025, estimated: true, note: 'denoise-from-image; holds composition, not identity' },
  'fal-ai/flux-pro/v1/redux':               { reference: 'image_url',  usd: 0.04, estimated: true, note: 'no prompt field - restyles a reference, cannot be directed' },
  'fal-ai/flux/dev/redux':                  { reference: 'image_url',  usd: 0.025, estimated: true, note: 'no prompt field' },
  'fal-ai/ip-adapter-face-id':              { reference: 'image_url',  usd: 0.025, estimated: true, note: 'face embedding only; discards clothing and props' },
  'fal-ai/nano-banana/edit':                { reference: 'image_urls', usd: 0.039, estimated: true, note: 'accepts several references at once' },
  'fal-ai/gemini-25-flash-image/edit':      { reference: 'image_urls', usd: 0.039, estimated: true, note: 'same family as nano-banana' },
  'fal-ai/qwen-image-edit-plus':            { reference: 'image_urls', usd: 0.03, estimated: true },
  'fal-ai/qwen-image-edit':                 { reference: 'image_urls', usd: 0.03, estimated: true },
  'fal-ai/bytedance/seedream/v4/edit':      { reference: 'image_urls', usd: 0.03, estimated: true, note: 'accepts several references at once' },
};

export function describe(endpoint) {
  return ENDPOINTS[endpoint] ?? null;
}

// The one question render.js needs answered before it spends: can this endpoint be
// given the approved sheet at all?
export function acceptsReference(endpoint) {
  return Boolean(ENDPOINTS[endpoint]?.reference);
}

// Which field. Two shapes are in use and a caller must never guess: sending image_url
// to an endpoint that reads image_urls is accepted silently by fal and ignored, which
// is exactly how a reference-conditioned run becomes a text-only one without saying so.
export function referenceField(endpoint) {
  return ENDPOINTS[endpoint]?.reference ?? null;
}

export function textToImage() {
  return Object.keys(ENDPOINTS).filter((e) => !ENDPOINTS[e].reference);
}

export function referenceConditioned() {
  return Object.keys(ENDPOINTS).filter((e) => ENDPOINTS[e].reference);
}

// An endpoint the registry has never heard of is not an error - fal ships new ones
// constantly. It is a thing to say out loud rather than assume about.
export function unknown(endpoint) {
  return !(endpoint in ENDPOINTS);
}

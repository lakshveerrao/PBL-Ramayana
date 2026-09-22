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

// --- motion -----------------------------------------------------------------------
// Probed the same way and on the same terms as the image table: an empty-body POST to
// https://fal.run/<endpoint> on 2026-09-22. 422 means the endpoint exists and answered
// as authenticated; 404 means there is no such endpoint. Nothing is generated, nothing
// is billed. Every one of these answered 422 naming the same two required fields,
// `prompt` and `image_url`, so the request shape is uniform across the family.
//
// PRICES ARE ESTIMATED, every one. fal.ai (the website) answers 403 through this
// environment's proxy - only fal.run, the API host, is reachable - so the pricing page
// cannot be read from here and no figure below was taken from it. They are pessimistic
// placeholders for ordering an estimate, never a quote. cost.js must keep saying so.
//
// `seconds` is the shortest clip the endpoint will make. Every M1 shot is under 2.2 s,
// so every clip comes back longer than the cut and is trimmed to the shot's frames.
export const MOTION_ENDPOINTS = {
  'fal-ai/kling-video/v1.6/standard/image-to-video':  { exists: true, usd: 0.23, seconds: 5, estimated: true, family: 'kling', note: 'the incumbent family' },
  'fal-ai/kling-video/v2.1/standard/image-to-video':  { exists: true, usd: 0.25, seconds: 5, estimated: true, family: 'kling' },
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': { exists: true, usd: 0.35, seconds: 5, estimated: true, family: 'kling', note: 'strongest identity hold in the kling line' },
  'fal-ai/minimax/video-01-live/image-to-video':      { exists: true, usd: 0.28, seconds: 5, estimated: true, family: 'minimax' },
  'fal-ai/minimax/hailuo-02/standard/image-to-video': { exists: true, usd: 0.27, seconds: 6, estimated: true, family: 'minimax', note: 'different family; strong physical motion' },
  'fal-ai/luma-dream-machine/image-to-video':         { exists: true, usd: 0.50, seconds: 5, estimated: true, family: 'luma' },
  'fal-ai/stable-video':                              { exists: true, usd: 0.10, seconds: 4, estimated: true, family: 'svd', note: 'no prompt steering worth the name' },
  'fal-ai/wan-i2v':                                   { exists: true, usd: 0.10, seconds: 5, estimated: true, family: 'wan' },
  'fal-ai/wan/v2.2-a14b/image-to-video':              { exists: true, usd: 0.10, seconds: 5, estimated: true, family: 'wan', note: 'open model; cloth is its reputation' },
  'fal-ai/veo3/image-to-video':                       { exists: true, usd: 2.00, seconds: 8, estimated: true, family: 'veo', note: 'an order of magnitude dearer than the rest' },
  'fal-ai/pixverse/v4.5/image-to-video':              { exists: true, usd: 0.25, seconds: 5, estimated: true, family: 'pixverse' },
  // Probed and NOT usable, kept so nobody probes them again:
  'fal-ai/ltx-video/image-to-video':                  { exists: false, usd: null, seconds: null, estimated: true, family: 'ltx', note: 'answered 503 on 2026-09-22, not 422 - unavailable, not absent' },
  'fal-ai/seedance/v1/pro/image-to-video':            { exists: false, usd: null, seconds: null, estimated: true, family: 'seedance', note: '404 - no such endpoint' },
};

export function motionDescribe(endpoint) { return MOTION_ENDPOINTS[endpoint] ?? null; }
export function motionEndpointsAvailable() {
  return Object.entries(MOTION_ENDPOINTS).filter(([, v]) => v.exists).map(([k]) => k);
}

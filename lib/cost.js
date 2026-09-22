// cost.js - model routing and the money.
// Routing is deliberate: Haiku assembles image prompts, Sonnet writes, Opus criticises.
// The critics run on a different model from the director, on purpose - a critic that
// shares the director's model agrees with it.
//
// Prompt caching is on and the system block never varies between films. That is what
// keeps a kanda at roughly $45 instead of roughly $300.

// Anthropic first-party rates, USD per million tokens.
export const RATES = {
  'claude-opus-5':   { in: 5.00, out: 25.00 },
  'claude-sonnet-5': { in: 2.00, out: 10.00 },
  'claude-haiku-4-5':{ in: 1.00, out:  5.00 },
};

// Cache multipliers against the input rate.
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.10;

export const ROUTES = {
  'image-prompt': { model: 'claude-haiku-4-5', why: 'Assembly, not judgement. It slots locked facts into a template.' },
  'direct':       { model: 'claude-sonnet-5',  why: 'Writes the treatment. The writing model.' },
  'adapt':        { model: 'claude-sonnet-5',  why: 'Adapts narration into hi and te. Writing, not judgement.' },
  'critic-register': { model: 'claude-opus-5', why: 'Criticises. Different model from the director on purpose.' },
  'critic-evidence': { model: 'claude-opus-5', why: 'Criticises. Different model from the director on purpose.' },
};

export function modelFor(route) {
  const r = ROUTES[route];
  if (!r) throw new Error(`no route: ${route}`);
  return r.model;
}

// usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
export function priceOf(model, usage = {}) {
  const rate = RATES[model];
  if (!rate) throw new Error(`no rate for model: ${model}`);
  const fresh = usage.input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;

  const usd =
    (fresh / 1e6) * rate.in +
    (write / 1e6) * rate.in * CACHE_WRITE_MULTIPLIER +
    (read / 1e6) * rate.in * CACHE_READ_MULTIPLIER +
    (out / 1e6) * rate.out;

  return { usd: round6(usd), model, tokens: { fresh, write, read, out } };
}

// What one film's direction round costs: direct + two critics + two adaptations.
// These are token shapes, not guesses at dollars - the dollars fall out of RATES.
export const FILM_SHAPE = {
  direct:           { route: 'direct',          in: 9000, out: 3500, cached_in: 7000 },
  'critic-register':{ route: 'critic-register', in: 6500, out: 1200, cached_in: 5000 },
  'critic-evidence':{ route: 'critic-evidence', in: 6500, out: 1200, cached_in: 5000 },
  'adapt-hi':       { route: 'adapt',           in: 3000, out: 1400, cached_in: 2200 },
  'adapt-te':       { route: 'adapt',           in: 3000, out: 1400, cached_in: 2200 },
};

// first_film: nothing is cached yet, so the cacheable part is written not read.
export function estimateFilm({ first_film = false } = {}) {
  const lines = [];
  let total = 0;
  for (const [step, shape] of Object.entries(FILM_SHAPE)) {
    const model = modelFor(shape.route);
    const cached = shape.cached_in;
    const fresh = Math.max(0, shape.in - cached);
    const usage = {
      input_tokens: fresh,
      output_tokens: shape.out,
      cache_creation_input_tokens: first_film ? cached : 0,
      cache_read_input_tokens: first_film ? 0 : cached,
    };
    const p = priceOf(model, usage);
    lines.push({ step, model, ...p });
    total += p.usd;
  }
  return { lines, usd: round6(total), first_film };
}

export function estimateArc(filmCount = 7) {
  const first = estimateFilm({ first_film: true });
  const rest = estimateFilm({ first_film: false });
  const usd = first.usd + rest.usd * (filmCount - 1);
  return { usd: round6(usd), first_film_usd: first.usd, later_film_usd: rest.usd, films: filmCount };
}

// fal and ElevenLabs unit costs. Published list prices; preflight reports if they cannot
// be reached, and nothing is ever spent without an estimate shown first.
// Image cost is PER ENDPOINT. A single price for all of them made every estimate
// wrong the moment the endpoint changed, which defeats the point of estimating.
//
// These are list prices and they move. Confirm against the fal dashboard before
// committing to a large run; endpointCost() falls back to the default and says so
// rather than quietly guessing.
export const IMAGE_ENDPOINT_USD = {
  'fal-ai/flux/dev': 0.025,
  'fal-ai/flux/schnell': 0.003,
  'fal-ai/flux-pro/v1.1': 0.04,
  'fal-ai/flux-pro/v1.1-ultra': 0.06,
  'fal-ai/flux-realism': 0.025,
};
export const IMAGE_DEFAULT_USD = 0.05;   // deliberately pessimistic when unknown

export function endpointCost(endpoint) {
  const known = IMAGE_ENDPOINT_USD[endpoint];
  return known !== undefined
    ? { usd: known, endpoint, known: true }
    : { usd: IMAGE_DEFAULT_USD, endpoint, known: false,
        note: `no list price recorded for ${endpoint} - estimating at the pessimistic default $${IMAGE_DEFAULT_USD}. Confirm on the fal dashboard.` };
}

export const UNIT = {
  image: { usd: 0.025, unit: 'one 1080x1920 still', note: 'default only - use endpointCost() for a real estimate' },
  motion: { usd: 0.25, unit: 'one ~3s motion clip' },
  voice: { usd: 0.00018, unit: 'per character, ElevenLabs' },
};

export function estimateShots(shots) {
  const gen = shots.filter((s) => s.source === 'generate').length;
  const reuse = shots.filter((s) => s.source !== 'generate').length;
  return { generate: gen, reuse, usd: round6(gen * UNIT.image.usd), unit: UNIT.image };
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

// ---------------------------------------------------------------- OpenAI images
// Priced per TOKEN, not per image. Read from OpenAI's own pricing payload on
// 2026-09-22 (USD per 1,000,000 tokens). Not a guess and not from memory.
export const OPENAI_IMAGE_USD_PER_MTOK = {
  'gpt-image-2':                  { image_in: 8,   image_out: 30, text_in: 5 },
  'gpt-image-2.5-sunburst':       { image_in: 8,   image_out: 30, text_in: 5 },
  'gpt-image-2.5-flare':          { image_in: 8,   image_out: 30, text_in: 5 },
  'gpt-image-1.5':                { image_in: 8,   image_out: 32, text_in: 5 },
  'gpt-image-1':                  { image_in: 10,  image_out: 40, text_in: 5 },
  'gpt-image-1-mini':             { image_in: 2.5, image_out: 8,  text_in: 2 },
  'chatgpt-image-latest':         { image_in: 8,   image_out: 32, text_in: 5 },
};

// The one number that is NOT verified: how many output tokens a 1152x2048 image costs
// at each quality. OpenAI publishes token counts for gpt-image-1's three fixed sizes
// and not for an arbitrary size on gpt-image-2, and the figure cannot be probed without
// generating - the token count comes back in `usage` on a real response.
//
// So this is an ESTIMATE, scaled from gpt-image-1's published 1024x1536 high count of
// 6208 tokens by pixel area, and every caller is told it is unverified. One real
// generation replaces it with the exact number.
export const IMAGE_OUT_TOKENS_REFERENCE = { size: '1024x1536', quality: 'high', tokens: 6208, from: 'OpenAI published counts for gpt-image-1' };

export function openaiImageCost({ model = 'gpt-image-2', size = '1152x2048', quality = 'high', references = 0, prompt_chars = 2000 } = {}) {
  const price = OPENAI_IMAGE_USD_PER_MTOK[model];
  if (!price) {
    return { usd: 0.25, known: false, model, note: `no published price recorded for ${model} - estimating pessimistically. Add it to lib/cost.js after checking.` };
  }
  const [w, h] = size.split('x').map(Number);
  const [rw, rh] = IMAGE_OUT_TOKENS_REFERENCE.size.split('x').map(Number);
  const areaRatio = (w * h) / (rw * rh);
  const qualityFactor = quality === 'low' ? 0.065 : quality === 'medium' ? 0.25 : 1;   // gpt-image-1's own low/medium/high ratios
  const out_tokens = Math.round(IMAGE_OUT_TOKENS_REFERENCE.tokens * areaRatio * qualityFactor);

  // A reference image is charged as INPUT image tokens. Same area basis.
  const in_tokens_per_ref = Math.round(IMAGE_OUT_TOKENS_REFERENCE.tokens * ((1024 * 1536) / (rw * rh)) * 0.25);
  const text_tokens = Math.ceil(prompt_chars / 4);

  const usd = (out_tokens * price.image_out + references * in_tokens_per_ref * price.image_in + text_tokens * price.text_in) / 1e6;
  return {
    usd: Math.round(usd * 1e4) / 1e4,
    known: false,
    model, size, quality, references,
    out_tokens, in_tokens: references * in_tokens_per_ref, text_tokens,
    note: 'per-token prices are verified from OpenAI\'s published table; the TOKEN COUNT for this size is scaled from '
        + `gpt-image-1's published ${IMAGE_OUT_TOKENS_REFERENCE.size} ${IMAGE_OUT_TOKENS_REFERENCE.quality} count and is NOT verified. `
        + 'One real generation returns the exact count in `usage` and replaces this.',
  };
}

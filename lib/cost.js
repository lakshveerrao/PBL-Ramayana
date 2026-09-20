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
export const UNIT = {
  image: { usd: 0.025, unit: 'one 1080x1920 still' },
  motion: { usd: 0.25, unit: 'one ~3s motion clip' },
  voice: { usd: 0.00018, unit: 'per character, ElevenLabs' },
};

export function estimateShots(shots) {
  const gen = shots.filter((s) => s.source === 'generate').length;
  const reuse = shots.filter((s) => s.source !== 'generate').length;
  return { generate: gen, reuse, usd: round6(gen * UNIT.image.usd), unit: UNIT.image };
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

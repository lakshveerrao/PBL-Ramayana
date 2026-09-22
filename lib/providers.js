// providers.js - one interface per concern. Swap in .env, change no code.
// A caller never learns a provider's shape. If a provider's response changes, the
// adapter changes; this file and everything above it does not.
import { env } from './env.js';
import * as claude from './claude.js';
import * as fal from './fal.js';
import * as eleven from './eleven.js';
import * as openai from './openai.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './store.js';

export const CONCERNS = ['TEXT_PROVIDER', 'IMAGE_PROVIDER', 'MOTION_PROVIDER', 'VOICE_PROVIDER', 'MUSIC_PROVIDER'];

export function configured() {
  return {
    text: env('TEXT_PROVIDER', 'anthropic'),
    image: env('IMAGE_PROVIDER', 'fal'),
    motion: env('MOTION_PROVIDER', 'fal'),
    voice: env('VOICE_PROVIDER', 'elevenlabs'),
    music: env('MUSIC_PROVIDER', 'none'),
  };
}

class NotConfigured extends Error {
  constructor(concern, name) {
    super(`${concern} provider "${name}" is not implemented`);
    this.name = 'NotConfigured';
  }
}

export const text = {
  async call(args) {
    const p = configured().text;
    if (p === 'anthropic') return claude.call(args);
    if (p === 'none') throw new NotConfigured('text', p);
    throw new NotConfigured('text', p);
  },
  async ping() {
    const p = configured().text;
    if (p === 'anthropic') return claude.ping();
    if (p === 'none') return { ok: true, reason: 'provider is none', detail: 'no text provider configured, on purpose' };
    return { ok: false, reason: `unknown provider "${p}"`, detail: '' };
  },
};

export const image = {
  async generate(args) {
    const p = configured().image;
    if (p === 'fal') return fal.image(args);
    if (p === 'openai') return openai.image(args);
    throw new NotConfigured('image', p);
  },
  // The reference-conditioned route. A caller asking for this is asking for the
  // approved sheet to travel with the request; a provider that cannot do it says so
  // rather than quietly producing a text-only picture.
  async generateFromReference(args) {
    const p = configured().image;
    if (p === 'fal') return fal.imageFromReference(args);
    if (p === 'openai') return openai.imageFromReference(args);
    throw new NotConfigured('image', p);
  },
  // Does the configured provider have a field for a negative prompt at all? fal does;
  // OpenAI images does not, and silently dropping one is the defect this codebase has
  // already shipped once. A caller that gets false must fold them into the body.
  supportsNegative() {
    return configured().image === 'fal';
  },
  async ping() {
    const p = configured().image;
    if (p === 'fal') return fal.ping();
    if (p === 'openai') return openai.ping();
    if (p === 'none') return { ok: true, reason: 'provider is none', detail: '' };
    return { ok: false, reason: `unknown provider "${p}"`, detail: '' };
  },
};

export const motion = {
  async generate(args) {
    const p = configured().motion;
    if (p === 'fal') return fal.motion(args);
    throw new NotConfigured('motion', p);
  },
  async ping() {
    const p = configured().motion;
    if (p === 'fal') return fal.ping();
    if (p === 'none') return { ok: true, reason: 'provider is none', detail: '' };
    return { ok: false, reason: `unknown provider "${p}"`, detail: '' };
  },
};

export const voice = {
  async speak(args) {
    const p = configured().voice;
    if (p === 'elevenlabs') return eleven.speak(args);
    if (p === 'none') throw new NotConfigured('voice', p);
    throw new NotConfigured('voice', p);
  },
  async ping() {
    const p = configured().voice;
    if (p === 'elevenlabs') return eleven.ping();
    if (p === 'none') return { ok: true, reason: 'provider is none', detail: 'voice is human-recorded' };
    return { ok: false, reason: `unknown provider "${p}"`, detail: '' };
  },
};

// Music has no generate(). MUSIC_PROVIDER=none is deliberate and there is no fallback.
// The music contract, changed on the user's decision of 2026-09-22 (PRODUCTION_ORDERS
// §2, recorded in direction/music-decision.json). It used to refuse any provider
// outright. It now refuses one that is not licensed by a recorded decision, because
// data/music.json still says "none" and is frozen - the reversal lives in direction/,
// not in the graph.
function musicDecision() {
  const f = join(ROOT, 'direction', 'music-decision.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

export const music = {
  async generate(args) {
    const p = configured().music;
    if (p === 'none') {
      throw new Error('MUSIC_PROVIDER is none. data/music.json is a brief; set a provider to generate against it.');
    }
    const d = musicDecision();
    if (!d || d.class !== 'S') {
      throw new Error('a music provider is configured and direction/music-decision.json does not record the decision as class S. The graph says "none"; a reversal has to be written down before anything is generated.');
    }
    if (p === 'elevenlabs') return eleven.music(args);
    throw new NotConfigured('music', p);
  },
  async ping() {
    const p = configured().music;
    const d = musicDecision();
    if (p === 'none') {
      return d
        ? { ok: true, reason: 'provider is none, and a decision says generated', detail: `direction/music-decision.json chose "${d.decision}" on ${d.decided_on}. Set MUSIC_PROVIDER to act on it.` }
        : { ok: true, reason: 'provider is none, deliberately', detail: 'data/music.json is a brief for a composer. No API writes this theme.' };
    }
    if (!d || d.class !== 'S') {
      return { ok: false, reason: `music provider is "${p}" and no recorded decision licenses it`, detail: 'the graph says "none". Record the reversal in direction/music-decision.json, class S, before generating.' };
    }
    if (p === 'elevenlabs') return eleven.ping();
    return { ok: false, reason: `unknown music provider "${p}"`, detail: '' };
  },
};

export async function pingAll() {
  const c = configured();
  const [t, i, m, v, mu] = await Promise.all([text.ping(), image.ping(), motion.ping(), voice.ping(), music.ping()]);
  return [
    { concern: 'text',   provider: c.text,   ...t },
    { concern: 'image',  provider: c.image,  ...i },
    { concern: 'motion', provider: c.motion, ...m },
    { concern: 'voice',  provider: c.voice,  ...v },
    { concern: 'music',  provider: c.music,  ...mu },
  ];
}

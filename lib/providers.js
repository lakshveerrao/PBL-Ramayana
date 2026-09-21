// providers.js - one interface per concern. Swap in .env, change no code.
// A caller never learns a provider's shape. If a provider's response changes, the
// adapter changes; this file and everything above it does not.
import { env } from './env.js';
import * as claude from './claude.js';
import * as fal from './fal.js';
import * as eleven from './eleven.js';

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
    throw new NotConfigured('image', p);
  },
  // The reference-conditioned route. A caller asking for this is asking for the
  // approved sheet to travel with the request; a provider that cannot do it says so
  // rather than quietly producing a text-only picture.
  async generateFromReference(args) {
    const p = configured().image;
    if (p === 'fal') return fal.imageFromReference(args);
    throw new NotConfigured('image', p);
  },
  async ping() {
    const p = configured().image;
    if (p === 'fal') return fal.ping();
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
export const music = {
  async generate() {
    throw new Error('music is composed by a person. MUSIC_PROVIDER=none is deliberate and there is no generator fallback. data/music.json is a brief.');
  },
  async ping() {
    const p = configured().music;
    if (p === 'none') return { ok: true, reason: 'provider is none, deliberately', detail: 'data/music.json is a brief for a composer. No API writes this theme.' };
    return { ok: false, reason: `music provider is set to "${p}" - it must be none`, detail: '' };
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

// eleven.js - the ElevenLabs adapter. Per line, never the whole script: the edit
// owns the silences, not the model.
import { env } from './env.js';
import { read } from './store.js';

const BASE = 'https://api.elevenlabs.io/v1';

function voiceFor(lang) {
  const n = read('narrator');
  const key = n.languages[lang]?.voice_env;
  if (!key) throw new Error(`no voice configured for language: ${lang}`);
  const id = env(key);
  if (!id) throw new Error(`${key} is not set. Run npm run preflight.`);
  return id;
}

export function settings() {
  const s = read('narrator').voice_settings;
  return {
    stability: s.stability,
    similarity_boost: s.similarity_boost,
    style: s.style,
    use_speaker_boost: s.use_speaker_boost,
  };
}

export function authMode() {
  if (env('ELEVENLABS_API_KEY')) return 'key';
  if (env('ELEVEN_AUTH_VIA_PROXY') === '1') return 'proxy';
  return 'none';
}

function authHeaders() {
  // With an environment API credential the proxy adds xi-api-key on the way out, and
  // no key exists in this container to send.
  return authMode() === 'proxy' ? {} : { 'xi-api-key': env('ELEVENLABS_API_KEY') };
}

export async function speak({ text, lang }) {
  if (authMode() === 'none') throw new Error('ELEVENLABS_API_KEY is not set, and ELEVEN_AUTH_VIA_PROXY is not 1. Run npm run preflight.');
  const res = await fetch(`${BASE}/text-to-speech/${voiceFor(lang)}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings() }),
  });
  if (!res.ok) {
    const err = new Error(`elevenlabs returned ${res.status}`);
    err.status = res.status; err.body = (await res.text()).slice(0, 400);
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function ping() {
  const mode = authMode();
  if (mode === 'none') return { ok: false, reason: 'no credential', detail: 'ELEVENLABS_API_KEY is unset and ELEVEN_AUTH_VIA_PROXY is not 1' };
  try {
    const res = await fetch(`${BASE}/user`, { headers: authHeaders() });
    if (res.status === 401) return { ok: false, reason: 'key rejected', detail: 'HTTP 401 from /v1/user' };
    return {
      ok: res.ok,
      reason: res.ok ? (mode === 'proxy' ? 'reachable, proxy credential accepted' : 'reachable, key valid') : `HTTP ${res.status}`,
      detail: mode === 'proxy' ? 'auth attached by the agent proxy - no key in this container' : 'no audio generated',
    };
  } catch (e) {
    const m = String(e?.cause?.message ?? e.message);
    const unreachable = /403|CONNECT|tunnel|EPROTO|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(m);
    return { ok: false, reason: unreachable ? 'host unreachable (egress policy or network)' : 'failed', detail: m.slice(0, 200) };
  }
}

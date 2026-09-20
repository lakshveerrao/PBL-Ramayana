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

export async function speak({ text, lang }) {
  const key = env('ELEVENLABS_API_KEY');
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set. Run npm run preflight.');
  const res = await fetch(`${BASE}/text-to-speech/${voiceFor(lang)}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
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
  const key = env('ELEVENLABS_API_KEY');
  if (!key) return { ok: false, reason: 'no key set', detail: 'ELEVENLABS_API_KEY is empty in .env' };
  try {
    const res = await fetch(`${BASE}/user`, { headers: { 'xi-api-key': key } });
    if (res.status === 401) return { ok: false, reason: 'key rejected', detail: 'HTTP 401 from /v1/user' };
    return { ok: res.ok, reason: res.ok ? 'reachable, key valid' : `HTTP ${res.status}`, detail: 'no audio generated' };
  } catch (e) {
    const m = String(e?.cause?.message ?? e.message);
    const unreachable = /403|CONNECT|tunnel|EPROTO|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(m);
    return { ok: false, reason: unreachable ? 'host unreachable (egress policy or network)' : 'failed', detail: m.slice(0, 200) };
  }
}

// eleven.js - the ElevenLabs adapter. Per line, never the whole script: the edit
// owns the silences, not the model.
import { env } from './env.js';
import { authHeader, describeAuth, explainUnauthorised } from './auth.js';
import { read } from './store.js';
import { egressBlock } from './fal.js';

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

// Send nothing; the environment's API credential is attached by the proxy. The ping
// below deliberately uses /v1/user rather than /v1/voices: voices answers 200 to anyone,
// so it cannot tell an attached credential from no credential at all. See lib/auth.js.
export function authMode() { return describeAuth('ELEVENLABS_API_KEY').mode; }

function authHeaders() { return authHeader('xi-api-key', 'ELEVENLABS_API_KEY'); }

export async function speak({ text, lang }) {
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
  try {
    const res = await fetch(`${BASE}/user`, { headers: authHeaders() });
    const body = (await res.clone().text()).slice(0, 200);
    const blocked = egressBlock(res.status, body);
    if (blocked) return { ok: false, reason: 'host blocked by network policy', detail: blocked };
    const unauth = explainUnauthorised(res.status, 'ElevenLabs', 'api.elevenlabs.io');
    if (unauth) return { ok: false, reason: 'not authenticated', detail: unauth };
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, detail: body.slice(0, 160) };
    const a = describeAuth('ELEVENLABS_API_KEY');
    return { ok: true, reason: 'a real request was answered as authenticated', detail: `${a.detail}. No audio generated.` };
  } catch (e) {
    const m = String(e?.cause?.message ?? e.message);
    const unreachable = /403|CONNECT|tunnel|EPROTO|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(m);
    return { ok: false, reason: unreachable ? 'host unreachable (egress policy or network)' : 'failed', detail: m.slice(0, 200) };
  }
}

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
// so it cannot tell an attached credential from no credential at all. So does
// /v1/voices/settings/default - there are several, and none of them is a valid probe.
// See lib/auth.js.
//
// Ruled out on 2026-09-22, so nobody spends time on it again: this is NOT a scoped-key
// problem. A key with narrow permissions would be accepted somewhere and refused
// elsewhere. /v1/user, /v1/user/subscription, /v1/models, /v1/history and
// /v1/pronunciation-dictionaries all returned the identical "Invalid API key". The
// header is right, the scope is irrelevant, and the VALUE is what ElevenLabs rejects.
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
    if (res.status === 401 || res.status === 403) {
      // THREE cases, not two, and they are three different jobs for the user.
      // ElevenLabs names each one in `status`, so read it rather than guessing:
      //
      //   invalid_authorization_header  something is attached, in the WRONG HEADER.
      //                                 The credential is set to Authorization where
      //                                 ElevenLabs wants xi-api-key with no prefix.
      //   invalid_api_key               the header is RIGHT and the key is rejected.
      //                                 Header fixed, key wrong - reporting this as
      //                                 "no credential configured" sends the user back
      //                                 to a form they have already filled in correctly.
      //   anything else                 nothing is attached at all.
      if (/invalid_authorization_header|authorization header was invalid/i.test(body)) {
        return {
          ok: false,
          reason: 'a credential is attached, in the wrong header',
          detail: 'the proxy is attaching an Authorization header. ElevenLabs wants the key in xi-api-key with NO prefix - '
                + 'delete the ElevenLabs API credential and add it again (there is no edit) with Header xi-api-key and the Prefix cleared.',
        };
      }
      if (/invalid_api_key|"Invalid API key"/i.test(body)) {
        return {
          ok: false,
          reason: 'the header is right and the key is rejected',
          detail: 'the credential is reaching ElevenLabs in xi-api-key, so the HEADER is correct and needs no further change. '
                + 'ElevenLabs rejects the VALUE. Check how it was pasted before assuming the key is dead: the Anthropic key '
                + 'failed the same way on 2026-09-22 and turned out to be a working key pasted into a field that already held '
                + 'its prefix, giving "sk-ant-sk-ant-...". Look for a doubled prefix, a stray space or newline, or quotes '
                + 'around the value. The key cannot be inspected from here - it lives in the proxy - so this one has to be '
                + 'read off the form. Only if it is clean is the key itself expired, revoked or from another account.',
        };
      }
      return { ok: false, reason: 'not authenticated', detail: explainUnauthorised(res.status, 'ElevenLabs', 'api.elevenlabs.io') };
    }
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, detail: body.slice(0, 160) };
    const a = describeAuth('ELEVENLABS_API_KEY');
    return { ok: true, reason: 'a real request was answered as authenticated', detail: `${a.detail}. No audio generated.` };
  } catch (e) {
    const m = String(e?.cause?.message ?? e.message);
    const unreachable = /403|CONNECT|tunnel|EPROTO|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(m);
    return { ok: false, reason: unreachable ? 'host unreachable (egress policy or network)' : 'failed', detail: m.slice(0, 200) };
  }
}

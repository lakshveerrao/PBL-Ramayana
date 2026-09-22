// auth.js - one rule for every provider: send no credential of your own.
//
// PRODUCTION_ORDERS §0.11 and §1: keys are held by the environment's API credentials,
// the agent proxy attaches them on the way out, and the session never sees them.
//
// The orders also say to verify whether the proxy REPLACES a header you send or only
// ADDS one when none is present, and to build to that. Measured on 2026-09-22 across
// all three hosts, several header shapes each. One rule explains every observation:
//
//   THE PROXY SETS ITS CONFIGURED HEADER FOR THAT HOST.
//
// It is not "add if absent" and not "never replace". It writes one named header. So it
// replaces yours when the names match, and sits beside yours when they do not:
//
//   OpenAI       configured, header Authorization. A wrong bearer token still returns
//                200 - mine was overwritten. Working.
//   ElevenLabs   configured, but with the WRONG HEADER NAME. Sending nothing returns
//                "Provided authorization header was invalid", so something IS attached;
//                sending my own xi-api-key returns "Only one of xi-api-key and
//                authorization headers must be provided. Received both." That is the
//                proof: the proxy is attaching Authorization where ElevenLabs wants
//                xi-api-key with no prefix.
//   fal          nothing attached. Authorization: Bearer junk reached fal unmodified
//                ("bearer: unable to decode issuer"), which cannot happen if the proxy
//                were setting Authorization for that host.
//
// An earlier reading of ElevenLabs was WRONG and the mistake is worth keeping: /v1/voices
// answered 200 with no header, which looked like an attached credential. It is a public
// endpoint. That is the same error as the old fal ping, which read fal.run/'s 404 as
// success. An endpoint that answers without a credential proves nothing about
// credentials, so every probe here uses a route that would refuse.
//
// One behaviour is safe in every case, so it is the rule: send nothing. Where a
// credential is configured correctly it works; where it is not, it fails honestly
// instead of half-working on a stale key.

import { env } from './env.js';

export function envKeysAllowed() { return env('PBL_ALLOW_ENV_KEYS', '0') === '1'; }

// The auth header for a provider, or {} - which is the normal answer.
export function authHeader(headerName, envVar, prefix = '') {
  if (!envKeysAllowed()) return {};
  const key = env(envVar);
  if (!key) return {};
  return { [headerName]: prefix ? `${prefix} ${key}` : key };
}

// What a caller should be told about how a request is being authenticated. Never
// reports "key valid" for a request that carried no key.
export function describeAuth(envVar) {
  if (envKeysAllowed() && env(envVar)) {
    return { mode: 'key', detail: `PBL_ALLOW_ENV_KEYS=1 and ${envVar} is set - this is the arrangement PRODUCTION_ORDERS is moving away from` };
  }
  return { mode: 'proxy', detail: 'no credential sent from this container - the agent proxy attaches one for allowed hosts' };
}

// A 401/403 on a request that carried no credential means the environment has no API
// credential for that host. That is a setup fact, not a bad key, and the difference is
// the whole point: one is the user's to fix in environment settings, the other is not.
export function explainUnauthorised(status, providerLabel, hosts) {
  if (status !== 401 && status !== 403) return null;
  if (envKeysAllowed()) {
    return `${providerLabel} rejected the key in .env (HTTP ${status}).`;
  }
  return `no API credential is configured for ${providerLabel}. Add it on the cloud environment `
       + `(environment settings -> API credentials) for ${hosts}. Nothing in this container holds a key, by design.`;
}

// A key can be present, correct, and still rejected because of how it was pasted. The
// form field that carries a credential often already holds a prefix, so pasting a whole
// key into it doubles that prefix - "sk-ant-sk-ant-api03-..." looks right at a glance
// and is 7 characters too long. Found exactly that way on 2026-09-22, by comparing the
// length and hash of a rejected key against one known to work.
//
// Never returns any part of the key. It reports the SHAPE of the mistake.
export function malformedKeyHint(key) {
  if (!key) return null;
  const k = String(key);

  if (k !== k.trim()) return 'the value has leading or trailing whitespace - a stray space or newline was copied with it';
  if (/^["'].*["']$/.test(k)) return 'the value is wrapped in quotes - paste the key itself, without them';

  // A doubled prefix: the value starts with the same token twice. Done by comparison
  // rather than a backreference, because a real prefix has hyphens inside it - "sk-ant-"
  // is two segments, and a regex class that excludes the separator can never match past
  // the first one. The first attempt at this could only ever have caught "sk-".
  for (let n = Math.min(24, k.length >> 1); n >= 2; n--) {
    const head = k.slice(0, n);
    if (!/[-_]$/.test(head)) continue;          // a prefix ends at its separator
    if (k.slice(n, n * 2) !== head) continue;
    return `the value begins with "${head}" twice. The form field already held that prefix and the pasted key `
         + `repeated it. Remove one copy so the value starts with a single "${head}".`;
  }

  if (/\s/.test(k)) return 'the value contains a space or line break in the middle - it was wrapped or truncated when copied';
  return null;
}

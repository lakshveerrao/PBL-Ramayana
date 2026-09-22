// auth.js - one rule for every provider: send no credential of your own.
//
// PRODUCTION_ORDERS §0.11 and §1: keys are held by the environment's API credentials,
// the agent proxy attaches them on the way out, and the session never sees them.
//
// The orders also say to verify whether the proxy REPLACES a header you send or only
// ADDS one when none is present, and to build to that. Measured on 2026-09-22 against
// all three hosts, three ways each - no header, a deliberately wrong credential, and a
// real key. The answer was not uniform:
//
//   OpenAI       credential IS configured. A deliberately WRONG bearer token still
//                returned 200, which can only mean the proxy REPLACES what is sent.
//   fal          no credential configured. No header and a wrong header both 401; only
//                the real key in .env worked.
//   ElevenLabs   no credential configured. The first reading of this was WRONG: /v1/voices
//                answered 200 with no header, which looked like the proxy attaching one.
//                It is a public endpoint - ElevenLabs lists premade voices to anyone, and
//                rejects a present-but-invalid key, which is why a wrong header 401'd.
//                /v1/user, which actually requires auth, returns 401 both ways.
//
// That mistake is worth keeping written down, because it is the same one that read
// fal.run's 404 as a successful ping: an endpoint that answers without a credential
// proves nothing about credentials. A probe has to use a route that would refuse.
//
// One behaviour is safe in every case: send nothing. Where a credential is configured it
// works; where none is, it fails honestly instead of half-working on a stale key.
//
// The escape hatch exists because removing every key at once would strand a provider
// whose credential has not been added yet. It is off by default and preflight says so
// out loud, because a key in .env is the arrangement the orders are moving away from.
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

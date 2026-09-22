// env.js - read .env without a dependency. Flat file, plain Node.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './store.js';

let loaded = false;
export function loadEnv() {
  if (loaded) return process.env;
  loaded = true;
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return process.env;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return process.env;
}

export function env(key, fallback = '') {
  loadEnv();
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

export function spendAllowed() { return env('ALLOW_SPEND', '0') === '1'; }
export function ceiling() { return Number(env('SPEND_CEILING_USD', '60')); }

// Node does not use HTTPS_PROXY unless it is told to. curl does, which is how this hid:
// every probe from the shell went through the agent proxy and every request from the
// studio went straight out. It matters because a credential can live in the proxy
// rather than in this container - the safer arrangement - and a request that bypasses
// the proxy simply arrives unauthenticated. OpenAI's does.
//
// The fix is a flag at process start (NODE_USE_ENV_PROXY=1, or --use-env-proxy), which
// cannot be set from inside a running process. So this reports rather than repairs, and
// every npm script sets it.
export function proxyStatus() {
  const configured = process.env.HTTPS_PROXY || process.env.https_proxy || null;
  const enabled = process.env.NODE_USE_ENV_PROXY === '1'
    || /--use-env-proxy/.test(process.env.NODE_OPTIONS ?? '')
    || process.execArgv.some((a) => a === '--use-env-proxy');
  return {
    configured: Boolean(configured),
    enabled,
    // The state that silently breaks things: a proxy is there and node is ignoring it.
    bypassing: Boolean(configured) && !enabled,
    fix: 'run through an npm script, or prefix the command with NODE_USE_ENV_PROXY=1',
  };
}

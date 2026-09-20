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

#!/usr/bin/env node
// preflight - is each configured provider reachable and is the key valid?
// One cheap call per provider. Nothing billable beyond that, and nothing is generated.
import { pingAll, configured } from '../lib/providers.js';
import { loadEnv } from '../lib/env.js';

loadEnv();

const rows = await pingAll();
const c = configured();

console.log('\nPREFLIGHT - one cheap call per provider, nothing generated\n');
console.log('  concern   provider      status    reason');
console.log('  ' + '-'.repeat(74));
for (const r of rows) {
  const mark = r.ok ? 'ok    ' : 'FAIL  ';
  console.log(`  ${r.concern.padEnd(9)} ${String(r.provider).padEnd(13)} ${mark}    ${r.reason}`);
  if (r.detail) console.log(`  ${' '.repeat(30)}${r.detail}`);
}

const failed = rows.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
  console.log(`  all ${rows.length} providers reachable`);
} else {
  console.log(`  ${failed.length} of ${rows.length} not usable: ${failed.map((f) => f.concern).join(', ')}`);
  console.log('  This is reported, not worked around. A blocked host is a blocked host.');
}
console.log('');

// preflight reports; it does not fail the build. A missing key is a fact, not a crash.
process.exit(0);

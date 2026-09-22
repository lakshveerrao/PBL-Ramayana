#!/usr/bin/env node
// install_references - put the Codex portraits into the sheet records as EVIDENCE.
//
// PRODUCTION_ORDERS §3: "Install them as references, not approved sheets. Nothing is
// approved until the user approves it by name." The README in references/codex-portraits
// says which characters are kept as they are and which must be revised first; only the
// kept ones are installed here.
//
// This spends nothing, generates nothing, and approves nothing. It records where the
// evidence came from so the sheet cannot later pretend it was authored by the studio.
import { uploadSheet } from '../lib/sheets.js';
import { read } from '../lib/store.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/store.js';

const DIR = 'references/codex-portraits';

// A head-and-shoulders plate is the front anchor; a full-length one carries distance.
// Neither is a three-quarter or a profile, so ANGLE stays unsatisfied and the record
// says so rather than quietly counting two views as four.
const KEEP_AS_IS = {
  DASHARATHA: { front: '02_Dasaratha_Head_Shoulders.png', in_world: '02_Dasaratha_Full_Length.png' },
  VASISHTHA:  { front: '03_Vasistha_Head_Shoulders.png',  in_world: '03_Vasistha_Full_Length.png' },
};

export function installKeepAsIs() {
  const sheets = read('sheets', { fresh: true }).sheets;
  const done = [];
  for (const [entity, slots] of Object.entries(KEEP_AS_IS)) {
    const sheet = sheets.find((s) => s.entity === entity);
    if (!sheet) { done.push({ entity, skipped: 'no sheet record in this graph' }); continue; }
    const files = Object.entries(slots)
      .map(([slot, filename]) => ({ slot, filename, path: join(DIR, filename) }))
      .filter((f) => existsSync(join(ROOT, f.path)));
    if (!files.length) { done.push({ entity, skipped: 'no portrait files found' }); continue; }
    const r = uploadSheet(sheet.id, { files });
    done.push({ entity, id: sheet.id, approved: r.approved, files: r.files, evidence: r.twenty_frame_test });
  }
  return done;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(join(ROOT, DIR))) {
    console.error(`\n  ${DIR} is not in the repo. The Codex portraits ship with the kit.\n`);
    process.exit(2);
  }
  console.log(`\nINSTALL REFERENCES - ${readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith('.png')).length} portraits available\n`);
  for (const d of installKeepAsIs()) {
    if (d.skipped) { console.log(`  ${d.entity.padEnd(12)} skipped: ${d.skipped}`); continue; }
    console.log(`  ${d.entity.padEnd(12)} ${d.files.length} file(s), approved=${d.approved}`);
    for (const f of d.files) console.log(`                 ${f}`);
    const held = d.evidence?.evidence_held ?? [];
    console.log(`                 evidence held: ${held.length ? held.join(', ') : 'none of the four axes yet'}`);
  }
  console.log('\n  Nothing is approved. A named human approves, and only then does the gate open.');
  console.log('  Visvamitra, Rama, Laksmana and Kausalya are NOT installed here - the kit\'s README');
  console.log('  says each must be revised first.\n');
}

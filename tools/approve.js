#!/usr/bin/env node
// approve - record a human's approval of a sheet or a reference plate.
//
// The studio never approves anything. A named human does, and the name, the date and
// the exact files with their hashes go into the record that sits behind every frame
// those references condition.
import { uploadSheet, approveSheet, looksLikePlaceholder } from '../lib/sheets.js';
import { read, ROOT } from '../lib/store.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const who = process.argv[2];
if (!who) { console.error('\n  usage: node tools/approve.js "<name>"\n'); process.exit(2); }
if (looksLikePlaceholder(who)) {
  console.error(`\n  "${who}" is a placeholder, not a name. A person puts their own name to this.\n`);
  process.exit(2);
}

// What is being approved, and which file becomes each sheet's evidence.
const SHEETS = {
  'SHEET.DASHARATHA': {
    files: [
      { slot: 'front',    path: 'references/codex-portraits/02_Dasaratha_Head_Shoulders.png' },
      { slot: 'in_world', path: 'references/codex-portraits/02_Dasaratha_Full_Length.png' },
    ],
    note: 'the new references, chosen by the user on 2026-09-22 and kept as they are',
  },
  'SHEET.VISHVAMITRA': {
    files: [{ slot: 'front', path: 'assets/sheets/VISHVAMITRA/revision/revision-03.png' }],
    note: 'revision-03, conditioned on 01_Visvamitra_Head_Shoulders.png: composed, the brow level, not the M5 scowl',
  },
  'SHEET.VASISHTHA': {
    files: [{ slot: 'front', path: 'assets/sheets/VASISHTHA/revision/revision-02.jpg' }],
    note: 'the one-shoulder revision, conditioned on 03_Vasistha_Full_Length.png: one shoulder bare, the sacred thread across the bare chest, no sleeves',
  },
};

// The court is not a sheet. It is a reference plate set, approved like a character.
const PLATES = 'direction/references.json';

console.log(`\nAPPROVALS by ${who}\n`);
const stamp = new Date().toISOString();

for (const [id, spec] of Object.entries(SHEETS)) {
  for (const f of spec.files) {
    if (!existsSync(join(ROOT, f.path))) { console.error(`  MISSING: ${f.path}`); process.exit(1); }
  }
  uploadSheet(id, { files: spec.files.map((f) => ({ ...f, filename: f.path.split('/').pop() })) });
  const r = approveSheet(id, { approver: who });
  const sheet = read('sheets', { fresh: true }).sheets.find((s) => s.id === id);
  console.log(`  ${id}`);
  console.log(`     ${spec.note}`);
  for (let i = 0; i < sheet.files.length; i++) console.log(`     ${sheet.hashes[i].slice(0, 16)}  ${sheet.files[i]}`);
  console.log(`     approved_by ${r.approved_by}  ${r.approved_at}`);
  if (r.twenty_frame_test?.outstanding?.length) {
    console.log(`     outstanding: ${r.twenty_frame_test.outstanding.join(', ')} - stays visible on every surface that shows this sheet`);
  }
  console.log('');
}

const plates = JSON.parse(readFileSync(join(ROOT, PLATES), 'utf8'));
plates._approval = { approved_by: who, approved_at: stamp, files: [] };
for (const [entity, e] of Object.entries(plates.entities)) {
  for (const f of e.files) {
    const h = createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex');
    plates._approval.files.push({ entity, file: f, sha256: h });
  }
}
writeFileSync(join(ROOT, PLATES), JSON.stringify(plates, null, 2) + '\n', 'utf8');
console.log('  COURT and SABHA reference plates');
for (const f of plates._approval.files) console.log(`     ${f.sha256.slice(0, 16)}  ${f.file}`);
console.log(`     approved_by ${who}  ${stamp}\n`);
console.log('  The consistency gate is now open for these. Nothing else is approved.\n');

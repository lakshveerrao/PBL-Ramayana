// sheets.js - model sheet intake.
// Upload records evidence. It NEVER approves. Only a named human approves, and the
// name is recorded. The twenty-frame test is four axes of identity evidence, not
// twenty paid generations, and this file must never be changed to mean the latter.
import { read, write, ensureDir, ROOT } from './store.js';
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SLOTS = ['front', 'three_quarter', 'profile', 'in_world'];

export function spec() { return read('sheets')._twenty_frame_spec; }

// files: [{ slot, filename, data_base64 }] or [{ slot, path }]
export function uploadSheet(id, { files = [] } = {}) {
  const sheets = read('sheets', { fresh: true });
  const sheet = sheets.sheets.find((s) => s.id === id);
  if (!sheet) throw new Error(`no sheet record for ${id}`);
  if (!Array.isArray(files) || files.length === 0) throw new Error('no files supplied');

  const dir = ensureDir(`assets/sheets/${id}`);
  const stored = [];
  const hashes = [];

  for (const f of files) {
    if (!SLOTS.includes(f.slot)) throw new Error(`unknown slot "${f.slot}" - expected one of ${SLOTS.join(', ')}`);
    let buf;
    if (f.data_base64) buf = Buffer.from(f.data_base64, 'base64');
    else if (f.path && existsSync(join(ROOT, f.path))) buf = readFileBuf(join(ROOT, f.path));
    else throw new Error(`file for slot ${f.slot} has neither data_base64 nor a readable path`);

    const ext = (f.filename ?? 'sheet.png').match(/\.[a-z0-9]+$/i)?.[0] ?? '.png';
    const name = `${f.slot}${ext}`;
    writeFileSync(join(dir, name), buf);
    stored.push(`assets/sheets/${id}/${name}`);
    hashes.push(createHash('sha256').update(buf).digest('hex'));
  }

  sheet.files = stored;
  sheet.hashes = hashes;
  sheet.uploaded_at = new Date().toISOString();
  // approved stays exactly as it was. Upload never approves.
  sheet.twenty_frame_test = evidenceFrom(stored, sheet.twenty_frame_test);
  write('sheets', sheets);

  return {
    id, approved: sheet.approved,
    files: sheet.files, hashes: sheet.hashes, uploaded_at: sheet.uploaded_at,
    twenty_frame_test: sheet.twenty_frame_test,
    note: 'Files recorded. approved is unchanged - only a named human approves, through POST /api/sheets/:id/approve.',
  };
}

// A four-view sheet satisfies ANGLE. Lighting, distance and expression stay outstanding
// until evidence for each is supplied. This is the spec, not a convenience.
export function evidenceFrom(files, previous) {
  const slots = new Set(files.map((f) => f.split('/').pop().replace(/\.[a-z0-9]+$/i, '')));
  const held = new Set(previous?.evidence_held ?? []);
  if (SLOTS.every((s) => slots.has(s))) held.add('angle');
  const all = ['angle', 'lighting', 'distance', 'expression'];
  return {
    evidence_held: all.filter((a) => held.has(a)),
    outstanding: all.filter((a) => !held.has(a)),
  };
}

export function approveSheet(id, { approver = null, name = null } = {}) {
  const who = approver ?? name;
  if (!who || typeof who !== 'string' || who.trim().length < 2) {
    throw new Error('approval requires a human name. A sheet is never approved by a process.');
  }
  const sheets = read('sheets', { fresh: true });
  const sheet = sheets.sheets.find((s) => s.id === id);
  if (!sheet) throw new Error(`no sheet record for ${id}`);
  if (sheet.files.length === 0) throw new Error(`sheet ${id} has no uploaded files - there is nothing to approve`);

  sheet.approved = true;
  sheet.approved_by = who.trim();
  sheet.approved_at = new Date().toISOString();
  write('sheets', sheets);

  return {
    id, approved: true, approved_by: sheet.approved_by, approved_at: sheet.approved_at,
    twenty_frame_test: sheet.twenty_frame_test,
    note: sheet.twenty_frame_test.outstanding.length
      ? `Approved. ${sheet.twenty_frame_test.outstanding.join(', ')} remain outstanding and stay visible on every surface that shows this sheet.`
      : 'Approved with all four axes held.',
  };
}

function readFileBuf(p) { return require('node:fs').readFileSync(p); }

#!/usr/bin/env node
// import_graph - receive a graph handoff.
//
//   node tools/import_graph.js <dir>             check only, change nothing
//   node tools/import_graph.js <dir> --install   back up data/, then install
//
// Checks happen against the INCOMING files, before anything is written, so a bad
// handoff is reported rather than half-installed. Nothing is overwritten without
// --install, and whatever is currently in data/ is copied to data/_replaced/<ts>/ first.
import { ROOT } from '../lib/store.js';
import { passageTextFields, sourceStatesTravel, textMayTravel, locatorIdentifiesAPlace,
         locatorKind, hasDesign, skinGovernance, forbidsLightening, isLatinScript,
         filmNeedsDuration } from '../lib/contract.js';
import { existsSync, readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REQUIRED = {
  films: ['films'], claims: ['claims'], entities: ['entities'], locks: ['locks'],
  sheets: ['sheets'], memos: ['memos'], passages: ['passages'],
  source_register: ['sources'], kandas: ['kandas'], episodes: ['episodes'],
  material_world: [], typography: ['scripts'], grade: [], effects: ['shots'],
  transitions: ['joins'], narrator: ['languages'], music: [],
  evidence_libraries: ['libraries'], traditions: ['traditions'], spend: ['rows'],
};
const OPTIONAL = ['threads', 'incidents', 'app_design'];

const dir = process.argv[2];
const install = process.argv.includes('--install');

if (!dir) {
  console.error('\nusage: node tools/import_graph.js <path-to-graph-dir> [--install]\n');
  console.error('See HANDOFF.md for what a graph directory must contain.\n');
  process.exit(2);
}
const src = resolve(process.cwd(), dir);
if (!existsSync(src)) { console.error(`\nno such directory: ${src}\n`); process.exit(2); }

const problems = [];
const warnings = [];
const notes = [];
const loaded = {};

// ---- 1. presence and parse -------------------------------------------------------
for (const [name, keys] of Object.entries(REQUIRED)) {
  const p = join(src, `${name}.json`);
  if (!existsSync(p)) { problems.push(`missing required file: ${name}.json`); continue; }
  let doc;
  try { doc = JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { problems.push(`${name}.json does not parse: ${e.message}`); continue; }
  loaded[name] = doc;
  for (const k of keys) {
    if (!(k in doc)) problems.push(`${name}.json has no "${k}"`);
    else if (Array.isArray(doc[k]) === false && ['films', 'claims', 'entities', 'locks', 'sheets', 'memos', 'passages', 'sources', 'kandas', 'episodes', 'joins', 'libraries', 'traditions', 'rows'].includes(k)) {
      problems.push(`${name}.json "${k}" is not an array`);
    }
  }
}
for (const o of OPTIONAL) if (existsSync(join(src, `${o}.json`))) notes.push(`optional file present: ${o}.json`);

// Anything extra the studio does not know about.
if (existsSync(src)) {
  const known = new Set([...Object.keys(REQUIRED), ...OPTIONAL].map((n) => `${n}.json`));
  for (const f of readdirSync(src).filter((x) => x.endsWith('.json'))) {
    if (!known.has(f)) warnings.push(`${f} is not a file the studio reads - it will be installed but nothing uses it`);
  }
}

if (problems.length === 0) {
  // ---- 2. referential integrity, on the INCOMING graph --------------------------
  const filmIds = new Set(loaded.films.films.map((f) => f.id));
  const entityIds = new Set(loaded.entities.entities.map((e) => e.id));
  const lockIds = new Set(loaded.locks.locks.map((l) => l.id));
  const sourceIds = new Set(loaded.source_register.sources.map((s) => s.id));
  const kandaIds = new Set(loaded.kandas.kandas.map((k) => k.id));
  const claimIds = new Set(loaded.claims.claims.map((c) => c.id));
  const libIds = new Set((loaded.evidence_libraries.libraries ?? []).map((l) => l.id));

  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  const treatmentFilms = new Set();
  {
    const td = join(src, 'treatments');
    if (existsSync(td)) for (const f of readdirSync(td).filter((x) => x.endsWith('.json'))) {
      try { treatmentFilms.add(JSON.parse(readFileSync(join(td, f), 'utf8')).film); } catch { /* reported below */ }
    }
  }
  for (const f of loaded.films.films) {
    need(kandaIds.has(f.kanda), `film ${f.id} names unknown kanda ${f.kanda}`);
    // A film with no treatment is a ledger entry and need not declare a duration.
    if (filmNeedsDuration(f, treatmentFilms.has(f.id))) {
      need(typeof f.duration_s === 'number' && f.duration_s > 0, `film ${f.id} has a treatment but no usable duration_s`);
    }
  }
  for (const c of loaded.claims.claims) {
    need(['T', 'Tr', 'I', 'S'].includes(c.evidence_class), `claim ${c.id} has class ${c.evidence_class}`);
    need(['proposed', 'accepted', 'disputed', 'unresolved'].includes(c.state), `claim ${c.id} has state ${c.state}`);
    need(c.film == null || filmIds.has(c.film), `claim ${c.id} names unknown film ${c.film}`);
    if (c.speaker) need(entityIds.has(c.speaker), `claim ${c.id} is spoken by unknown entity ${c.speaker}`);
    if (c.tradition) need(c.evidence_class === 'Tr', `claim ${c.id} cites a tradition but is classed ${c.evidence_class} - a tradition is never promoted to Text`);
    if (c.evidence_class === 'Tr') need(c.tradition, `Tr claim ${c.id} names no tradition`);
    if (c.speech_act) need(c.speaker, `speech-act claim ${c.id} names no speaker`);
    if (c.locator?.source) need(sourceIds.has(c.locator.source), `claim ${c.id} cites unknown source ${c.locator.source}`);
    if (c.evidence_class === 'T') {
      need(locatorIdentifiesAPlace(c.locator),
        `text claim ${c.id} has no locator that identifies a place (${locatorKind(c.locator)})`);
    }
    if (locatorKind(c.locator) === 'edition-section') {
      need(c.locator.numbering, `claim ${c.id} uses ${c.locator.edition} section numbering but does not say so`);
    }
    if (c.evidence_class === 'S') need(c.locator == null, `staging claim ${c.id} carries a locator`);
    if (c.evidence_class === 'I') {
      need(c.inferred_from && (sourceIds.has(c.inferred_from) || libIds.has(c.inferred_from)),
        `inference ${c.id} is inferred from ${c.inferred_from}, which is in no register or library`);
      need(c.inference_basis && /\d/.test(c.inference_basis), `inference ${c.id} names no date or specific holding`);
    }
    if (c.state === 'accepted') {
      need(c.verification, `accepted claim ${c.id} has no verification record`);
      if (c.verification) {
        need(['ai-passage-check', 'human'].includes(c.verification.method), `accepted claim ${c.id} accepted by method "${c.verification.method}"`);
        need(typeof c.verification.text_consulted === 'boolean', `accepted claim ${c.id} does not say whether a text was consulted`);
        need((c.verification.basis ?? '').length > 10, `accepted claim ${c.id} states no basis`);
      }
    }
    if (c.state === 'proposed' && c.verification) {
      need(c.verification.method === 'none', `proposed claim ${c.id} carries method "${c.verification.method}"`);
    }
  }
  // An entities file may hold identity records with no design; skin is then governed
  // by a policy lock and set by the studio's approved sheets.
  for (const e of loaded.entities.entities) {
    const a = e.design?.skin_albedo;
    if (a != null) need(lockIds.has(a), `entity ${e.id} names unknown skin lock ${a}`);
  }
  {
    const g = skinGovernance(loaded.locks.locks);
    need(g.kind !== 'none', 'nothing in this graph governs skin - neither a per-entity albedo lock nor a skin policy');
    for (const l of g.locks) need(forbidsLightening(l), `skin lock ${l.id} does not forbid lightening`);
    if (!g.measurable) notes.push('skin is governed by policy, not numbers - gradecheck has nothing to measure until the approved sheets exist');
  }
  for (const l of loaded.locks.locks) {
    need(l.entity == null || entityIds.has(l.entity), `lock ${l.id} names unknown entity ${l.entity}`);
    if (l.kind === 'skin_albedo' && l.value) {
      const h = (l.value?.srgb_hex ?? '').replace('#', '');
      if (/^[0-9A-Fa-f]{6}$/.test(h)) {
        const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const L = Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16;
        need(Math.abs(L - (l.value.lab_L ?? -99)) < 1.0, `lock ${l.id} says L* ${l.value.lab_L} but ${l.value.srgb_hex} is L* ${L.toFixed(1)}`);
      } else problems.push(`lock ${l.id} has no valid srgb_hex`);
    }
  }
  for (const s of loaded.sheets.sheets) {
    need(entityIds.has(s.entity), `sheet ${s.id} names unknown entity ${s.entity}`);
    if (s.approved) problems.push(`sheet ${s.id} arrives pre-approved - only a named human may approve, through the studio`);
  }
  for (const s of loaded.source_register.sources) {
    need(sourceStatesTravel(s), `source ${s.id} does not say whether its text may travel`);
    if (s.restricted) need(textMayTravel(s) === false, `restricted source ${s.id} allows text to travel`);
  }
  for (const p of loaded.passages.passages) {
    const found = passageTextFields(p);
    if (found.length) problems.push(`passage ${p.id} carries source text in: ${found.join(', ')}`);
  }
  need(loaded.music.provider === 'none', `music.provider is "${loaded.music.provider}" - it must be none`);

  // Languages must line up with typography and carry attribution markers.
  for (const [lang, spec] of Object.entries(loaded.narrator.languages ?? {})) {
    need(loaded.typography.scripts?.[lang], `narrator declares language ${lang} but typography has no script for it`);
    need((spec.attribution_markers ?? []).length > 0, `narrator language ${lang} declares no attribution_markers - attribution cannot be checked`);
  }
  for (const [lang, s] of Object.entries(loaded.typography.scripts ?? {})) {
    need(s.line_box_px >= Math.ceil(s.size_px * s.line_height) - 1, `typography ${lang}: line box ${s.line_box_px} is smaller than ${s.size_px}x${s.line_height}`);
    if (!isLatinScript(lang, s)) {
      need((s.conjunct_probe ?? []).length >= 3, `typography ${lang} has fewer than three conjunct probes`);
      for (const p of s.conjunct_probe ?? []) need([...p].length >= 2, `typography ${lang} probe "${p}" is a lone mark and measures nothing`);
    }
  }

  // No source text anywhere in the bundle.
  for (const [name, doc] of Object.entries(loaded)) {
    const blob = JSON.stringify(doc);
    if ((blob.match(/[ऀ-ॿ\s]{60,}/g) ?? []).length) problems.push(`${name}.json holds a long Devanagari run - possible restricted verse text`);
  }

  // ---- 3. treatments -------------------------------------------------------------
  const tdir = join(src, 'treatments');
  const treatments = existsSync(tdir) ? readdirSync(tdir).filter((f) => f.endsWith('.json')) : [];
  notes.push(`${treatments.length} treatment(s) in the bundle`);

  for (const f of treatments) {
    let t;
    try { t = JSON.parse(readFileSync(join(tdir, f), 'utf8')); }
    catch (e) { problems.push(`treatments/${f} does not parse: ${e.message}`); continue; }
    const film = loaded.films.films.find((x) => x.id === t.film);
    if (!film) { problems.push(`treatments/${f} is for film ${t.film}, which is not in films.json`); continue; }

    const fps = t.fps ?? 30;
    const sum = Math.round(t.shots.reduce((a, s) => a + s.duration_s, 0) * 1e6) / 1e6;
    need(sum === film.duration_s, `treatments/${f}: shots total ${sum}s, film declares ${film.duration_s}s`);
    let run = 0;
    let startsReported = false;   // one bad duration desynchronises every later start
    const idx = new Map(t.shots.map((s, i) => [s.id, i]));
    for (const [i, s] of t.shots.entries()) {
      const fr = s.duration_s * fps;
      need(Math.abs(fr - Math.round(fr)) < 1e-6, `treatments/${f} shot ${s.id}: ${s.duration_s}s is ${fr} frames at ${fps}fps`);
      if (Math.abs(s.start_s - run) >= 1e-9 && !startsReported) {
        problems.push(`treatments/${f} shot ${s.id} starts at ${s.start_s}, previous ends at ${run} (first of ${t.shots.length - i} shots out of step - fix the durations above it)`);
        startsReported = true;
      }
      run = Math.round((run + s.duration_s) * 1e6) / 1e6;
      const ref = s.reuse_of ?? s.crop_of;
      if (ref) need(idx.has(ref) && idx.get(ref) < i, `treatments/${f} shot ${s.id} reuses ${ref}, which is missing or later`);
      for (const e of s.entities ?? []) need(entityIds.has(e), `treatments/${f} shot ${s.id} names unknown entity ${e}`);
      for (const c of s.claims ?? []) {
        need(claimIds.has(c), `treatments/${f} shot ${s.id} cites unknown claim ${c}`);
        const cl = loaded.claims.claims.find((x) => x.id === c);
        if (cl) {
          need(cl.film === t.film, `treatments/${f} shot ${s.id} cites ${c}, which belongs to ${cl.film}`);
          need(cl.state !== 'disputed', `treatments/${f} shot ${s.id} stages disputed claim ${c}`);
        }
      }
      if (s.narration) need(t.narration?.[s.narration], `treatments/${f} shot ${s.id} names unknown narration ${s.narration}`);
    }
    const langs = Object.keys(loaded.narrator.languages ?? {});
    for (const [id, n] of Object.entries(t.narration ?? {})) {
      for (const l of langs) need(n[l], `treatments/${f} narration ${id} has no ${l}`);
      if (n.speaker) {
        need(n.speaker_rule, `treatments/${f} narration ${id} names a speaker but states no attribution rule`);
        for (const l of langs) {
          const markers = loaded.narrator.languages[l].attribution_markers ?? [];
          need(markers.some((m) => (n[l] ?? '').includes(m)),
            `treatments/${f} narration ${id} is ${n.speaker}'s statement but the ${l} line carries no attribution marker - it reads as narrator fact`);
        }
      }
      const words = (n.en ?? '').split(/\s+/).filter(Boolean).length;
      need(words <= 12, `treatments/${f} narration ${id} is ${words} words: "${n.en}"`);
    }
  }

  // Memo gate, across the incoming bundle.
  // A memo forbids the DESIGN, not the identity record.
  const blocked = new Set(loaded.memos.memos.filter((m) => m.state === 'outstanding').map((m) => m.entity));
  for (const e of loaded.entities.entities) {
    if (blocked.has(e.id) && hasDesign(e)) problems.push(`entity ${e.id} carries a design but its memo is outstanding`);
  }
}

// ---- report ----------------------------------------------------------------------
console.log(`\nIMPORT GRAPH  ${src}\n`);
if (Object.keys(loaded).length) {
  console.log(`  ${loaded.films?.films?.length ?? 0} films, ${loaded.claims?.claims?.length ?? 0} claims, ` +
              `${loaded.entities?.entities?.length ?? 0} entities, ${loaded.sheets?.sheets?.length ?? 0} sheets`);
}
for (const n of notes) console.log(`  note: ${n}`);
for (const w of warnings) console.log(`  warn: ${w}`);

if (problems.length) {
  console.log(`\n  ${problems.length} PROBLEM(S) - nothing was installed\n`);
  for (const p of problems) console.log(`   - ${p}`);
  console.log('\n  See HANDOFF.md for the contract.\n');
  process.exit(1);
}

console.log(`\n  the bundle satisfies the handoff contract`);

if (!install) {
  console.log(`\n  nothing was written. Re-run with --install to replace data/.\n`);
  process.exit(0);
}

// ---- install ---------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
// The backup lives OUTSIDE the graph directory. A previous graph sitting inside data/
// is picked up by anything that scans the graph - the package's own contradictions.py
// globs **/*.json - and reports the old graph's contents as defects in the new one.
const backup = join(ROOT, '.graph-backups', stamp);
mkdirSync(backup, { recursive: true });
for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.json'))) {
  copyFileSync(join(ROOT, 'data', f), join(backup, f));
}
console.log(`  backed up the previous graph to data/_replaced/${stamp}/`);

const incoming = new Set(readdirSync(src).filter((x) => x.endsWith('.json')));
let installed = 0;
for (const f of incoming) {
  copyFileSync(join(src, f), join(ROOT, 'data', f));
  installed++;
}

// A file the previous graph had and this one does not is STALE, and it will keep
// referencing films that no longer exist. Remove it - it is already in the backup.
let removed = 0;
for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.json'))) {
  if (incoming.has(f)) continue;
  rmSync(join(ROOT, 'data', f));
  console.log(`  removed stale ${f} (the incoming graph has none; it is in the backup)`);
  removed++;
}

// Generated artefacts are derived from the graph that was just replaced. Leaving them
// means packets and views that describe films which no longer exist.
for (const d of ['packets', 'graph']) {
  const p = join(ROOT, d);
  if (!existsSync(p)) continue;
  rmSync(p, { recursive: true, force: true });
  mkdirSync(p, { recursive: true });
  console.log(`  cleared ${d}/ - it was generated from the previous graph`);
}
const stale = join(ROOT, 'exports', 'public.json');
if (existsSync(stale)) { rmSync(stale); console.log('  cleared exports/public.json'); }

const tdir = join(src, 'treatments');
let tcount = 0;
if (existsSync(tdir)) {
  const dest = join(ROOT, 'data', 'treatments');
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(tdir).filter((x) => x.endsWith('.json'))) {
    copyFileSync(join(tdir, f), join(dest, f));
    tcount++;
  }
  console.log(`  installed ${tcount} treatment(s) to data/treatments/`);
  console.log(`  films[].treatment paths are resolved against the graph directory, so the`);
  console.log(`  package's own "treatments/<FILM>.json" works unedited.`);
}

// The scaffold marker goes once a real graph is in.
rmSync(join(ROOT, 'data', '_SCAFFOLD.md'), { force: true });
writeFileSync(join(ROOT, 'data', '_IMPORTED.md'),
  `# Imported graph\n\nInstalled ${new Date().toISOString()} from \`${src}\`.\n\n` +
  `${installed} data files, ${tcount} treatment(s). Previous graph in \`.graph-backups/${stamp}/\`.\n\n` +
  `Run \`npm run validate && node tools/regress.js\` before doing anything else.\n`, 'utf8');

console.log(`  installed ${installed} data file(s)${removed ? `, removed ${removed} stale` : ''}`);
console.log(`\n  next:`);
console.log(`    1. npm run validate && node tools/regress.js`);
console.log(`    2. python3 tools/build_graph.py && python3 tools/build_brain.py && python3 tools/build_packets.py\n`);

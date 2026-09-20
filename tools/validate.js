#!/usr/bin/env node
// validate - offline, no key, no spend.
//
// Every check here is an INVARIANT and holds for ANY graph the studio is pointed at.
// Nothing references a particular claim id, film, entity or shot: the checks iterate
// over whatever data/ contains. Checks specific to the bundled scaffold live in
// tools/fixtures.js and are skipped once a real graph is installed.
//
// Never weaken a check to pass. If an invariant genuinely changed, update the check
// and add a blocked case beside the allowed one.
import { read, treatment, ROOT, dataDir } from '../lib/store.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const checks = [];
const check = (area, name, fn) => checks.push({ area, name, fn });
const T = (cond, msg) => { if (!cond) throw new Error(msg); };
const text = (rel) => { const p = join(ROOT, rel); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
// Optional files: absent is fine, present must be correct.
const opt = (name) => existsSync(join(dataDir(), `${name}.json`)) ? read(name) : null;
const round = (n) => Math.round(n * 1e6) / 1e6;

// Every film that actually has a treatment on disk. All treatment checks run over
// this set, so a graph with seven directed films is checked seven times over.
const directed = () => read('films').films.map((f) => ({ film: f, t: treatment(f.id) })).filter((x) => x.t);
const allClaims = () => read('claims').claims;
const allNarration = () => directed().flatMap(({ film, t }) =>
  Object.entries(t.narration ?? {}).map(([id, n]) => ({ film: film.id, id, n, t })));

// ---------------------------------------------------------------- required shape
const REQUIRED = ['films', 'claims', 'entities', 'locks', 'sheets', 'memos', 'passages',
  'source_register', 'kandas', 'episodes', 'material_world', 'typography', 'grade',
  'effects', 'transitions', 'narrator', 'music', 'evidence_libraries', 'traditions', 'spend'];

check('shape', 'every file the studio requires is present', () => {
  for (const n of REQUIRED) T(existsSync(join(ROOT, 'data', `${n}.json`)), `data/${n}.json is missing - see HANDOFF.md`);
});
check('shape', 'every data file parses', () => {
  for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.json'))) read(f.replace(/\.json$/, ''), { fresh: true });
});
check('shape', 'every top-level collection is an array', () => {
  const pairs = { films: 'films', claims: 'claims', entities: 'entities', locks: 'locks',
    sheets: 'sheets', memos: 'memos', passages: 'passages', kandas: 'kandas', episodes: 'episodes' };
  for (const [file, key] of Object.entries(pairs)) T(Array.isArray(read(file)[key]), `data/${file}.json has no ${key} array`);
});
check('shape', 'at least one film is declared', () => T(read('films').films.length > 0, 'the graph declares no films'));

// ---------------------------------------------------------------- referential integrity
check('data', 'film ids are unique', () => {
  const ids = read('films').films.map((f) => f.id);
  T(new Set(ids).size === ids.length, 'duplicate film id');
});
check('data', 'story ids are unique', () => {
  const ids = read('films').films.map((f) => f.story_id).filter(Boolean);
  T(new Set(ids).size === ids.length, 'duplicate story_id');
});
check('data', 'every film names a kanda that exists', () => {
  const k = new Set(read('kandas').kandas.map((x) => x.id));
  for (const f of read('films').films) T(k.has(f.kanda), `film ${f.id} names unknown kanda ${f.kanda}`);
});
check('data', 'every film declares a duration and it is positive', () => {
  for (const f of read('films').films) T(typeof f.duration_s === 'number' && f.duration_s > 0, `film ${f.id} has no usable duration`);
});
check('data', 'claim ids are unique', () => {
  const ids = allClaims().map((c) => c.id);
  T(new Set(ids).size === ids.length, 'duplicate claim id');
});
check('data', 'every claim names a film that exists, or none', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const c of allClaims()) T(c.film == null || f.has(c.film), `claim ${c.id} names unknown film ${c.film}`);
});
check('data', 'every entity names a skin albedo lock that exists', () => {
  const l = new Set(read('locks').locks.map((x) => x.id));
  for (const e of read('entities').entities) {
    T(e.design?.skin_albedo, `entity ${e.id} declares no skin_albedo`);
    T(l.has(e.design.skin_albedo), `entity ${e.id} names unknown lock ${e.design.skin_albedo}`);
  }
});
check('data', 'every lock naming an entity names one that exists', () => {
  const e = new Set(read('entities').entities.map((x) => x.id));
  for (const l of read('locks').locks) T(l.entity == null || e.has(l.entity), `lock ${l.id} names unknown entity ${l.entity}`);
});
check('data', 'every lock naming a film names one that exists', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const l of read('locks').locks) T(l.film == null || f.has(l.film), `lock ${l.id} names unknown film ${l.film}`);
});
check('data', 'every episode names a kanda that exists', () => {
  const k = new Set(read('kandas').kandas.map((x) => x.id));
  for (const e of read('episodes').episodes) T(k.has(e.kanda), `episode ${e.id} names unknown kanda ${e.kanda}`);
});
check('data', 'every episode naming a film names one that exists', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const e of read('episodes').episodes) T(e.film == null || f.has(e.film), `episode ${e.id} names unknown film ${e.film}`);
});
check('data', 'every thread names films that exist', () => {
  const d = opt('threads');
  if (!d) return;   // threads.json is optional
  const f = new Set(read('films').films.map((x) => x.id));
  for (const t of d.threads ?? []) for (const x of t.films ?? []) T(f.has(x), `thread ${t.id} names unknown film ${x}`);
});
check('data', 'every incident names films that exist', () => {
  const d = opt('incidents');
  if (!d) return;   // incidents.json is optional
  const f = new Set(read('films').films.map((x) => x.id));
  for (const i of d.incidents ?? []) for (const x of i.films ?? []) T(f.has(x), `incident ${i.id} names unknown film ${x}`);
});
check('data', 'every entity appears_in names films that exist', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const e of read('entities').entities) for (const x of e.appears_in ?? []) T(f.has(x), `entity ${e.id} appears_in unknown film ${x}`);
});
check('data', 'every claim locator names a source in the register', () => {
  const s = new Set(read('source_register').sources.map((x) => x.id));
  for (const c of allClaims()) if (c.locator?.source) T(s.has(c.locator.source), `claim ${c.id} cites unknown source ${c.locator.source}`);
});

// ---------------------------------------------------------------- evidence classes
check('evidence', 'evidence classes are only T, Tr, I or S', () => {
  const ok = new Set(['T', 'Tr', 'I', 'S']);
  for (const c of allClaims()) T(ok.has(c.evidence_class), `claim ${c.id} has class ${c.evidence_class}`);
});
check('evidence', 'claim states are only proposed, accepted, disputed or unresolved', () => {
  const ok = new Set(['proposed', 'accepted', 'disputed', 'unresolved']);
  for (const c of allClaims()) T(ok.has(c.state), `claim ${c.id} has state ${c.state}`);
});
check('evidence', 'no claim citing a tradition is classed as Text', () => {
  for (const c of allClaims()) if (c.tradition) T(c.evidence_class === 'Tr', `claim ${c.id} cites a tradition but is classed ${c.evidence_class} - a tradition is never promoted to Text`);
});
check('evidence', 'every Tr claim names its tradition', () => {
  for (const c of allClaims().filter((x) => x.evidence_class === 'Tr')) T(typeof c.tradition === 'string' && c.tradition.length > 0, `Tr claim ${c.id} names no tradition`);
});
check('evidence', 'every inference names what it is inferred from', () => {
  for (const c of allClaims().filter((x) => x.evidence_class === 'I')) {
    T(c.inferred_from, `inference ${c.id} names no inferred_from`);
    T(c.inference_basis, `inference ${c.id} has no inference_basis`);
  }
});
check('evidence', 'an inference is inferred from a source or library that exists', () => {
  const known = new Set([...read('source_register').sources.map((s) => s.id),
                         ...(read('evidence_libraries').libraries ?? []).map((l) => l.id)]);
  for (const c of allClaims().filter((x) => x.evidence_class === 'I')) {
    T(known.has(c.inferred_from), `inference ${c.id} is inferred from ${c.inferred_from}, which is in no register or library`);
  }
});
check('evidence', '"period-appropriate" is never an inference basis', () => {
  for (const c of allClaims().filter((x) => x.evidence_class === 'I')) {
    T(!/period[- ]appropriate/i.test(c.inference_basis), `inference ${c.id} leans on "period-appropriate", which is not a source`);
  }
});
check('evidence', 'an inference basis names a date or a specific holding, not just a region', () => {
  for (const c of allClaims().filter((x) => x.evidence_class === 'I')) {
    T(/\d/.test(c.inference_basis), `inference ${c.id} names no date or specific holding`);
  }
});
check('evidence', 'every S claim declares itself as ours and cites no text', () => {
  for (const c of allClaims().filter((x) => x.evidence_class === 'S')) {
    T(c.staging_note, `staging claim ${c.id} has no staging_note declaring it as ours`);
    T(c.locator == null, `staging claim ${c.id} carries a text locator - staging is never sourced to the text`);
  }
});
check('evidence', 'every T claim carries a locator', () => {
  for (const c of allClaims().filter((x) => x.evidence_class === 'T')) {
    T(c.locator && c.locator.sarga != null, `text claim ${c.id} has no locator`);
  }
});
check('evidence', 'every accepted claim carries a verification record', () => {
  for (const c of allClaims().filter((x) => x.state === 'accepted')) {
    T(c.verification, `accepted claim ${c.id} has no verification record`);
    T(['ai-passage-check', 'human'].includes(c.verification.method), `accepted claim ${c.id} was accepted by method "${c.verification.method}" - only ai-passage-check or human may accept`);
    T(c.verification.basis && c.verification.basis.length > 10, `accepted claim ${c.id} states no basis`);
    T(c.verification.attested_at, `accepted claim ${c.id} records no attestation date`);
  }
});
check('evidence', 'verification records state whether a text was consulted', () => {
  for (const c of allClaims().filter((x) => x.state === 'accepted')) {
    T(typeof c.verification.text_consulted === 'boolean', `accepted claim ${c.id} does not say whether a text was consulted`);
  }
});
check('evidence', 'a human acceptance names the human', () => {
  for (const c of allClaims().filter((x) => x.state === 'accepted' && x.verification?.method === 'human')) {
    T(c.verification.attested_by && !/^(system|auto|process|script|ci|bot)$/i.test(c.verification.attested_by),
      `claim ${c.id} claims human review but names "${c.verification.attested_by}"`);
  }
});
check('evidence', 'no proposed claim carries a completed verification', () => {
  for (const c of allClaims().filter((x) => x.state === 'proposed')) {
    T(!c.verification || c.verification.method === 'none', `proposed claim ${c.id} carries method "${c.verification.method}" - if it was verified it should have been disposed`);
  }
});
check('evidence', 'no copy anywhere implies human or scholarly review', () => {
  const bad = /\b(reviewed by (a )?(scholar|expert|pandit)|scholarly review|peer[- ]reviewed|verified by (a )?(scholar|expert)|authenticated by)\b/i;
  for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.json'))) {
    T(!bad.test(JSON.stringify(read(f.replace(/\.json$/, '')))), `data/${f} contains copy implying human or scholarly review`);
  }
});
check('evidence', 'the project claims nothing about being authentic or definitive', () => {
  const bad = /\b(authentic|definitive|faithful to the original|the true (story|version))\b/i;
  for (const n of ['app_design', 'films', 'music', 'narrator']) {
    const d = opt(n);
    if (!d) continue;
    T(!bad.test(JSON.stringify(d)), `data/${n}.json claims authenticity or definitiveness`);
  }
});

// ---------------------------------------------------------------- attribution
check('attribution', 'every speech-act claim names its speaker', () => {
  for (const c of allClaims().filter((x) => x.speech_act)) T(c.speaker, `speech-act claim ${c.id} names no speaker`);
});
check('attribution', 'every claim speaker is an entity that exists', () => {
  const e = new Set(read('entities').entities.map((x) => x.id));
  for (const c of allClaims()) if (c.speaker) T(e.has(c.speaker), `claim ${c.id} is spoken by ${c.speaker}, who is not an entity`);
});
check('attribution', 'every attributed narration line states its attribution rule', () => {
  for (const { film, id, n } of allNarration()) if (n.speaker) T(n.speaker_rule, `${film} narration ${id} names a speaker but states no attribution rule`);
});
check('attribution', 'every attributed line carries an attribution marker in every language', () => {
  const langs = read('narrator').languages;
  for (const { film, id, n } of allNarration()) {
    if (!n.speaker) continue;
    for (const [lang, spec] of Object.entries(langs)) {
      const markers = spec.attribution_markers ?? [];
      T(markers.length > 0, `data/narrator.json declares no attribution markers for ${lang}`);
      T(markers.some((m) => (n[lang] ?? '').includes(m)),
        `${film} narration ${id} is ${n.speaker}'s statement but the ${lang} line carries no attribution marker - it reads as narrator fact: "${n[lang]}"`);
    }
  }
});
check('attribution', 'a narration speaker is an entity that exists', () => {
  const e = new Set(read('entities').entities.map((x) => x.id));
  for (const { film, id, n } of allNarration()) if (n.speaker) T(e.has(n.speaker), `${film} narration ${id} is spoken by unknown ${n.speaker}`);
});

// ---------------------------------------------------------------- rights
check('rights', 'every restricted source forbids its text from travelling', () => {
  for (const s of read('source_register').sources.filter((x) => x.restricted)) {
    T(s.text_may_travel === false, `restricted source ${s.id} allows text to travel`);
    T(s.restriction_reason, `restricted source ${s.id} states no reason`);
  }
});
check('rights', 'every source declares a licence and a travel rule', () => {
  for (const s of read('source_register').sources) {
    T(s.licence, `source ${s.id} declares no licence`);
    T(typeof s.text_may_travel === 'boolean', `source ${s.id} does not say whether its text may travel`);
  }
});
check('rights', 'no passage record holds text', () => {
  for (const p of read('passages').passages) T(p.text_held === false, `passage ${p.id} holds text - locators travel, text does not`);
});
check('rights', 'no passage record carries a verse text field', () => {
  for (const p of read('passages').passages) {
    for (const k of ['text', 'verse', 'verse_text', 'sanskrit', 'quote']) T(p[k] === undefined, `passage ${p.id} carries a ${k} field`);
  }
});
check('rights', 'no data file holds a long run of source script', () => {
  for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.json'))) {
    const blob = JSON.stringify(read(f.replace(/\.json$/, '')));
    T((blob.match(/[ऀ-ॿ\s]{60,}/g) ?? []).length === 0, `data/${f} holds a long Devanagari run - possible restricted verse text`);
  }
});
check('rights', 'the corpus holds no ingested text on disk', () => {
  const dir = join(ROOT, 'corpus');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) T(!/\.(txt|xml|tei)$/i.test(f), `corpus/${f} looks like ingested text - restricted text must not be stored`);
});

// ---------------------------------------------------------------- gates
check('gates', 'no sheet is approved without a named approver', () => {
  for (const s of read('sheets').sheets) if (s.approved) T(s.approved_by, `sheet ${s.id} is approved with no approver named`);
});
check('gates', 'no sheet is approved without files', () => {
  for (const s of read('sheets').sheets) if (s.approved) T(s.files.length > 0, `sheet ${s.id} is approved with no files`);
});
check('gates', 'no sheet is approved by a process rather than a person', () => {
  for (const s of read('sheets').sheets) if (s.approved_by) {
    T(!/^(system|auto|process|script|ci|bot)$/i.test(s.approved_by.trim()), `sheet ${s.id} is approved by "${s.approved_by}", which is not a person`);
  }
});
check('gates', 'every sheet has one hash per file', () => {
  for (const s of read('sheets').sheets) T(s.files.length === s.hashes.length, `sheet ${s.id} has ${s.files.length} files and ${s.hashes.length} hashes`);
});
check('gates', 'every sheet names an entity that exists', () => {
  const e = new Set(read('entities').entities.map((x) => x.id));
  for (const s of read('sheets').sheets) T(e.has(s.entity), `sheet ${s.id} names unknown entity ${s.entity}`);
});
check('gates', 'every principal who appears in a directed film has a sheet record', () => {
  const sheets = new Set(read('sheets').sheets.map((s) => s.entity));
  for (const { film, t } of directed()) {
    for (const e of new Set(t.shots.flatMap((s) => s.entities ?? []))) {
      T(sheets.has(e), `${film.id} stages ${e}, who has no model sheet record - the gate cannot bind`);
    }
  }
});
check('gates', 'the twenty-frame spec still describes four axes, not twenty generations', () => {
  const spec = read('sheets')._twenty_frame_spec;
  T(spec, 'the twenty-frame spec has been deleted');
  const axes = Object.keys(spec.axes);
  T(axes.length === 4, `expected four axes, found ${axes.length}`);
  for (const a of ['angle', 'lighting', 'distance', 'expression']) T(axes.includes(a), `axis ${a} is missing`);
  T(/NOT a requirement for twenty paid generations/i.test(spec.what_it_is), 'the spec no longer says it is not twenty paid generations');
});
check('gates', 'the upload spec names four slots and says upload never approves', () => {
  const u = read('sheets')._upload_spec;
  T(u, 'the upload spec has been deleted');
  T(u.slots.length === 4, `slots are ${u.slots.join(',')}`);
  T(u.axis_satisfied_by_full_four_view === 'angle', 'a four-view sheet no longer maps to the angle axis alone');
  T(/never approves/i.test(u.note), 'the spec no longer says upload never approves');
});
check('gates', 'evidence_held and outstanding together cover all four axes', () => {
  for (const s of read('sheets').sheets) {
    const all = [...s.twenty_frame_test.evidence_held, ...s.twenty_frame_test.outstanding].sort();
    T(JSON.stringify(all) === JSON.stringify(['angle', 'distance', 'expression', 'lighting']), `sheet ${s.id} axes do not cover the four: ${all.join(',')}`);
  }
});
check('gates', 'no axis is both held and outstanding', () => {
  for (const s of read('sheets').sheets) {
    const held = new Set(s.twenty_frame_test.evidence_held);
    for (const o of s.twenty_frame_test.outstanding) T(!held.has(o), `sheet ${s.id} has ${o} both held and outstanding`);
  }
});
check('gates', 'no entity with an outstanding memo has a design record', () => {
  const blocked = new Set(read('memos').memos.filter((m) => m.state === 'outstanding').map((m) => m.entity));
  for (const e of read('entities').entities) T(!blocked.has(e.id), `entity ${e.id} has a design record but its memo is outstanding`);
});
check('gates', 'no entity with an outstanding memo appears in any shot', () => {
  const blocked = new Set(read('memos').memos.filter((m) => m.state === 'outstanding').map((m) => m.entity));
  for (const { film, t } of directed()) {
    for (const s of t.shots) for (const e of s.entities ?? []) T(!blocked.has(e), `${film.id} shot ${s.id} stages memo-blocked ${e}`);
  }
});
check('gates', 'every memo states why it is written before it is drawn', () => {
  for (const m of read('memos').memos) {
    T(['outstanding', 'written', 'closed'].includes(m.state), `memo for ${m.entity} has state ${m.state}`);
    T(m.reason && m.reason.length > 10, `memo for ${m.entity} states no reason`);
  }
});
check('gates', 'a complexion that is not established does not block depiction', () => {
  for (const e of read('entities').entities) {
    const cc = e.design?.complexion_claim;
    if (!cc || cc.state !== 'not-established') continue;
    T(/may be shown|does not block depicting/i.test(cc.note ?? ''), `entity ${e.id} has an unestablished complexion and the note does not say he may still be depicted`);
  }
});

// ---------------------------------------------------------------- the material world
check('world', 'arches, domes and marble are forbidden and never allowed', () => {
  const mw = read('material_world');
  for (const bad of ['arch', 'dome', 'marble']) {
    T(mw.architecture.forbidden.some((f) => f.includes(bad)), `${bad} is not in the forbidden list`);
    T(!mw.architecture.allowed.some((a) => a.includes(bad)), `${bad} appears in the allowed list`);
  }
});
check('world', 'cloth is draped and never tailored', () => {
  const c = read('material_world').cloth;
  T(/unstitched|draped/.test(c.construction), 'cloth construction is no longer draped');
  for (const bad of ['tailored', 'sewn']) T(c.forbidden.includes(bad), `${bad} is not forbidden`);
});
check('world', 'every entity garment is declared draped', () => {
  for (const e of read('entities').entities) {
    T(/drape/i.test(e.design.garment.construction), `entity ${e.id} garment is not declared draped`);
  }
});
check('world', 'colourism is forbidden outright', () => {
  const f = read('material_world').forbidden_globally.colourism;
  T(f.some((x) => /lighten/i.test(x)), 'lightened skin is not forbidden');
  T(f.some((x) => /fair.equals.good/i.test(x)), 'fair-equals-good coding is not forbidden');
});
check('world', 'every skin lock forbids lightening and is measurable', () => {
  const locks = read('locks').locks.filter((x) => x.kind === 'skin_albedo');
  T(locks.length > 0, 'the graph declares no skin albedo locks at all');
  for (const l of locks) {
    T(/never lighten/i.test(l.rule), `lock ${l.id} does not forbid lightening`);
    T(typeof l.value.lab_L === 'number' && typeof l.value.tolerance_L === 'number', `lock ${l.id} has no measurable albedo`);
    T(/^#[0-9A-Fa-f]{6}$/.test(l.value.srgb_hex), `lock ${l.id} has no sRGB value`);
  }
});
check('world', 'every skin lock lab_L matches its own hex', () => {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  for (const l of read('locks').locks.filter((x) => x.kind === 'skin_albedo')) {
    const h = l.value.srgb_hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const L = Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16;
    T(Math.abs(L - l.value.lab_L) < 1.0, `lock ${l.id} says L* ${l.value.lab_L} but ${l.value.srgb_hex} is L* ${L.toFixed(1)}`);
  }
});
check('world', 'ornament comes from a named evidence library', () => {
  const libs = new Set((read('evidence_libraries').libraries ?? []).map((l) => l.source));
  T(libs.has(read('material_world').ornament.vocabulary), 'ornament vocabulary names no known source');
  for (const e of read('entities').entities) T(libs.has(e.design.ornament.vocabulary), `entity ${e.id} ornament names unknown vocabulary`);
});

// ---------------------------------------------------------------- the grade
check('grade', 'the black point is declared and low', () => {
  const g = read('grade');
  T(typeof g.black_point_ire === 'number' && g.black_point_ire >= 0 && g.black_point_ire <= 8, `black point is IRE ${g.black_point_ire}`);
});
check('grade', 'shadows run warm and never blue', () => {
  const g = read('grade');
  T(g.shadow_tint.direction === 'warm', 'shadow tint is not warm');
  T(/never blue/i.test(g.shadow_tint.rule), 'the never-blue rule is gone');
  T(g.forbidden.some((x) => /blue/i.test(x)), 'blue shadows are not forbidden');
});
check('grade', 'the shadow tint curve rejoins the diagonal before skin', () => {
  const st = read('grade').shadow_tint;
  T(typeof st.pivot === 'number' && typeof st.rejoin === 'number', 'the tint curve has no pivot/rejoin');
  T(st.rejoin >= 0.55, `rejoin ${st.rejoin} sits inside the skin band and would lighten every face`);
  T(st.pivot < st.rejoin, 'the pivot is not below the rejoin');
});
check('grade', 'skin is protected by a qualifier, two-sided', () => {
  const q = read('grade').skin_qualifier;
  T(q.enabled === true, 'the skin qualifier is disabled');
  T(q.protection === 'hold', 'the skin qualifier no longer holds');
  T(typeof q.hold_black === 'number', 'the skin hold has no value');
  T(/either direction/i.test(q.rule), 'the skin rule is no longer two-sided');
});
check('grade', 'grain is applied before the subtitle burn', () => {
  T(/before the subtitle/i.test(read('grade').grain.note), 'grain order changed - a caption sitting in grain is a defect');
});

// ---------------------------------------------------------------- typography
check('type', 'the frame is declared and is vertical', () => {
  const f = read('typography').frame;
  T(f.width > 0 && f.height > f.width, `frame ${f.width}x${f.height} is not vertical`);
  T(f.fps > 0, 'no fps declared');
});
check('type', 'every language the narrator declares has typography', () => {
  const langs = Object.keys(read('narrator').languages);
  for (const l of langs) T(read('typography').scripts[l], `no typography for language ${l}`);
});
check('type', 'every script declares size, line height and a line box', () => {
  for (const [l, s] of Object.entries(read('typography').scripts)) {
    T(s.size_px > 0, `${l} has no size`);
    T(s.line_height > 0, `${l} has no line height`);
    T(s.line_box_px > 0, `${l} has no line box`);
    T(s.max_chars_per_line > 0 && s.max_lines > 0, `${l} has no wrapping limits`);
  }
});
check('type', 'every line box fits its own size times its line height', () => {
  for (const [l, s] of Object.entries(read('typography').scripts)) {
    T(s.line_box_px >= Math.ceil(s.size_px * s.line_height) - 1, `${l} line box ${s.line_box_px} is smaller than ${s.size_px}x${s.line_height}`);
  }
});
check('type', 'a stacking script gets more line box than Latin', () => {
  const s = read('typography').scripts;
  const latin = Object.values(s).find((x) => x.script === 'Latin');
  if (!latin) return;
  for (const [l, x] of Object.entries(s)) {
    if (x.script === 'Latin') continue;
    T(x.line_box_px > latin.line_box_px, `${l} (${x.script}) has no more line box than Latin, and it stacks`);
  }
});
check('type', 'every non-Latin script carries conjunct probes on a base', () => {
  for (const [l, s] of Object.entries(read('typography').scripts)) {
    if (s.script === 'Latin') continue;
    T(Array.isArray(s.conjunct_probe) && s.conjunct_probe.length >= 3, `${l} has fewer than three conjunct probes`);
    for (const p of s.conjunct_probe) {
      T([...p].length >= 2, `${l} probe "${p}" is a single mark with no base - it measures nothing`);
    }
  }
});

// ---------------------------------------------------------------- treatments
check('treatment', 'a film marked directed has a treatment on disk', () => {
  for (const f of read('films').films.filter((x) => x.status === 'directed')) {
    T(treatment(f.id), `film ${f.id} is marked directed but has no treatment`);
  }
});
check('treatment', 'every treatment runs to its declared duration', () => {
  for (const { film, t } of directed()) {
    const sum = round(t.shots.reduce((a, s) => a + s.duration_s, 0));
    T(sum === film.duration_s, `${film.id} shots total ${sum}s but the film declares ${film.duration_s}s`);
  }
});
check('treatment', 'every treatment has contiguous shot starts', () => {
  for (const { film, t } of directed()) {
    let run = 0;
    for (const s of t.shots) {
      T(Math.abs(s.start_s - run) < 1e-9, `${film.id} shot ${s.id} starts at ${s.start_s}, previous ends at ${run}`);
      run = round(run + s.duration_s);
    }
  }
});
check('treatment', 'every duration is a whole number of frames', () => {
  for (const { film, t } of directed()) {
    for (const s of t.shots) {
      const fr = s.duration_s * t.fps;
      T(Math.abs(fr - Math.round(fr)) < 1e-6, `${film.id} shot ${s.id} is ${s.duration_s}s = ${fr} frames at ${t.fps}fps`);
    }
  }
});
check('treatment', 'shot ids are unique within a treatment', () => {
  for (const { film, t } of directed()) {
    const ids = t.shots.map((s) => s.id);
    T(new Set(ids).size === ids.length, `${film.id} has a duplicate shot id`);
  }
});
check('treatment', 'every reuse and crop points at a shot that exists', () => {
  for (const { film, t } of directed()) {
    const ids = new Set(t.shots.map((s) => s.id));
    for (const s of t.shots) {
      if (s.source === 'reuse') T(ids.has(s.reuse_of), `${film.id} shot ${s.id} reuses unknown ${s.reuse_of}`);
      if (s.source === 'crop') T(ids.has(s.crop_of), `${film.id} shot ${s.id} crops unknown ${s.crop_of}`);
    }
  }
});
check('treatment', 'no reuse or crop points forward in time', () => {
  for (const { film, t } of directed()) {
    const at = new Map(t.shots.map((s, i) => [s.id, i]));
    for (const [i, s] of t.shots.entries()) {
      const ref = s.reuse_of ?? s.crop_of;
      if (ref) T(at.get(ref) < i, `${film.id} shot ${s.id} reuses ${ref}, which comes later`);
    }
  }
});
check('treatment', 'every shot declares a source we understand', () => {
  const ok = new Set(['generate', 'reuse', 'crop']);
  for (const { film, t } of directed()) for (const s of t.shots) T(ok.has(s.source), `${film.id} shot ${s.id} has source ${s.source}`);
});
check('treatment', 'every shot names entities that exist', () => {
  const e = new Set(read('entities').entities.map((x) => x.id));
  for (const { film, t } of directed()) for (const s of t.shots) for (const x of s.entities ?? []) T(e.has(x), `${film.id} shot ${s.id} names unknown entity ${x}`);
});
check('treatment', 'every shot cites claims that exist', () => {
  const ids = new Set(allClaims().map((c) => c.id));
  for (const { film, t } of directed()) for (const s of t.shots) for (const c of s.claims ?? []) T(ids.has(c), `${film.id} shot ${s.id} cites unknown claim ${c}`);
});
check('treatment', 'no shot cites a claim belonging to another film', () => {
  const by = new Map(allClaims().map((c) => [c.id, c]));
  for (const { film, t } of directed()) for (const s of t.shots) for (const c of s.claims ?? []) {
    T(by.get(c).film === film.id, `${film.id} shot ${s.id} cites ${c}, which belongs to ${by.get(c).film}`);
  }
});
check('treatment', 'no shot rests only on a disputed or unresolved claim', () => {
  const by = new Map(allClaims().map((c) => [c.id, c]));
  for (const { film, t } of directed()) for (const s of t.shots) {
    const cs = (s.claims ?? []).map((c) => by.get(c));
    if (cs.length === 0) continue;
    T(cs.some((c) => c.state === 'accepted'), `${film.id} shot ${s.id} rests on no accepted claim`);
  }
});
check('treatment', 'no shot stages a disputed claim at all', () => {
  const by = new Map(allClaims().map((c) => [c.id, c]));
  for (const { film, t } of directed()) for (const s of t.shots) for (const c of s.claims ?? []) {
    T(by.get(c).state !== 'disputed', `${film.id} shot ${s.id} stages disputed claim ${c}`);
  }
});
check('treatment', 'every narration line maps to a shot that exists', () => {
  for (const { film, t } of directed()) {
    const ids = new Set(t.shots.map((s) => s.id));
    for (const [id, n] of Object.entries(t.narration ?? {})) T(ids.has(n.shot), `${film.id} narration ${id} names unknown shot ${n.shot}`);
  }
});
check('treatment', 'every shot narration reference resolves', () => {
  for (const { film, t } of directed()) for (const s of t.shots) if (s.narration) T(t.narration[s.narration], `${film.id} shot ${s.id} names unknown narration ${s.narration}`);
});
check('treatment', 'narration exists in every declared language', () => {
  const langs = Object.keys(read('narrator').languages);
  for (const { film, id, n } of allNarration()) for (const l of langs) T(n[l] && n[l].length > 0, `${film} narration ${id} has no ${l}`);
});
check('treatment', 'every narration line fits its own caption box', () => {
  const scripts = read('typography').scripts;
  for (const { film, id, n } of allNarration()) {
    for (const [l, s] of Object.entries(scripts)) {
      const words = (n[l] ?? '').split(/\s+/).filter(Boolean);
      const longest = Math.max(0, ...words.map((w) => w.length));
      T(longest <= s.max_chars_per_line, `${film} narration ${id} has a ${l} word of ${longest} characters, over the ${s.max_chars_per_line} line limit - it cannot be wrapped`);
    }
  }
});

// ---------------------------------------------------------------- register
check('register', 'no narration line uses fake-epic vocabulary', () => {
  const bad = /\b(behold|lo|verily|thus|didst|thee|thy|thine|o king|hark|forsooth|smote)\b/i;
  for (const { film, id, n } of allNarration()) T(!bad.test(n.en), `${film} narration ${id} uses fake-epic vocabulary: "${n.en}"`);
});
check('register', 'no narration line uses marketing adjectives', () => {
  const bad = /\b(epic|legendary|timeless|breathtaking|stunning|iconic|majestic|glorious)\b/i;
  for (const { film, id, n } of allNarration()) T(!bad.test(n.en), `${film} narration ${id} uses a marketing adjective: "${n.en}"`);
});
check('register', 'English narration lines stay short', () => {
  for (const { film, id, n } of allNarration()) {
    const w = n.en.split(/\s+/).filter(Boolean).length;
    T(w <= 12, `${film} narration ${id} is ${w} words: "${n.en}"`);
  }
});
check('register', 'the narrator brief still names the test line', () => {
  T(JSON.stringify(read('narrator')).includes('He said no.'), 'the test line is gone from the narrator brief');
});

// ---------------------------------------------------------------- motion
check('motion', 'every effects shot names a film that exists', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const [id, s] of Object.entries(read('effects').shots)) T(f.has(s.film), `effects shot ${id} names unknown film ${s.film}`);
});
check('motion', 'every effects shot exists in its treatment', () => {
  for (const [id, s] of Object.entries(read('effects').shots)) {
    const t = treatment(s.film);
    if (!t) continue;
    T(t.shots.some((x) => x.id === id), `effects names shot ${id}, which is not in ${s.film}`);
  }
});
check('motion', 'a no-motion instruction always matches a motion:false flag', () => {
  for (const [id, s] of Object.entries(read('effects').shots)) {
    if (/NO MOTION/i.test(s.instruction)) T(s.motion === false, `shot ${id} says NO MOTION but motion is ${s.motion}`);
    if (s.motion === false) T(/NO MOTION/i.test(s.instruction), `shot ${id} is flagged motion:false but its instruction does not say NO MOTION`);
  }
});
check('motion', 'the five rejection criteria are all present', () => {
  const ids = read('effects').rejection_criteria.map((c) => c.id);
  for (const need of ['REJ.CAMERA-MOVED', 'REJ.EXPRESSION-CHANGED', 'REJ.BODY-SHIFTED', 'REJ.FRAME-ENTRY', 'REJ.LOOP-VISIBLE']) {
    T(ids.includes(need), `rejection criterion ${need} is missing`);
  }
});
check('motion', 'a camera-locked shot never has an instruction that moves the camera', () => {
  for (const [id, s] of Object.entries(read('effects').shots)) {
    if (s.motion && s.camera_locked) T(!/camera (move|pan|push|drift|track)/i.test(s.instruction), `shot ${id} is camera-locked but its instruction moves the camera`);
  }
});

// ---------------------------------------------------------------- joins
check('joins', 'every declared join names films that exist', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const j of read('transitions').joins) T(f.has(j.from) && f.has(j.to), `join ${j.from}->${j.to} names an unknown film`);
});
check('joins', 'declared arc joins match the transitions', () => {
  for (const arc of read('films').arcs ?? []) {
    const a = (arc.continuous_joins ?? []).map((j) => `${j.from}->${j.to}`).sort();
    const tr = read('transitions').joins.filter((j) => j.kind === 'continuous').map((j) => `${j.from}->${j.to}`).sort();
    T(JSON.stringify(a) === JSON.stringify(tr), `arc ${arc.id} joins do not match transitions`);
  }
});
check('joins', 'every continuous join carries room tone and a shared frame', () => {
  for (const j of read('transitions').joins.filter((x) => x.kind === 'continuous')) {
    T(j.room_tone === 'carry', `join ${j.from}->${j.to} does not carry room tone`);
    T(j.shared_frame === true, `join ${j.from}->${j.to} does not share a frame`);
  }
});
check('joins', 'the continuous joins form an unbroken chain', () => {
  const j = read('transitions').joins.filter((x) => x.kind === 'continuous');
  for (let i = 1; i < j.length; i++) T(j[i].from === j[i - 1].to, `chain breaks between ${j[i - 1].to} and ${j[i].from}`);
});

// ---------------------------------------------------------------- music
check('music', 'the music provider is none', () => T(read('music').provider === 'none', 'music provider is not none'));
check('music', 'music is a brief, not a generated asset', () => {
  T(read('music').status === 'brief-only', 'music status changed');
  T(/composer/i.test(read('music').note), 'the note no longer names a composer');
});
check('music', 'the env example keeps MUSIC_PROVIDER=none', () => {
  const blob = text('.env.example');
  T(blob.length > 0, '.env.example is missing');
  T(/MUSIC_PROVIDER=none/.test(blob), '.env.example no longer sets MUSIC_PROVIDER=none');
});

// ---------------------------------------------------------------- spend
check('spend', 'the spend ledger is well formed', () => {
  const s = read('spend', { fresh: true });
  T(Array.isArray(s.rows), 'spend rows is not an array');
  T(typeof s.totals.usd === 'number', 'spend total is not a number');
});
check('spend', 'the ledger total matches the sum of its rows', () => {
  const s = read('spend', { fresh: true });
  const sum = round(s.rows.reduce((a, r) => a + r.usd, 0));
  T(Math.abs(sum - s.totals.usd) < 1e-6, `rows sum to ${sum} but the total says ${s.totals.usd}`);
});
check('spend', 'every ledger row names a provider, a time and a dollar amount', () => {
  for (const r of read('spend', { fresh: true }).rows) {
    T(r.provider, 'a ledger row names no provider');
    T(typeof r.usd === 'number', 'a ledger row has no dollar amount');
    T(r.at, 'a ledger row has no timestamp');
  }
});

// ---------------------------------------------------------------- repo hygiene
check('repo', 'no generated page has lost its banner', () => {
  const dir = join(ROOT, 'graph');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    T(/GENERATED FILE/.test(text(`graph/${f}`)), `graph/${f} has lost its generated-file banner - it may have been hand-edited`);
  }
});
check('repo', 'generated packets carry their banner', () => {
  const dir = join(ROOT, 'packets');
  if (!existsSync(dir)) return;
  for (const film of readdirSync(dir)) {
    const p = join(dir, film, 'packet.json');
    if (!existsSync(p)) continue;
    T(/GENERATED/.test(JSON.parse(readFileSync(p, 'utf8'))._generated ?? ''), `packets/${film}/packet.json has lost its banner`);
  }
});
check('repo', 'no packet disagrees with its treatment', () => {
  const dir = join(ROOT, 'packets');
  if (!existsSync(dir)) return;
  for (const film of readdirSync(dir)) {
    const pj = join(dir, film, 'packet.json');
    if (!existsSync(pj)) continue;
    const p = JSON.parse(readFileSync(pj, 'utf8'));
    const t = treatment(film);
    T(t, `packets/${film} exists but ${film} has no treatment`);
    T(p.shots === t.shots.length, `packets/${film} says ${p.shots} shots, the treatment has ${t.shots.length} - rebuild`);
    T(p.duration_s === t.duration_s, `packets/${film} says ${p.duration_s}s, the treatment says ${t.duration_s}s - rebuild`);
  }
});
check('repo', 'no packet carries a long run of source script', () => {
  const dir = join(ROOT, 'packets');
  if (!existsSync(dir)) return;
  for (const film of readdirSync(dir)) {
    const c = join(dir, film, 'stems', 'canon.json');
    if (!existsSync(c)) continue;
    T(!/[ऀ-ॿ\s]{60,}/.test(readFileSync(c, 'utf8')), `packets/${film}/stems/canon.json carries a long Devanagari run`);
  }
});
check('repo', 'the agents directory holds system prompts', () => {
  const dir = join(ROOT, 'agents');
  T(existsSync(dir), 'agents/ is missing');
  T(readdirSync(dir).filter((f) => f.endsWith('.md')).length >= 5, 'fewer than five agent prompts');
});
check('repo', 'the handoff contract is present', () => {
  T(text('HANDOFF.md').length > 500, 'HANDOFF.md is missing - the studio must state what it needs from a graph');
});

// ---------------------------------------------------------------- run
let pass = 0; const failures = [];
for (const c of checks) {
  try { c.fn(); pass++; }
  catch (e) { failures.push({ ...c, error: e.message }); }
}
const byArea = {};
for (const c of checks) byArea[c.area] = (byArea[c.area] ?? 0) + 1;

const d = directed();
console.log(`\nVALIDATE - ${checks.length} invariants, offline, no key, no spend`);
console.log(`  graph: ${read('films').films.length} films (${d.length} directed), ${allClaims().length} claims, ${read('entities').entities.length} entities\n`);
console.log('  ' + Object.entries(byArea).map(([a, n]) => `${a} ${n}`).join('  ·  '));
if (failures.length) {
  console.log(`\n  ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  [${f.area}] ${f.name}\n      ${f.error}`);
  console.log('');
  process.exit(1);
}
console.log(`\n  all ${pass} green\n`);

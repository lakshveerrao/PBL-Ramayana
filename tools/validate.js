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
import { passageTextFields, sourceStatesTravel, textMayTravel, locatorIdentifiesAPlace,
         locatorKind, hasDesign, skinGovernance, forbidsLightening, isLatinScript,
         filmNeedsDuration } from '../lib/contract.js';
import * as fal from '../lib/fal.js';
import { ENDPOINTS, referenceConditioned, textToImage } from '../lib/endpoints.js';
import { endpointCost } from '../lib/cost.js';
import { identityPolicy } from '../lib/render.js';
import { assemble, directionOverrides } from '../lib/prompt.js';
import { briefs as sheetBriefs, decisions as sheetDecisions, order as sheetOrder, viewPrompt } from '../lib/sheetprompt.js';
import { frame, gradeNumbers, sheetAxes, effectsShots, rejectionCriteria, joins as normJoins,
         roomTone, memoReason, materialSays, forbiddenEverywhere } from '../lib/graph.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const checks = [];
const check = (area, name, fn) => checks.push({ area, name, fn });
const T = (cond, msg) => { if (!cond) throw new Error(msg); };
const text = (rel) => { const p = join(ROOT, rel); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
// Optional files: absent is fine, present must be correct.
const opt = (name) => existsSync(join(dataDir(), `${name}.json`)) ? read(name) : null;
const round = (n) => Math.round(n * 1e6) / 1e6;

// Is a forbidden word ASSERTED, or merely negated? A prompt reading "No arch of later
// vocabulary - a flat lintel" is correct; one reading "the edge of a sleeve" is not.
// Returns the offending clause, or null.
function asserted(prompt, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  for (const m of String(prompt).matchAll(re)) {
    const src = String(prompt);
    const before = src.slice(Math.max(0, m.index - 44), m.index).toLowerCase();
    const after = src.slice(m.index + word.length, m.index + word.length + 30).toLowerCase();
    // A negation before the word - "no arch of later vocabulary".
    if (/\b(no|not|never|without|avoid|forbidden|absolutely not present:)\s*[\w\s,-]{0,24}$/.test(before)) continue;
    // Or after it - "her face is never shown", "the face NOT shown".
    if (/^\s*(is|are|was)?\s*(never|not|no)\b/.test(after)) continue;
    if (/^\s*(withheld|not shown|never shown)\b/.test(after)) continue;
    const clause = String(prompt).slice(Math.max(0, m.index - 40), m.index + word.length + 24).replace(/\s+/g, ' ').trim();
    return clause;
  }
  return null;
}

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
check('data', 'every authored film declares a positive duration', () => {
  // A film with no treatment is a ledger entry - named, not yet authored - and need
  // not declare a duration. A film WITH one must.
  for (const f of read('films').films) {
    if (!filmNeedsDuration(f, Boolean(treatment(f.id)))) continue;
    T(typeof f.duration_s === 'number' && f.duration_s > 0, `film ${f.id} has a treatment but no usable duration`);
  }
});
check('data', 'claim ids are unique', () => {
  const ids = allClaims().map((c) => c.id);
  T(new Set(ids).size === ids.length, 'duplicate claim id');
});
check('data', 'every claim names a film that exists, or none', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const c of allClaims()) T(c.film == null || f.has(c.film), `claim ${c.id} names unknown film ${c.film}`);
});
check('data', 'an entity design that names a skin lock names one that exists', () => {
  // An entities file may hold identity records with no design at all - skin is then
  // governed by a policy lock and set by the studio's approved sheets.
  const l = new Set(read('locks').locks.map((x) => x.id));
  for (const e of read('entities').entities) {
    const a = e.design?.skin_albedo;
    if (a == null) continue;
    T(l.has(a), `entity ${e.id} names unknown lock ${a}`);
  }
});
check('data', 'skin is governed, either per entity or by policy', () => {
  const g = skinGovernance(read('locks').locks);
  T(g.kind !== 'none', 'nothing in this graph governs skin - neither a per-entity albedo lock nor a skin policy');
  for (const l of g.locks) T(forbidsLightening(l), `skin lock ${l.id} does not forbid lightening`);
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
check('evidence', 'every T claim carries a locator that identifies a place', () => {
  // Two numbering systems are legitimate: a Sanskrit sarga/verse reference, or an
  // edition's own section numbering, which asserts no verse equivalence.
  for (const c of allClaims().filter((x) => x.evidence_class === 'T')) {
    T(locatorIdentifiesAPlace(c.locator),
      `text claim ${c.id} has no locator that identifies a place (${locatorKind(c.locator)})`);
  }
});
check('evidence', 'an edition-section locator says it asserts no verse equivalence', () => {
  for (const c of allClaims()) {
    if (locatorKind(c.locator) !== 'edition-section') continue;
    T(c.locator.numbering, `claim ${c.id} uses ${c.locator.edition} section numbering but does not say so`);
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
  // A disclaimer is the opposite of a claim: "AI-assisted, NOT scholarly review" is
  // exactly the sentence this project wants to see.
  const bad = /(?<!\b(?:not|never|no|without)\s)(?<!\b(?:not|never|no)\b[^.]{0,20})\b(reviewed by (?:a )?(?:scholar|expert|pandit)|scholarly review|peer[- ]reviewed|verified by (?:a )?(?:scholar|expert)|authenticated by)\b/i;
  for (const f of readdirSync(join(dataDir())).filter((x) => x.endsWith('.json'))) {
    const blob = JSON.stringify(read(f.replace(/\.json$/, '')));
    const m = blob.match(bad);
    T(!m, `data/${f} contains copy implying human or scholarly review: "${m?.[0]}"`);
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
    T(textMayTravel(s) === false, `restricted source ${s.id} allows text to travel`);
    T(s.restriction_reason || s.note || s.use_policy, `restricted source ${s.id} states no reason or policy`);
  }
});
check('rights', 'every source declares a licence and says whether its text may travel', () => {
  // Either a flat boolean or a use_policy naming viewer display, product quotation
  // and generation input. Saying nothing is the failure.
  for (const s of read('source_register').sources) {
    T(s.licence, `source ${s.id} declares no licence`);
    T(sourceStatesTravel(s), `source ${s.id} does not say whether its text may travel`);
  }
});
check('rights', 'no passage record carries source text', () => {
  // Absence of a text field is the guarantee. A numeric `verse` is a locator
  // component - verse 1 of sarga 18 - and is not text.
  for (const p of read('passages').passages) {
    const found = passageTextFields(p);
    T(found.length === 0, `passage ${p.id} carries source text in: ${found.join(', ')}`);
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
check('gates', 'no person appears in a directed film without the gate seeing them', () => {
  // A missing sheet record is SAFE - the consistency gate refuses an entity it has no
  // approved sheet for. What would be unsafe is a person the gate lets through. So the
  // invariant is the refusal, not the record: every person in frame is either sheeted
  // or refused, and never silently allowed.
  const sheets = new Map(read('sheets').sheets.map((s) => [s.entity, s]));
  const kindOf = new Map(read('entities').entities.map((e) => [e.id, (e.kind ?? 'person').toLowerCase()]));
  for (const { film, t } of directed()) {
    for (const e of new Set(t.shots.flatMap((s) => s.entities ?? []))) {
      if (!/person|character|principal/.test(kindOf.get(e) ?? 'person')) continue;
      const sh = sheets.get(e);
      T(!sh || sh.approved === false || sh.approved_by,
        `${film.id} stages ${e}, whose sheet is approved with no approver named - the gate would let them through`);
    }
  }
});
check('gates', 'the twenty-frame spec still means four axes, not twenty generations', () => {
  const spec = read('sheets')._twenty_frame_spec;
  T(spec, 'the twenty-frame spec has been deleted');
  const blob = JSON.stringify(spec).toLowerCase();
  for (const a of ['angle', 'lighting', 'distance', 'expression']) T(blob.includes(a), `axis ${a} is missing from the spec`);
  T(/not\s+(a\s+)?(requirement\s+for\s+)?twenty|not twenty|never twenty|not\s+\d+\s+paid/i.test(blob),
    'the spec no longer says it is not twenty paid generations');
});
check('gates', 'the upload spec maps a four-view sheet to the angle axis only', () => {
  const u = read('sheets')._upload_spec;
  T(u, 'the upload spec has been deleted');
  const blob = JSON.stringify(u).toLowerCase();
  for (const slot of ['front', 'profile']) T(blob.includes(slot), `the upload spec names no ${slot} slot`);
  // A four-view sheet satisfies ANGLE and nothing else. That is the rule that must
  // survive; "upload never approves" is a studio-side rule enforced in lib/sheets.js.
  // Prefer the explicit list; fall back to the sentence, which must say the other
  // three axes REMAIN OUTSTANDING rather than that the sheet satisfies them.
  const sat = u.satisfies ?? (u.axis_satisfied_by_full_four_view ? [u.axis_satisfied_by_full_four_view] : null);
  if (sat) {
    T(JSON.stringify(sat) === JSON.stringify(['angle']), `a four-view sheet is claimed to satisfy ${sat.join(', ')}, not angle alone`);
  } else {
    T(/angle/.test(blob), 'the upload spec no longer maps a four-view sheet to the angle axis');
    T(/(lighting|distance|expression)[^.]{0,60}(outstanding|remain)/.test(blob),
      'the upload spec no longer says the other three axes remain outstanding');
  }
});
check('gates', 'held and outstanding together cover all four axes', () => {
  for (const sh of read('sheets').sheets) {
    const a = sheetAxes(sh);
    const all = [...a.held, ...a.outstanding].sort();
    T(JSON.stringify(all) === JSON.stringify(['angle', 'distance', 'expression', 'lighting']), `sheet ${sh.id} axes do not cover the four: ${all.join(',')}`);
  }
});
check('gates', 'no axis is both held and outstanding', () => {
  for (const sh of read('sheets').sheets) {
    const a = sheetAxes(sh);
    const held = new Set(a.held);
    for (const o of a.outstanding) T(!held.has(o), `sheet ${sh.id} has ${o} both held and outstanding`);
  }
});
check('gates', 'no entity with an outstanding memo carries a design', () => {
  // An identity record - who exists, what they are called, which gate applies - is
  // not a design. A memo forbids the design, not the name.
  const blocked = new Set(read('memos').memos.filter((m) => m.state === 'outstanding').map((m) => m.entity));
  for (const e of read('entities').entities) {
    if (!blocked.has(e.id)) continue;
    T(!hasDesign(e), `entity ${e.id} carries a design but its memo is outstanding`);
  }
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
    // The operative part of a memo is what it BLOCKS. A thin rationale is a drafting
    // matter; a memo that blocks nothing is a gate that does not exist.
    const blocks = m.blocks ?? (m.reason ? ['design'] : null);
    T(Array.isArray(blocks) ? blocks.length > 0 : Boolean(blocks), `memo for ${m.entity} blocks nothing`);
    T(memoReason(m).length > 0, `memo for ${m.entity} states no reason or question at all`);
  }
});
check('gates', 'every memo names what it still allows', () => {
  // A gate that does not say what it permits will be read as blocking everything.
  for (const m of read('memos').memos.filter((x) => x.state === 'outstanding')) {
    const allows = m.allows ?? m.still_allowed;
    if (!allows) continue;   // optional, but if present it must be real
    T(Array.isArray(allows) && allows.length > 0, `memo for ${m.entity} has an empty allows list`);
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
check('world', 'arches, domes and marble are forbidden', () => {
  // Stated as lists or as a principle sentence. What matters is that all three are
  // named as wrong somewhere in the material world.
  const bad = forbiddenEverywhere();
  for (const x of ['arch', 'dome', 'marble']) T(bad.includes(x), `nothing in the material world forbids ${x}`);
});
check('world', 'cloth is draped, and sewn construction is forbidden', () => {
  T(materialSays('drape|unstitched|wrapped'), 'the material world never says cloth is draped');
  T(materialSays('tailor|sewn|stitched'), 'the material world never rules out sewn construction');
});
check('world', 'an entity that declares a garment declares it draped', () => {
  // Entities may hold identity records with no design at all; costume then belongs to
  // the studio's approved sheets.
  for (const e of read('entities').entities) {
    const c = e.design?.garment?.construction;
    if (!c) continue;
    T(/drape|unstitched|wrapped/i.test(c), `entity ${e.id} garment is not declared draped`);
  }
});
check('world', 'colourism is forbidden outright, somewhere binding', () => {
  // Either in the material world or in the skin policy - both are binding.
  const blob = (JSON.stringify(read('material_world')) + JSON.stringify(read('locks'))).toLowerCase();
  T(/lighten|lighter than/.test(blob), 'nothing forbids lightening skin');
  T(/fair[- ]equals[- ]good|fair.{0,12}good/.test(blob), 'nothing forbids fair-equals-good coding');
});
check('world', 'every NUMERIC skin lock is measurable and forbids lightening', () => {
  // Skin may be governed by numbers or by policy - skinGovernance checks that one of
  // the two holds. Where a lock carries numbers, they must be usable.
  for (const l of read('locks').locks.filter((x) => x.kind === 'skin_albedo' && x.value)) {
    T(/never lighten|never lighter/i.test(l.rule), `lock ${l.id} does not forbid lightening`);
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
check('world', 'ornament rests on a named visual vocabulary', () => {
  const libs = new Set([
    ...(read('evidence_libraries').libraries ?? []).flatMap((l) => [l.id, l.source]),
    ...read('source_register').sources.map((s) => s.id),
  ].filter(Boolean));
  const orn = read('material_world').ornament ?? {};
  const named = orn.vocabulary ?? orn.source ?? orn.reference;
  if (named) T(libs.has(named), `ornament vocabulary ${named} names no known source or library`);
  else T(/relief|amaravati|sanchi|bharhut|panel/i.test(JSON.stringify(orn)), 'ornament rests on no named visual vocabulary at all');
  for (const e of read('entities').entities) {
    const v = e.design?.ornament?.vocabulary;
    if (v) T(libs.has(v), `entity ${e.id} ornament names unknown vocabulary ${v}`);
  }
});

// ---------------------------------------------------------------- the grade
check('grade', 'the black point is low, and a lifted black is never crushed', () => {
  const g = gradeNumbers();
  T(typeof g.black_point_ire === 'number' && g.black_point_ire >= 0 && g.black_point_ire <= 8,
    `black point resolves to IRE ${g.black_point_ire}`);
  T(/lifted|never 0|never zero|not crushed/i.test(JSON.stringify(read('grade'))),
    'nothing says the black is lifted rather than crushed');
});
check('grade', 'shadows run warm and never blue', () => {
  const g = gradeNumbers();
  T(g.shadow_tint.direction === 'warm', 'shadow tint is not warm');
  const blob = JSON.stringify(read('grade')).toLowerCase();
  T(/never blue|not blue|no blue|warm/.test(blob), 'nothing rules out a blue shadow');
});
check('grade', 'the shadow tint curve rejoins the diagonal before skin', () => {
  // A three-point tint curve stays above the diagonal through the midtones and
  // lightens every face. Whether the number comes from the graph or from the studio,
  // it must land outside the skin band.
  const st = gradeNumbers().shadow_tint;
  T(typeof st.pivot === 'number' && typeof st.rejoin === 'number', 'the tint curve has no pivot/rejoin');
  T(st.rejoin >= 0.55, `rejoin ${st.rejoin} sits inside the skin band and would lighten every face`);
  T(st.pivot < st.rejoin, 'the pivot is not below the rejoin');
});
check('grade', 'skin is protected by a qualifier, two-sided', () => {
  const q = gradeNumbers().skin_qualifier;
  T(q.enabled !== false, 'the skin qualifier is disabled');
  T(q.protection === 'hold', 'the skin qualifier no longer holds');
  T(typeof q.hold_black === 'number', 'the skin hold has no value');
});
check('grade', 'grain is applied before the subtitle burn', () => {
  const blob = JSON.stringify(read('grade')) + JSON.stringify(gradeNumbers().grain);
  T(/before the subtitle|before captions|before the burn|after the grade/i.test(blob),
    'nothing states grain order - a caption sitting in grain is a defect');
});
check('grade', 'a grade derived from prose records where its numbers came from', () => {
  const g = gradeNumbers();
  if (!g._derived) return;
  T(g._from && g._from.length > 20, 'the derived grade does not record its provenance');
});

// ---------------------------------------------------------------- typography
check('type', 'the frame is declared and is vertical', () => {
  const f = frame();
  T(f.width > 0 && f.height > f.width, `frame ${f.width}x${f.height} is not vertical`);
  T(f.fps > 0, 'no fps could be resolved from typography or any treatment');
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
  const latinEntry = Object.entries(s).find(([l, x]) => isLatinScript(l, x));
  if (!latinEntry) return;
  const latin = latinEntry[1];
  for (const [l, x] of Object.entries(s)) {
    if (isLatinScript(l, x)) continue;
    T(x.line_box_px > latin.line_box_px, `${l} (${x.script}) has no more line box than Latin, and it stacks`);
  }
});
check('type', 'every non-Latin script carries conjunct probes on a base', () => {
  for (const [l, s] of Object.entries(read('typography').scripts)) {
    if (isLatinScript(l, s)) continue;
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
check('treatment', 'every reuse and crop resolves, in this film or an earlier one', () => {
  // reuse_of / crop_of point inside this film. continues_from points at a frame from
  // an EARLIER film - that is how the continuous joins are expressed - so a shot may
  // legitimately carry source=reuse with reuse_of null and continues_from set.
  const allShots = new Map();
  for (const { film, t } of directed()) for (const s of t.shots) allShots.set(`${film.id}/${s.id}`, s);
  for (const { film, t } of directed()) {
    const ids = new Set(t.shots.map((s) => s.id));
    for (const s of t.shots) {
      const inFilm = s.reuse_of ?? s.crop_of;
      if (inFilm != null) {
        T(ids.has(inFilm), `${film.id} shot ${s.id} ${s.source}s unknown ${inFilm}`);
        continue;
      }
      if (s.source === 'reuse' || s.source === 'crop') {
        T(s.continues_from != null,
          `${film.id} shot ${s.id} is source=${s.source} but names neither a shot in this film nor a frame it continues from`);
      }
    }
  }
});
check('treatment', 'every continues_from names a frame from an earlier film', () => {
  const order = new Map(read('films').films.map((f, i) => [f.id, f.n ?? f.order ?? i]));
  for (const { film, t } of directed()) {
    for (const s of t.shots) {
      const cf = s.continues_from;
      if (cf == null) continue;
      const ref = typeof cf === 'string' ? cf : (cf.film ? `${cf.film}/${cf.shot}` : null);
      T(ref, `${film.id} shot ${s.id} has an unreadable continues_from`);
      const m = String(ref).match(/^(M\d+)[\/ ]/);
      if (m) T(order.get(m[1]) <= order.get(film.id), `${film.id} shot ${s.id} continues from ${m[1]}, which is not earlier`);
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

// ---------------------------------------------------------------- prompts
check('prompt', 'no assembled prompt contradicts its own negative list', () => {
  // The package shipped a prompt reading "the edge of a sleeve" whose own negatives
  // said "no stitched garment". A model given both draws the sleeve. This catches the
  // whole class, not just that one shot.
  const offenders = [];
  for (const { film, t } of directed()) {
    for (const shot of t.shots) {
      if (shot.source !== 'generate') continue;
      let a;
      try { a = assemble(shot, film.id); } catch { continue; }   // gate refusals are not this check's business
      for (const neg of a.negatives) {
        const word = neg.trim().toLowerCase();
        if (word.length < 4) continue;
        const hit = asserted(a.prompt, word);
        if (hit) offenders.push(`${film.id} ${shot.id}: prompt asserts "${word}" while its own negatives forbid it - "${hit}"`);
      }
    }
  }
  T(offenders.length === 0, offenders.slice(0, 6).join('; '));
});
check('prompt', 'no prompt describes cloth that is stitched', () => {
  const sewn = ['sleeve', 'sleeves', 'blouse', 'shirt', 'coat', 'trousers', 'buttons', 'lapel'];
  const offenders = [];
  for (const { film, t } of directed()) {
    for (const shot of t.shots) {
      if (shot.source !== 'generate') continue;
      let a;
      try { a = assemble(shot, film.id); } catch { continue; }
      for (const w of sewn) {
        const hit = asserted(a.prompt, w);
        if (hit) offenders.push(`${film.id} ${shot.id}: "${w}" in "${hit}"`);
      }
    }
  }
  T(offenders.length === 0, `cloth described as stitched: ${offenders.join(', ')}`);
});
check('prompt', 'every direction override declares a reason and changes no truth', () => {
  const o = directionOverrides();
  for (const kind of ['prompt_overrides', 'action_overrides']) {
    for (const x of o[kind] ?? []) {
      T(x.shot && x.find && x.replace !== undefined, `an override in ${kind} is incomplete`);
      T(x.reason && x.reason.length > 20, `override for ${x.shot} states no reason`);
      T(x.changes_truth === false, `override for ${x.shot} does not declare changes_truth: false - direction may never change what is true`);
      T(x.class === 'creative', `override for ${x.shot} is classed ${x.class}, not creative`);
    }
  }
});
check('prompt', 'every direction override still finds its target', () => {
  // A package version bump could make an override a silent no-op. Better to fail.
  for (const x of directionOverrides().prompt_overrides ?? []) {
    const t = treatment(x.film);
    if (!t) continue;
    const shot = t.shots.find((s) => s.id === x.shot);
    T(shot, `override names shot ${x.shot}, which is not in ${x.film}`);
    const raw = shot.image_prompt ?? '';
    const hits = [x.find, ...(x.also_find ?? [])].some((f) => raw.includes(f));
    T(hits || raw.includes(x.replace), `override for ${x.shot} matches nothing - the package may have changed and the override is now a silent no-op`);
  }
});

// ---------------------------------------------------------------- model sheets
check('sheets', 'every design decision is recorded, classed and reasoned', () => {
  const d = sheetDecisions();
  T(d.decided_on && d.decided_by, 'the decisions record no date or decider');
  T(d.decisions.length >= 4, `expected at least four decisions, found ${d.decisions.length}`);
  for (const x of d.decisions) {
    T(x.id && x.subject && x.chosen, `a decision is incomplete: ${x.id ?? '(no id)'}`);
    if (x.subject !== 'PROCESS') T(x.class === 'S', `decision ${x.id} is classed ${x.class}, not S - a design choice is ours, never the text's`);
  }
});
check('sheets', 'a complexion chosen from tradition is declared as ours, never as the text', () => {
  for (const x of sheetDecisions().decisions.filter((y) => /complexion/i.test(y.question ?? ''))) {
    T(x.class === 'S', `complexion decision ${x.id} is classed ${x.class} - a tradition informs a staging choice and is never promoted to Text`);
    const blob = JSON.stringify(x).toLowerCase();
    T(/never presented as|ours|our choice/.test(blob), `complexion decision ${x.id} is not declared as ours`);
  }
});
check('sheets', 'no sheet brief or prompt presents a complexion as the source\'s', () => {
  const bad = /(the (text|source) (says|mandates|establishes)[^.]{0,40}(complexion|colour|skin))|((complexion|colour) (is )?(mandated|established) by the (text|source))/i;
  T(!bad.test(JSON.stringify(sheetBriefs())), 'a sheet brief presents a complexion as the source\'s');
  for (const id of sheetOrder()) {
    for (const slot of ['front', 'three_quarter', 'profile', 'in_world']) {
      T(!bad.test(viewPrompt(id, slot).prompt), `${id} ${slot} prompt presents a complexion as the source's`);
    }
  }
});
check('sheets', 'no principal is made lighter than another', () => {
  // The colourism rule, at the point it would actually be broken: the sheet prompt.
  const blob = JSON.stringify(sheetBriefs()) + sheetOrder().map((id) => viewPrompt(id, 'front').prompt).join(' ');
  const bad = /\b(lighter|fairer|paler)\s+(than|skin than|complexion than)\b/i;
  const m = blob.match(bad);
  T(!m || /never|not|no\s/i.test(blob.slice(Math.max(0, blob.indexOf(m[0]) - 30), blob.indexOf(m[0]))),
    `a sheet brief makes one principal lighter than another: "${m?.[0]}"`);
});
check('sheets', 'the brothers share a complexion range, per the recorded decision', () => {
  const dd3 = sheetDecisions().decisions.find((x) => x.subject === 'LAKSHMANA');
  T(dd3, 'no decision is recorded for how Lakshmana is distinguished from Rama');
  const c = sheetBriefs().characters.find((x) => x.id === 'LAKSHMANA');
  T(c, 'no sheet brief for LAKSHMANA');
  T(/same range|same complexion/i.test(c.complexion + ' ' + (c.complexion_declaration ?? '')),
    'the Lakshmana brief no longer puts him in the same complexion range as Rama');
  T(/build and hair/i.test(c.distinct_from?.how ?? ''), 'Lakshmana is no longer distinguished by build and hair');
  T((c.never ?? []).some((n) => /lighter/i.test(n)), 'the Lakshmana brief no longer forbids lighter skin than Rama');
});
check('sheets', 'every sheet prompt carries the mandatory cloth line and a negative', () => {
  const line = sheetBriefs()._universal.mandatory_line;
  T(line && /no stitched garment/i.test(line), 'the mandatory cloth line is missing from the universal spec');
  for (const id of sheetOrder()) {
    for (const slot of ['front', 'three_quarter', 'profile', 'in_world']) {
      const v = viewPrompt(id, slot);
      T(v.prompt.includes(line), `${id} ${slot} prompt is missing the mandatory cloth line`);
      T(v.negative && v.negative.length > 40, `${id} ${slot} prompt carries no negative`);
    }
  }
});
check('sheets', 'no sheet prompt contradicts its own negative list', () => {
  const offenders = [];
  for (const id of sheetOrder()) {
    for (const slot of ['front', 'three_quarter', 'profile', 'in_world']) {
      const v = viewPrompt(id, slot);
      for (const neg of v.negative.split(/,\s*/)) {
        const word = neg.trim().toLowerCase();
        if (word.length < 5) continue;
        const hit = asserted(v.prompt, word);
        if (hit) offenders.push(`${id}/${slot}: "${word}" in "${hit}"`);
      }
    }
  }
  T(offenders.length === 0, offenders.slice(0, 4).join('; '));
});
check('sheets', 'a character whose face is withheld never gets a face prompt', () => {
  for (const c of sheetBriefs().characters.filter((x) => x.face_withheld)) {
    for (const slot of ['front', 'three_quarter', 'profile', 'in_world']) {
      const p = viewPrompt(c.id, slot).prompt;
      T(/FACE NOT SHOWN|face is never shown|hands only/i.test(p), `${c.id} ${slot} prompt does not withhold the face`);
    }
  }
});
check('sheets', 'the sheet order starts with the character the arc leans on', () => {
  const first = sheetOrder()[0];
  const c = sheetBriefs().characters.find((x) => x.id === first);
  T(c.why_first, `${first} is generated first but the brief does not say why`);
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
check('motion', 'every effects shot resolves to a film that exists', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const [id, s] of Object.entries(effectsShots())) {
    T(s.film && f.has(s.film), `effects shot ${id} resolves to no known film (${s.film})`);
  }
});
check('motion', 'every effects shot exists in its treatment', () => {
  for (const [id, s] of Object.entries(effectsShots())) {
    const t = treatment(s.film);
    if (!t) continue;
    T(t.shots.some((x) => x.id === id), `effects names shot ${id}, which is not in ${s.film}`);
  }
});
check('motion', 'a no-motion instruction always matches a motion:false flag', () => {
  for (const [id, s] of Object.entries(effectsShots())) {
    if (/NO MOTION/i.test(s.instruction)) T(s.motion === false, `shot ${id} says NO MOTION but motion is ${s.motion}`);
    if (s.motion === false) T(/NO MOTION/i.test(s.instruction), `shot ${id} is flagged motion:false but its instruction does not say NO MOTION`);
  }
});
check('motion', 'all five rejection criteria are stated', () => {
  // Stated as ids or as plain sentences; what matters is that all five are there.
  const blob = rejectionCriteria().map((c) => `${c.id} ${c.test} ${c.rule}`).join(' | ').toLowerCase();
  const need = {
    'camera moves': /camera moves|camera-moved|camera move/,
    'expression changes': /expression/,
    'body shifts': /body (shifts|moves)|posture/,
    'frame entry or exit': /enters or leaves|entry|exit/,
    'visible loop': /loop/,
  };
  for (const [name, re] of Object.entries(need)) T(re.test(blob), `no rejection criterion covers ${name}`);
});
check('motion', 'a camera-locked shot never has an instruction that moves the camera', () => {
  for (const [id, s] of Object.entries(effectsShots())) {
    if (s.motion && s.camera_locked) T(!/camera (move|pan|push|drift|track)/i.test(s.instruction), `shot ${id} is camera-locked but its instruction moves the camera`);
  }
});

// ---------------------------------------------------------------- joins
check('joins', 'every declared join names films that exist', () => {
  const f = new Set(read('films').films.map((x) => x.id));
  for (const j of normJoins()) T(f.has(j.from) && f.has(j.to), `join ${j.from}->${j.to} names an unknown film`);
});
check('joins', 'any arc that declares continuous joins agrees with the transitions', () => {
  const tr = normJoins().filter((j) => j.kind === 'continuous').map((j) => `${j.from}->${j.to}`).sort();
  for (const arc of read('films').arcs ?? []) {
    if (!arc.continuous_joins) continue;   // an arc need not restate the joins
    const a = arc.continuous_joins.map((j) => `${j.from}->${j.to}`).sort();
    T(JSON.stringify(a) === JSON.stringify(tr), `arc ${arc.id} joins do not match transitions`);
  }
});
check('joins', 'every continuous join carries room tone and a shared frame', () => {
  for (const j of normJoins().filter((x) => x.kind === 'continuous')) {
    T(j.room_tone === 'carry', `join ${j.from}->${j.to} does not carry room tone`);
    T(j.shared_frame === true, `join ${j.from}->${j.to} does not share a frame`);
  }
});
check('joins', 'room tone says it is not reseated across a continuous join', () => {
  const rt = roomTone();
  T(/not reseated|same file|carry|continuous/i.test(JSON.stringify(rt)), 'room tone states no continuity rule');
});
check('joins', 'the continuous joins form an unbroken chain', () => {
  const j = normJoins().filter((x) => x.kind === 'continuous');
  for (let i = 1; i < j.length; i++) T(j[i].from === j[i - 1].to, `chain breaks between ${j[i - 1].to} and ${j[i].from}`);
});

// ---------------------------------------------------------------- music
check('music', 'the music provider is none', () => T(read('music').provider === 'none', 'music provider is not none'));
check('music', 'music is a brief, not a generated asset', () => {
  const m = read('music');
  T(m.brief && typeof m.brief === 'object', 'music.json carries no brief');
  const blob = JSON.stringify(m);
  T(/composer|composed by a person|no api|not generated|human/i.test(blob),
    'nothing in music.json says the theme is written by a person');
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

check('render', 'a graph that mandates reference-conditioning is served by a studio that can do it', () => {
  // Only fires if the graph says so. A graph with no render_policy.json - the bundled
  // fixture has none - is unconstrained, and that is not a failure.
  const pol = identityPolicy();
  if (!pol.reference_conditioned) return;
  T(typeof fal.imageFromReference === 'function',
    'render_policy.identity says reference-conditioned, and the provider has no route that sends a reference');
  T(typeof fal.buildReferencePayload === 'function',
    'the reference payload cannot be inspected, so nothing can prove the sheet is sent rather than assembled and dropped');
  const refConditioned = referenceConditioned();
  T(refConditioned.length > 0, 'no reference-conditioned endpoint is registered in lib/endpoints.js');
});

check('render', 'the reference actually reaches the payload', () => {
  const pol = identityPolicy();
  if (!pol.reference_conditioned) return;
  for (const ep of referenceConditioned()) {
    const payload = fal.buildReferencePayload({ prompt: 'p', references: ['REF-ONE'], endpoint: ep });
    const sent = JSON.stringify(payload);
    T(sent.includes('REF-ONE'), `${ep}: the reference was given and does not appear in the payload`);
  }
});

check('render', 'a text-to-image endpoint refuses a reference rather than dropping it', () => {
  // fal accepts unknown fields and ignores them. Sending image_url to flux-pro would
  // return 200 and a text-only picture, which is the failure this check exists for.
  for (const ep of textToImage()) {
    let threw = false;
    try { fal.buildReferencePayload({ prompt: 'p', references: ['REF'], endpoint: ep }); }
    catch { threw = true; }
    T(threw, `${ep} is text-to-image and accepted a reference silently`);
  }
});

check('render', 'every registered endpoint has a price and says whether it is a guess', () => {
  for (const [ep, d] of Object.entries(ENDPOINTS)) {
    T(typeof d.usd === 'number' && d.usd > 0, `${ep} has no price`);
    T(typeof d.estimated === 'boolean', `${ep} does not say whether its price was confirmed`);
    const priced = endpointCost(ep);
    T(priced.usd > 0, `${ep} prices at zero through cost.js`);
  }
});

check('render', 'a render record separates what was sent from what merely exists', () => {
  // conditioned_on is the claim that the sheet travelled. references is the claim that
  // a sheet record exists. Collapsing them is how a text-only render was recorded as
  // reference-conditioned for the whole of arc 7's preparation.
  const src = text('lib/render.js');
  T(/conditioned_on/.test(src), 'the render record does not record what was actually sent');
  T(/text_only/.test(src), 'the render record does not say when a still was generated text-only');
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

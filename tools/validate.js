#!/usr/bin/env node
// validate - offline, no key, no spend. Every check here defends a stated invariant.
// Never weaken a check to pass. If an invariant genuinely changed, update the check
// and add a blocked case beside the allowed one.
import { read, treatment, ROOT } from '../lib/store.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const checks = [];
const check = (area, name, fn) => checks.push({ area, name, fn });
const T = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---------------------------------------------------------------- data integrity
check('data', 'every data file parses', () => {
  const files = readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('.json'));
  T(files.length >= 20, `expected at least 20 data files, found ${files.length}`);
  for (const f of files) read(f.replace(/\.json$/, ''), { fresh: true });
});
check('data', 'films have unique ids', () => {
  const ids = read('films').films.map((f) => f.id);
  T(new Set(ids).size === ids.length, 'duplicate film id');
});
check('data', 'films have unique story ids', () => {
  const ids = read('films').films.map((f) => f.story_id);
  T(new Set(ids).size === ids.length, 'duplicate story_id');
});
check('data', 'every film names a kanda that exists', () => {
  const kandas = new Set(read('kandas').kandas.map((k) => k.id));
  for (const f of read('films').films) T(kandas.has(f.kanda), `film ${f.id} names unknown kanda ${f.kanda}`);
});
check('data', 'claim ids are unique', () => {
  const ids = read('claims').claims.map((c) => c.id);
  T(new Set(ids).size === ids.length, 'duplicate claim id');
});
check('data', 'every claim names a film that exists or none', () => {
  const films = new Set(read('films').films.map((f) => f.id));
  for (const c of read('claims').claims) T(c.film === null || films.has(c.film), `claim ${c.id} names unknown film ${c.film}`);
});
check('data', 'every entity has a skin albedo lock that exists', () => {
  const locks = new Set(read('locks').locks.map((l) => l.id));
  for (const e of read('entities').entities) {
    T(e.design.skin_albedo, `entity ${e.id} has no skin_albedo`);
    T(locks.has(e.design.skin_albedo), `entity ${e.id} names unknown lock ${e.design.skin_albedo}`);
  }
});
check('data', 'every lock naming an entity names one that exists', () => {
  const ents = new Set(read('entities').entities.map((e) => e.id));
  for (const l of read('locks').locks) T(l.entity === null || ents.has(l.entity), `lock ${l.id} names unknown entity ${l.entity}`);
});
check('data', 'every episode names a kanda that exists', () => {
  const kandas = new Set(read('kandas').kandas.map((k) => k.id));
  for (const e of read('episodes').episodes) T(kandas.has(e.kanda), `episode ${e.id} names unknown kanda`);
});
check('data', 'every thread names films that exist', () => {
  const films = new Set(read('films').films.map((f) => f.id));
  for (const t of read('threads').threads) for (const f of t.films) T(films.has(f), `thread ${t.id} names unknown film ${f}`);
});

// ---------------------------------------------------------------- evidence classes
check('evidence', 'evidence classes are only T, Tr, I or S', () => {
  const ok = new Set(['T', 'Tr', 'I', 'S']);
  for (const c of read('claims').claims) T(ok.has(c.evidence_class), `claim ${c.id} has class ${c.evidence_class}`);
});
check('evidence', 'claim states are only proposed, accepted, disputed or unresolved', () => {
  const ok = new Set(['proposed', 'accepted', 'disputed', 'unresolved']);
  for (const c of read('claims').claims) T(ok.has(c.state), `claim ${c.id} has state ${c.state}`);
});
check('evidence', 'no tradition claim is classed as Text', () => {
  for (const c of read('claims').claims) {
    if (c.tradition) T(c.evidence_class === 'Tr', `claim ${c.id} cites a tradition but is classed ${c.evidence_class} - a tradition is never promoted to Text`);
  }
});
check('evidence', 'every Tr claim names its tradition', () => {
  for (const c of read('claims').claims.filter((x) => x.evidence_class === 'Tr')) {
    T(typeof c.tradition === 'string' && c.tradition.length > 0, `Tr claim ${c.id} does not name a tradition`);
  }
});
check('evidence', 'every inference names what it is inferred from', () => {
  for (const c of read('claims').claims.filter((x) => x.evidence_class === 'I')) {
    T(c.inferred_from, `inference ${c.id} does not name inferred_from`);
    T(c.inference_basis, `inference ${c.id} has no inference_basis`);
  }
});
check('evidence', '"period-appropriate" is never an inference basis', () => {
  for (const c of read('claims').claims.filter((x) => x.evidence_class === 'I')) {
    T(!/period[- ]appropriate/i.test(c.inference_basis), `inference ${c.id} uses "period-appropriate" as a source - it is not one`);
  }
});
check('evidence', 'an inference basis names a date or a specific holding, not just a region', () => {
  for (const c of read('claims').claims.filter((x) => x.evidence_class === 'I')) {
    T(/\d/.test(c.inference_basis), `inference ${c.id} basis names no date or specific holding`);
  }
});
check('evidence', 'every S claim declares itself as ours', () => {
  for (const c of read('claims').claims.filter((x) => x.evidence_class === 'S')) {
    T(c.staging_note, `staging claim ${c.id} has no staging_note declaring it as ours`);
    T(c.locator === null, `staging claim ${c.id} carries a text locator - staging is never sourced to the text`);
  }
});
check('evidence', 'every T claim carries a locator', () => {
  for (const c of read('claims').claims.filter((x) => x.evidence_class === 'T')) {
    T(c.locator && c.locator.sarga, `text claim ${c.id} has no locator`);
  }
});
check('evidence', 'every accepted claim carries a verification record', () => {
  for (const c of read('claims').claims.filter((x) => x.state === 'accepted')) {
    T(c.verification, `accepted claim ${c.id} has no verification record`);
    T(['ai-passage-check', 'human'].includes(c.verification.method), `accepted claim ${c.id} was accepted by method "${c.verification.method}" - only ai-passage-check or human may accept`);
    T(c.verification.basis && c.verification.basis.length > 10, `accepted claim ${c.id} has no stated basis`);
    T(c.verification.attested_at, `accepted claim ${c.id} records no attestation date`);
  }
});
check('evidence', 'verification records state whether a text was consulted', () => {
  for (const c of read('claims').claims.filter((x) => x.state === 'accepted')) {
    T(typeof c.verification.text_consulted === 'boolean', `accepted claim ${c.id} does not say whether a text was consulted`);
  }
});
check('evidence', 'no proposed claim carries a completed verification', () => {
  for (const c of read('claims').claims.filter((x) => x.state === 'proposed')) {
    T(c.verification.method === 'none', `proposed claim ${c.id} carries method "${c.verification.method}" - if it was verified it should have been disposed`);
  }
});
check('evidence', 'no copy anywhere implies human review for an AI-accepted claim', () => {
  const bad = /\b(reviewed by (a )?(scholar|expert|pandit)|scholarly review|peer[- ]reviewed|verified by (a )?(scholar|expert)|authenticated)\b/i;
  for (const name of ['claims', 'app_design', 'films']) {
    const blob = JSON.stringify(read(name));
    T(!bad.test(blob), `data/${name}.json contains copy implying human or scholarly review`);
  }
});
check('evidence', 'the project claims nothing about being authentic or definitive', () => {
  const bad = /\b(authentic|definitive|faithful to the original|scholarly|the true)\b/i;
  for (const name of ['app_design', 'films', 'music', 'narrator']) {
    const blob = JSON.stringify(read(name));
    T(!bad.test(blob), `data/${name}.json claims authenticity or definitiveness`);
  }
});

// ---------------------------------------------------------------- speaker attribution
check('attribution', 'every speech-act claim names its speaker', () => {
  for (const c of read('claims').claims.filter((x) => x.speech_act)) {
    T(c.speaker, `speech-act claim ${c.id} has no speaker`);
  }
});
check('attribution', 'the not-yet-sixteen claim is attributed to Dasaratha', () => {
  const c = read('claims').claims.find((x) => x.id === 'CLM.BALA.20.NOT-YET-SIXTEEN');
  T(c, 'the not-yet-sixteen claim is missing');
  T(c.speaker === 'DASARATHA', 'not-yet-sixteen must be Dasaratha\'s statement');
  T(c.speech_act === true, 'not-yet-sixteen must be marked as a speech act');
  T(c.attribution_note, 'not-yet-sixteen must carry an attribution note');
});
check('attribution', 'narration lines carrying a speaker say so', () => {
  const t = treatment('M3');
  for (const [id, n] of Object.entries(t.narration)) {
    if (n.speaker) T(n.speaker_rule, `narration ${id} names a speaker but states no attribution rule`);
  }
});
check('attribution', 'the not-yet-sixteen narration line attributes in every language', () => {
  const n = treatment('M3').narration.L4;
  T(/\bhe said\b/i.test(n.en), 'the English line drops the attribution');
  T(/उसने कहा|कहा/.test(n.hi), 'the Hindi line drops the attribution');
  T(/అన్నాడు|అంటూ/.test(n.te), 'the Telugu line drops the attribution');
});

// ---------------------------------------------------------------- rights
check('rights', 'every restricted source is flagged text_may_travel false', () => {
  for (const s of read('source_register').sources.filter((x) => x.restricted)) {
    T(s.text_may_travel === false, `restricted source ${s.id} allows text to travel`);
  }
});
check('rights', 'the GRETIL source is marked restricted', () => {
  const s = read('source_register').sources.find((x) => x.id === 'SRC.GRETIL.VR');
  T(s && s.restricted === true, 'GRETIL must be marked restricted');
  T(/CC BY-NC-SA/.test(s.licence), 'GRETIL licence must be recorded');
});
check('rights', 'no passage record holds text', () => {
  for (const p of read('passages').passages) T(p.text_held === false, `passage ${p.id} holds text - locators travel, text does not`);
});
check('rights', 'no passage record carries a verse text field', () => {
  for (const p of read('passages').passages) {
    for (const k of ['text', 'verse', 'verse_text', 'sanskrit']) {
      T(p[k] === undefined, `passage ${p.id} carries a ${k} field`);
    }
  }
});
check('rights', 'no restricted verse text sits in any data file', () => {
  for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.json'))) {
    const blob = JSON.stringify(read(f.replace(/\.json$/, '')));
    // A long unbroken Devanagari run in a data file is verse text, not a name or a title.
    const runs = blob.match(/[ऀ-ॿ\s]{60,}/g) ?? [];
    T(runs.length === 0, `data/${f} holds a long Devanagari run - possible restricted verse text`);
  }
});
check('rights', 'the corpus holds no restricted text on disk', () => {
  const dir = join(ROOT, 'corpus');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    T(!/\.(txt|xml|tei)$/i.test(f), `corpus/${f} looks like an ingested text file - restricted text must not be stored`);
  }
});

// ---------------------------------------------------------------- gates
check('gates', 'no sheet is approved without a named approver', () => {
  for (const s of read('sheets').sheets) {
    if (s.approved) T(s.approved_by, `sheet ${s.id} is approved with no approver named`);
  }
});
check('gates', 'no sheet is approved without files', () => {
  for (const s of read('sheets').sheets) {
    if (s.approved) T(s.files.length > 0, `sheet ${s.id} is approved with no files`);
  }
});
check('gates', 'every sheet has one hash per file', () => {
  for (const s of read('sheets').sheets) T(s.files.length === s.hashes.length, `sheet ${s.id} has ${s.files.length} files and ${s.hashes.length} hashes`);
});
check('gates', 'the twenty-frame spec still describes four axes, not twenty generations', () => {
  const spec = read('sheets')._twenty_frame_spec;
  T(spec, 'the twenty-frame spec has been deleted');
  const axes = Object.keys(spec.axes);
  T(axes.length === 4, `expected four axes, found ${axes.length}`);
  for (const a of ['angle', 'lighting', 'distance', 'expression']) T(axes.includes(a), `axis ${a} is missing`);
  T(/NOT a requirement for twenty paid generations/i.test(spec.what_it_is), 'the spec no longer says it is not twenty paid generations');
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
check('gates', 'the upload spec names the four slots and says upload never approves', () => {
  const u = read('sheets')._upload_spec;
  T(u, 'the upload spec has been deleted');
  T(JSON.stringify(u.slots) === JSON.stringify(['front', 'three_quarter', 'profile', 'in_world']), `slots are ${u.slots.join(',')}`);
  T(u.axis_satisfied_by_full_four_view === 'angle', 'a four-view sheet no longer maps to the angle axis alone');
  T(/never approves/i.test(u.note), 'the spec no longer says upload never approves');
});
check('gates', 'no sheet has been approved by a process rather than a person', () => {
  for (const s of read('sheets').sheets) {
    if (s.approved_by) T(!/^(system|auto|process|script|ci|bot)$/i.test(s.approved_by.trim()), `sheet ${s.id} is approved by "${s.approved_by}", which is not a person`);
  }
});
check('gates', 'every memo-blocked entity is listed', () => {
  const need = ['TATAKA', 'RAVANA', 'SURPANAKHA', 'MANTHARA', 'AHALYA', 'SITA', 'VANARAS', 'LANKA', 'ASTRAS', 'FIGURE-FROM-THE-FIRE'];
  const have = new Set(read('memos').memos.map((m) => m.entity));
  for (const n of need) T(have.has(n), `memo for ${n} is missing`);
});
check('gates', 'no memo-blocked entity has a design record', () => {
  const blocked = new Set(read('memos').memos.filter((m) => m.state === 'outstanding').map((m) => m.entity));
  for (const e of read('entities').entities) T(!blocked.has(e.id), `entity ${e.id} has a design record but its memo is outstanding`);
});
check('gates', 'no memo-blocked entity appears in any shot', () => {
  const blocked = new Set(read('memos').memos.filter((m) => m.state === 'outstanding').map((m) => m.entity));
  for (const f of read('films').films) {
    const t = treatment(f.id);
    if (!t) continue;
    for (const s of t.shots) for (const e of s.entities ?? []) T(!blocked.has(e), `shot ${s.id} of ${f.id} stages memo-blocked ${e}`);
  }
});
check('gates', 'Rama is blocked from CLAIMING a complexion, not from being depicted', () => {
  const r = read('entities').entities.find((e) => e.id === 'RAMA');
  T(r.design.complexion_claim.state === 'not-established', 'Rama complexion claim state changed');
  T(/may be shown|does not block depicting/i.test(r.design.complexion_claim.note), 'the note no longer says he may still be depicted');
  T(r.appears_in.length > 0, 'Rama appears in no film - the gate has been misread as blocking depiction');
});

// ---------------------------------------------------------------- the material world
check('world', 'no arch, dome or marble is allowed anywhere', () => {
  const mw = read('material_world');
  for (const bad of ['arch', 'dome', 'marble']) {
    T(mw.architecture.forbidden.some((f) => f.includes(bad)), `${bad} is not in the forbidden list`);
    T(!mw.architecture.allowed.some((a) => a.includes(bad)), `${bad} appears in the allowed list`);
  }
});
check('world', 'cloth is draped and never tailored', () => {
  const c = read('material_world').cloth;
  T(c.construction.includes('unstitched') || c.construction.includes('draped'), 'cloth construction is no longer draped');
  for (const bad of ['tailored', 'sewn']) T(c.forbidden.includes(bad), `${bad} is not forbidden`);
});
check('world', 'every entity garment is declared draped, never tailored', () => {
  for (const e of read('entities').entities) {
    const g = e.design.garment.construction.toLowerCase();
    T(g.includes('drape'), `entity ${e.id} garment is not declared draped`);
    T(!/\btailored\b(?!,| never| not)/.test(g.replace(/never tailored|not tailored/g, '')), `entity ${e.id} garment reads as tailored`);
  }
});
check('world', 'colourism is forbidden outright', () => {
  const f = read('material_world').forbidden_globally.colourism;
  T(f.some((x) => /lighten/i.test(x)), 'lightened skin is not forbidden');
  T(f.some((x) => /fair.equals.good/i.test(x)), 'fair-equals-good coding is not forbidden');
});
check('world', 'every skin lock says never lighten', () => {
  for (const l of read('locks').locks.filter((x) => x.kind === 'skin_albedo')) {
    T(/never lighten/i.test(l.rule), `lock ${l.id} does not forbid lightening`);
    T(typeof l.value.lab_L === 'number' && typeof l.value.tolerance_L === 'number', `lock ${l.id} has no measurable albedo`);
  }
});
check('world', 'ornament comes from the relief vocabulary', () => {
  const libs = new Set(read('evidence_libraries').libraries.map((l) => l.source));
  T(libs.has(read('material_world').ornament.vocabulary), 'ornament vocabulary names no known source');
  for (const e of read('entities').entities) {
    T(libs.has(e.design.ornament.vocabulary), `entity ${e.id} ornament names unknown vocabulary`);
  }
});

// ---------------------------------------------------------------- the grade
check('grade', 'black point sits at IRE 3', () => T(read('grade').black_point_ire === 3, 'black point moved'));
check('grade', 'shadows run warm and never blue', () => {
  const g = read('grade');
  T(g.shadow_tint.direction === 'warm', 'shadow tint is not warm');
  T(/never blue/i.test(g.shadow_tint.rule), 'the never-blue rule is gone');
  T(g.forbidden.some((x) => /blue/i.test(x)), 'blue shadows are not forbidden');
});
check('grade', 'skin is protected by a qualifier', () => {
  const q = read('grade').skin_qualifier;
  T(q.enabled === true, 'the skin qualifier is disabled');
  T(q.protection === 'hold', 'the skin qualifier no longer holds');
  T(/lab_L|skin lock/i.test(q.rule), 'the qualifier no longer defers to the skin locks');
});
check('grade', 'grain is applied before the subtitle burn', () => {
  T(/before the subtitle/i.test(read('grade').grain.note), 'grain order note changed - a caption sitting in grain is a defect');
});

// ---------------------------------------------------------------- typography
check('type', 'all three scripts have per-script metrics', () => {
  const s = read('typography').scripts;
  for (const l of ['en', 'hi', 'te']) T(s[l], `no metrics for ${l}`);
});
check('type', 'Latin is 44px at 1.30', () => {
  const s = read('typography').scripts.en;
  T(s.size_px === 44 && s.line_height === 1.30, `Latin metrics are ${s.size_px}/${s.line_height}`);
});
check('type', 'Devanagari is 46px at 1.55', () => {
  const s = read('typography').scripts.hi;
  T(s.size_px === 46 && s.line_height === 1.55, `Devanagari metrics are ${s.size_px}/${s.line_height}`);
});
check('type', 'Telugu is 48px at 1.70', () => {
  const s = read('typography').scripts.te;
  T(s.size_px === 48 && s.line_height === 1.70, `Telugu metrics are ${s.size_px}/${s.line_height}`);
});
check('type', 'the tall scripts get more line box than Latin', () => {
  const s = read('typography').scripts;
  T(s.hi.line_box_px > s.en.line_box_px, 'Devanagari line box is not taller than Latin');
  T(s.te.line_box_px > s.hi.line_box_px, 'Telugu line box is not taller than Devanagari');
});
check('type', 'the line box fits the size times the line height', () => {
  for (const [l, s] of Object.entries(read('typography').scripts)) {
    T(s.line_box_px >= Math.ceil(s.size_px * s.line_height) - 1, `${l} line box ${s.line_box_px} is smaller than ${s.size_px}x${s.line_height}`);
  }
});
check('type', 'the tall scripts carry conjunct probes', () => {
  for (const l of ['hi', 'te']) {
    const p = read('typography').scripts[l].conjunct_probe;
    T(Array.isArray(p) && p.length >= 3, `${l} has fewer than three conjunct probes`);
  }
});
check('type', 'the frame is 1080x1920 at 30fps', () => {
  const f = read('typography').frame;
  T(f.width === 1080 && f.height === 1920 && f.fps === 30, 'frame spec changed');
});

// ---------------------------------------------------------------- the treatment
check('treatment', 'M3 has a treatment on disk', () => T(treatment('M3'), 'M3 treatment is missing'));
check('treatment', 'M3 runs to its declared duration', () => {
  const t = treatment('M3');
  const sum = round(t.shots.reduce((a, s) => a + s.duration_s, 0));
  T(sum === t.duration_s, `shots total ${sum}s but the film declares ${t.duration_s}s`);
});
check('treatment', 'M3 shot starts are contiguous', () => {
  let run = 0;
  for (const s of treatment('M3').shots) {
    T(Math.abs(s.start_s - run) < 1e-9, `shot ${s.id} starts at ${s.start_s} but the previous shot ends at ${run}`);
    run = round(run + s.duration_s);
  }
});
check('treatment', 'every M3 duration is a whole number of frames at 30fps', () => {
  for (const s of treatment('M3').shots) {
    const frames = s.duration_s * 30;
    T(Math.abs(frames - Math.round(frames)) < 1e-6, `shot ${s.id} is ${s.duration_s}s, which is ${frames} frames`);
  }
});
check('treatment', 'M3 shot ids are unique', () => {
  const ids = treatment('M3').shots.map((s) => s.id);
  T(new Set(ids).size === ids.length, 'duplicate shot id');
});
check('treatment', 'every reuse and crop points at a shot that exists', () => {
  const t = treatment('M3');
  const ids = new Set(t.shots.map((s) => s.id));
  for (const s of t.shots) {
    if (s.source === 'reuse') T(ids.has(s.reuse_of), `shot ${s.id} reuses unknown ${s.reuse_of}`);
    if (s.source === 'crop') T(ids.has(s.crop_of), `shot ${s.id} crops unknown ${s.crop_of}`);
  }
});
check('treatment', 'no reuse or crop points forward in time', () => {
  const t = treatment('M3');
  const at = new Map(t.shots.map((s, i) => [s.id, i]));
  for (const [i, s] of t.shots.entries()) {
    const ref = s.reuse_of ?? s.crop_of;
    if (ref) T(at.get(ref) < i, `shot ${s.id} reuses ${ref}, which comes later`);
  }
});
check('treatment', 'every shot declares a source we understand', () => {
  const ok = new Set(['generate', 'reuse', 'crop']);
  for (const s of treatment('M3').shots) T(ok.has(s.source), `shot ${s.id} has source ${s.source}`);
});
check('treatment', 'every shot names entities that exist', () => {
  const ents = new Set(read('entities').entities.map((e) => e.id));
  for (const s of treatment('M3').shots) for (const e of s.entities ?? []) T(ents.has(e), `shot ${s.id} names unknown entity ${e}`);
});
check('treatment', 'every shot cites claims that exist', () => {
  const ids = new Set(read('claims').claims.map((c) => c.id));
  for (const s of treatment('M3').shots) for (const c of s.claims ?? []) T(ids.has(c), `shot ${s.id} cites unknown claim ${c}`);
});
check('treatment', 'no shot cites a claim belonging to another film', () => {
  const byId = new Map(read('claims').claims.map((c) => [c.id, c]));
  for (const s of treatment('M3').shots) for (const c of s.claims ?? []) {
    T(byId.get(c).film === 'M3', `shot ${s.id} cites ${c}, which belongs to ${byId.get(c).film}`);
  }
});
check('treatment', 'no shot rests only on a disputed or unresolved claim', () => {
  const byId = new Map(read('claims').claims.map((c) => [c.id, c]));
  for (const s of treatment('M3').shots) {
    const cs = (s.claims ?? []).map((c) => byId.get(c));
    if (cs.length === 0) continue;
    T(cs.some((c) => c.state === 'accepted'), `shot ${s.id} rests on no accepted claim`);
  }
});
check('treatment', 'every narration line maps to a shot that exists', () => {
  const t = treatment('M3');
  const ids = new Set(t.shots.map((s) => s.id));
  for (const [id, n] of Object.entries(t.narration)) T(ids.has(n.shot), `narration ${id} names unknown shot ${n.shot}`);
});
check('treatment', 'every shot narration reference resolves', () => {
  const t = treatment('M3');
  for (const s of t.shots) if (s.narration) T(t.narration[s.narration], `shot ${s.id} names unknown narration ${s.narration}`);
});
check('treatment', 'narration exists in all three languages', () => {
  for (const [id, n] of Object.entries(treatment('M3').narration)) {
    for (const l of ['en', 'hi', 'te']) T(n[l] && n[l].length > 0, `narration ${id} has no ${l}`);
  }
});
check('treatment', 'the closing line is the test line', () => {
  const t = treatment('M3');
  const last = t.shots[t.shots.length - 1];
  T(t.narration[last.narration].en === 'He said no.', `the closing line is "${t.narration[last.narration].en}"`);
});
check('treatment', 'the film ends on eight seconds that do not move', () => {
  const t = treatment('M3');
  const last = t.shots[t.shots.length - 1];
  T(last.duration_s === 8.0, `the last shot is ${last.duration_s}s`);
  T(last.camera_move === 'locked', 'the last shot is not locked');
  T(/does not change|does not move/i.test(last.expression), 'the last shot expression changes');
});

// ---------------------------------------------------------------- register (the tone)
check('register', 'no narration line uses fake-epic vocabulary', () => {
  const bad = /\b(behold|lo|verily|thus|didst|thee|thy|thine|o king|hark|forsooth|rained upon|smote)\b/i;
  for (const [id, n] of Object.entries(treatment('M3').narration)) {
    T(!bad.test(n.en), `narration ${id} uses fake-epic vocabulary: "${n.en}"`);
  }
});
check('register', 'no narration line uses marketing adjectives', () => {
  const bad = /\b(epic|legendary|timeless|breathtaking|stunning|iconic|majestic|glorious)\b/i;
  for (const [id, n] of Object.entries(treatment('M3').narration)) {
    T(!bad.test(n.en), `narration ${id} uses a marketing adjective: "${n.en}"`);
  }
});
check('register', 'English narration lines stay short', () => {
  for (const [id, n] of Object.entries(treatment('M3').narration)) {
    const words = n.en.split(/\s+/).length;
    T(words <= 12, `narration ${id} is ${words} words: "${n.en}"`);
  }
});
check('register', 'the narrator brief still names the test line', () => {
  T(read('narrator')._doc.includes('He said no.'), 'the test line is gone from the narrator brief');
});

// ---------------------------------------------------------------- effects and motion
check('motion', 'every effects shot names a film that exists', () => {
  const films = new Set(read('films').films.map((f) => f.id));
  for (const [id, s] of Object.entries(read('effects').shots)) T(films.has(s.film), `effects shot ${id} names unknown film ${s.film}`);
});
check('motion', 'every effects shot exists in its treatment', () => {
  for (const [id, s] of Object.entries(read('effects').shots)) {
    const t = treatment(s.film);
    if (!t) continue;
    T(t.shots.some((x) => x.id === id), `effects names shot ${id} which is not in ${s.film}`);
  }
});
check('motion', 'shot 05-06 is marked no-motion', () => {
  const s = read('effects').shots['05-06'];
  T(s, 'shot 05-06 has no effects record');
  T(s.motion === false, 'shot 05-06 is no longer marked no-motion');
  T(/NO MOTION/i.test(s.instruction), 'shot 05-06 instruction no longer says NO MOTION');
});
check('motion', 'a no-motion instruction always matches a motion:false flag', () => {
  for (const [id, s] of Object.entries(read('effects').shots)) {
    if (/NO MOTION/i.test(s.instruction)) T(s.motion === false, `shot ${id} says NO MOTION but motion is ${s.motion}`);
  }
});
check('motion', 'the five rejection criteria are all present', () => {
  const ids = read('effects').rejection_criteria.map((c) => c.id);
  for (const need of ['REJ.CAMERA-MOVED', 'REJ.EXPRESSION-CHANGED', 'REJ.BODY-SHIFTED', 'REJ.FRAME-ENTRY', 'REJ.LOOP-VISIBLE']) {
    T(ids.includes(need), `rejection criterion ${need} is missing`);
  }
});
check('motion', 'a locked shot with motion moves only what is not the camera', () => {
  for (const [id, s] of Object.entries(read('effects').shots)) {
    if (s.motion && s.camera_locked) T(!/camera (move|pan|push|drift)/i.test(s.instruction), `shot ${id} is camera-locked but its instruction moves the camera`);
  }
});

// ---------------------------------------------------------------- joins
check('joins', 'every declared join names films that exist', () => {
  const films = new Set(read('films').films.map((f) => f.id));
  for (const j of read('transitions').joins) {
    T(films.has(j.from) && films.has(j.to), `join ${j.from}->${j.to} names an unknown film`);
  }
});
check('joins', 'the arc declares the same joins as the transitions', () => {
  const arc = read('films').arcs[0].continuous_joins.map((j) => `${j.from}->${j.to}`).sort();
  const tr = read('transitions').joins.filter((j) => j.kind === 'continuous').map((j) => `${j.from}->${j.to}`).sort();
  T(JSON.stringify(arc) === JSON.stringify(tr), `arc joins ${arc.join(',')} do not match transitions ${tr.join(',')}`);
});
check('joins', 'every continuous join carries room tone', () => {
  for (const j of read('transitions').joins.filter((x) => x.kind === 'continuous')) {
    T(j.room_tone === 'carry', `join ${j.from}->${j.to} does not carry room tone`);
    T(j.shared_frame === true, `join ${j.from}->${j.to} does not share a frame`);
  }
});
check('joins', 'the joins form an unbroken chain', () => {
  const joins = read('transitions').joins.filter((j) => j.kind === 'continuous');
  for (let i = 1; i < joins.length; i++) T(joins[i].from === joins[i - 1].to, `chain breaks between ${joins[i - 1].to} and ${joins[i].from}`);
});

// ---------------------------------------------------------------- music
check('music', 'the music provider is none', () => T(read('music').provider === 'none', 'music provider is not none'));
check('music', 'music is a brief, not a generated asset', () => {
  T(read('music').status === 'brief-only', 'music status changed');
  T(/composer/i.test(read('music').note), 'the note no longer names a composer');
});
check('music', 'the env example keeps MUSIC_PROVIDER=none', () => {
  const blob = require_text('.env.example');
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
  const sum = Math.round(s.rows.reduce((a, r) => a + r.usd, 0) * 1e6) / 1e6;
  T(Math.abs(sum - s.totals.usd) < 1e-6, `rows sum to ${sum} but the total says ${s.totals.usd}`);
});
check('spend', 'every ledger row names a provider and a dollar amount', () => {
  for (const r of read('spend', { fresh: true }).rows) {
    T(r.provider, 'a ledger row names no provider');
    T(typeof r.usd === 'number', 'a ledger row has no dollar amount');
    T(r.at, 'a ledger row has no timestamp');
  }
});

// ---------------------------------------------------------------- packaging
check('repo', 'the generated graph is not hand-edited', () => {
  const dir = join(ROOT, 'graph');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const blob = require_text(`graph/${f}`);
    T(/GENERATED FILE/.test(blob), `graph/${f} has lost its generated-file banner - it may have been hand-edited`);
  }
});
check('repo', 'the agents directory holds system prompts', () => {
  const dir = join(ROOT, 'agents');
  T(existsSync(dir), 'agents/ is missing');
  T(readdirSync(dir).filter((f) => f.endsWith('.md')).length >= 5, 'fewer than five agent prompts');
});

function require_text(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function round(n) { return Math.round(n * 1e6) / 1e6; }

// ---------------------------------------------------------------- run
let pass = 0; const failures = [];
for (const c of checks) {
  try { c.fn(); pass++; }
  catch (e) { failures.push({ ...c, error: e.message }); }
}

const byArea = {};
for (const c of checks) byArea[c.area] = (byArea[c.area] ?? 0) + 1;

console.log(`\nVALIDATE - ${checks.length} checks, offline, no key, no spend\n`);
console.log('  ' + Object.entries(byArea).map(([a, n]) => `${a} ${n}`).join('  ·  '));
if (failures.length) {
  console.log(`\n  ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  [${f.area}] ${f.name}\n      ${f.error}`);
  console.log('');
  process.exit(1);
}
console.log(`\n  all ${pass} green\n`);

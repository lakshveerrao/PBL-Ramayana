#!/usr/bin/env node
// Point the store at the frozen test fixture BEFORE anything imports it, so the
// regressions never depend on whatever graph is installed in data/.
process.env.PBL_GRAPH ??= 'tools/fixtures/graph';
// regress - behaviour, not data shape. Every regression that guards a rule pairs the
// allowed case with the blocked one, so a rule cannot be loosened without a test noticing.
import { read, write, treatment, clearCache, ROOT, dataDir, firstDirected } from '../lib/store.js';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkShot, checkFilm, entityCleared, assertNoMemoBlocked, GateRefusal, stillAllowed } from '../lib/consistency.js';
import { assertNoRestrictedText, RightsError, isRestricted, locatorOf } from '../lib/sources.js';
import { normaliseImage, normaliseVideo, buildImagePayload, decodeInline } from '../lib/fal.js';
import { renderMotion, MotionRefusal, estimate, shotOf } from '../lib/render.js';
import { assemble, applyOverrides, directionOverrides } from '../lib/prompt.js';
import { briefs as sheetBriefs, decisions as sheetDecisions, order as sheetOrder,
         viewPrompt, plan as sheetPlan } from '../lib/sheetprompt.js';
import { priceOf, modelFor, estimateFilm, RATES } from '../lib/cost.js';
import { assertWithinCeiling, CeilingError } from '../lib/state.js';
import { burnPlan, fitsBox, wrap, ass } from '../lib/subtitle.js';
import { chain as gradeChain, grainChain } from '../lib/grade.js';
import { plan as assemblePlan } from '../lib/assemble.js';
import { reconcile, parseJson, briefFor } from '../lib/direct.js';
import { checkNarration } from '../lib/register.js';
import { passageTextFields, sourceStatesTravel, textMayTravel, locatorIdentifiesAPlace,
         locatorKind, hasDesign, skinGovernance, forbidsLightening, isLatinScript,
         filmNeedsDuration } from '../lib/contract.js';
import { uploadSheet, approveSheet } from '../lib/sheets.js';

// A 1x1 PNG and a 1x1 GIF - enough bytes to exercise storage and hashing without
// pretending to be a model sheet. Real sheets are drawn by an artist.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG2 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const FOUR_VIEWS = ['front', 'three_quarter', 'profile', 'in_world']
  .map((slot) => ({ slot, filename: `${slot}.png`, data_base64: PNG }));

const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const ok = (c, m) => { if (!c) throw new Error(m); };
const throws = async (fn, type, m) => {
  try { await fn(); } catch (e) { if (e.name === type) return e; throw new Error(`${m} - threw ${e.name} instead: ${e.message}`); }
  throw new Error(`${m} - nothing was thrown`);
};

// --- the consistency gate: refuses, and names what it still allows -----------------
t('a principal with no approved sheet is refused', () => {
  const r = entityCleared('DASARATHA');
  ok(!r.cleared, 'DASARATHA cleared the gate with no approved sheet');
});
t('a shot with a blocked principal is refused', () => {
  const r = checkShot(shotOf('M3', '03-05'));
  ok(!r.allowed, 'shot 03-05 was allowed despite an unapproved sheet');
});
t('a shot with no principal in frame is NOT blocked', () => {
  const r = checkShot(shotOf('M3', '03-03'));
  ok(r.allowed, 'shot 03-03 has no entities and must not be blocked by a sheet gate');
});
t('a gate refusal names what it still allows', () => {
  const r = checkShot(shotOf('M3', '03-05'));
  ok(Array.isArray(r.still_allowed) && r.still_allowed.length >= 3, 'the refusal does not say what is still allowed');
  ok(r.still_allowed.some((s) => /writing|direction/i.test(s)), 'the refusal does not allow writing to continue');
});
t('an approved sheet with four files clears the gate, an unapproved one does not', () => {
  const before = read('sheets', { fresh: true });
  const snapshot = JSON.stringify(before);
  try {
    const s = before.sheets.find((x) => x.entity === 'DASARATHA');
    s.files = ['front.png', 'three_quarter.png', 'profile.png', 'in_world.png'];
    s.hashes = ['a', 'b', 'c', 'd'];
    s.approved = false;
    write('sheets', before);
    ok(!entityCleared('DASARATHA').cleared, 'four uploaded files cleared the gate without approval - upload must never approve');

    s.approved = true; s.approved_by = 'Test Approver';
    write('sheets', before);
    ok(entityCleared('DASARATHA').cleared, 'an approved four-file sheet did not clear the gate');
  } finally {
    write('sheets', JSON.parse(snapshot)); clearCache();
  }
});
t('an approved sheet with no approver named does not clear', () => {
  const before = read('sheets', { fresh: true });
  const snapshot = JSON.stringify(before);
  try {
    const s = before.sheets.find((x) => x.entity === 'RAMA');
    s.files = ['a.png']; s.hashes = ['h']; s.approved = true; s.approved_by = null;
    write('sheets', before);
    ok(!entityCleared('RAMA').cleared, 'a sheet approved by nobody cleared the gate');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('the gate blocks the generate shots of M3 and not the rest', () => {
  const r = checkFilm(treatment('M3').shots);
  ok(!r.allowed, 'M3 is not blocked and it should be');
  ok(r.allowed_count > 0, 'the gate blocked every shot including ones with no principal');
});

// --- the memo gate ----------------------------------------------------------------
t('a memo-blocked entity cannot be designed', async () => {
  await throws(() => assertNoMemoBlocked(['TATAKA']), 'GateRefusal', 'TATAKA was allowed through the memo gate');
});
t('an entity with no memo passes the memo gate', () => {
  assertNoMemoBlocked(['DASARATHA', 'RAMA']);
});
t('assembling a prompt for a memo-blocked entity refuses', async () => {
  const fake = { ...shotOf('M3', '03-05'), entities: ['TATAKA'] };
  await throws(() => assemble(fake, 'M3'), 'GateRefusal', 'a prompt was assembled for TATAKA');
});

// --- sheet intake: upload records evidence, only a human approves -----------------
t('uploading four views records angle and leaves the other three axes outstanding', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    const r = uploadSheet('VASISTHA', { files: FOUR_VIEWS });
    ok(r.files.length === 4, `expected 4 files, got ${r.files.length}`);
    ok(r.hashes.length === 4, 'one hash per file was not recorded');
    ok(r.twenty_frame_test.evidence_held.includes('angle'), 'a four-view sheet did not satisfy angle');
    for (const axis of ['lighting', 'distance', 'expression']) {
      ok(r.twenty_frame_test.outstanding.includes(axis), `${axis} should still be outstanding after a four-view upload`);
    }
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('uploading fewer than four views does NOT satisfy angle', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    const r = uploadSheet('VASISTHA', { files: FOUR_VIEWS.slice(0, 2) });
    ok(!r.twenty_frame_test.evidence_held.includes('angle'), 'two views satisfied the angle axis');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('upload never approves', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    const r = uploadSheet('VASISTHA', { files: FOUR_VIEWS });
    ok(r.approved === false, 'uploading files approved the sheet');
    ok(!entityCleared('VASISTHA').cleared, 'an uploaded but unapproved sheet cleared the consistency gate');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('approval requires a human name', async () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    uploadSheet('VASISTHA', { files: FOUR_VIEWS });
    await throws(() => approveSheet('VASISTHA', {}), 'Error', 'a sheet was approved with no name');
    await throws(() => approveSheet('VASISTHA', { approver: ' ' }), 'Error', 'a sheet was approved by whitespace');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('a sheet with no files cannot be approved', async () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    await throws(() => approveSheet('VASISTHA', { approver: 'A Human' }), 'Error', 'an empty sheet was approved');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('four uploaded and approved files pass the gate; an unapproved principal still fails', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    uploadSheet('VASISTHA', { files: FOUR_VIEWS });
    const a = approveSheet('VASISTHA', { approver: 'Test Approver' });
    ok(a.approved_by === 'Test Approver', 'the approver name was not recorded');
    ok(entityCleared('VASISTHA').cleared, 'an approved four-file sheet did not pass the gate');
    // The blocked case, beside the allowed one.
    ok(!entityCleared('DASARATHA').cleared, 'an unapproved principal passed the gate');
    // And the shot-level consequence: 03-02 is Vasistha alone, so it should now clear.
    ok(checkShot(shotOf('M3', '03-02')).allowed, 'a shot whose only principal is approved did not clear');
    ok(!checkShot(shotOf('M3', '03-05')).allowed, 'a shot with an unapproved principal cleared');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('an approved sheet still reports its outstanding axes', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    uploadSheet('VASISTHA', { files: FOUR_VIEWS });
    const a = approveSheet('VASISTHA', { approver: 'Test Approver' });
    ok(a.twenty_frame_test.outstanding.length === 3, 'approval silently cleared the outstanding axes');
    ok(/remain outstanding/i.test(a.note), 'approval does not surface the outstanding axes');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('an unknown slot is refused', async () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    await throws(() => uploadSheet('VASISTHA', { files: [{ slot: 'back', filename: 'b.png', data_base64: PNG }] }),
      'Error', 'an unknown sheet slot was accepted');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('a sheet path that escapes the repository is refused', async () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    await throws(() => uploadSheet('VASISTHA', { files: [{ slot: 'front', path: '../../../etc/hostname' }] }),
      'Error', 'a path outside the repository was accepted');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('a sheet file inside the repository is accepted by path', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  const probe = 'assets/sheets/.probe.png';
  try {
    writeFileSync(join(ROOT, probe), Buffer.from(PNG, 'base64'));
    const r = uploadSheet('VASISTHA', { files: [{ slot: 'front', filename: 'front.png', path: probe }] });
    ok(r.files.length === 1 && r.hashes.length === 1, 'a path-based upload did not record the file');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); rmSync(join(ROOT, probe), { force: true }); }
});
t('an empty sheet file is refused', async () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    await throws(() => uploadSheet('VASISTHA', { files: [{ slot: 'front', filename: 'f.png', data_base64: '' }] }),
      'Error', 'an empty file was accepted');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});
t('the same bytes always hash the same, and different bytes do not', () => {
  const snapshot = JSON.stringify(read('sheets', { fresh: true }));
  try {
    const a = uploadSheet('VASISTHA', { files: FOUR_VIEWS }).hashes;
    const b = uploadSheet('VASISTHA', { files: FOUR_VIEWS }).hashes;
    ok(JSON.stringify(a) === JSON.stringify(b), 'the same file hashed differently twice');
    const c = uploadSheet('VASISTHA', { files: [{ slot: 'front', filename: 'f.png', data_base64: PNG2 }] }).hashes;
    ok(c[0] !== a[0], 'different bytes produced the same hash');
  } finally { write('sheets', JSON.parse(snapshot)); clearCache(); }
});

// --- the motion refusal -----------------------------------------------------------
t('shot 05-06 refuses motion', async () => {
  const e = await throws(() => renderMotion('M3', '05-06'), 'MotionRefusal', 'shot 05-06 did not refuse motion');
  ok(/NO MOTION/i.test(e.message), 'the refusal does not quote the instruction');
});
t('shot 07-02 refuses motion too', async () => {
  await throws(() => renderMotion('M3', '07-02'), 'MotionRefusal', 'shot 07-02 did not refuse motion');
});
t('a shot that permits motion does not refuse for that reason', async () => {
  // 03-05 permits motion; it should fail on the sheet gate, not the motion refusal.
  try {
    await renderMotion('M3', '03-05');
    throw new Error('03-05 should have been stopped by the sheet gate');
  } catch (e) {
    ok(e.name !== 'MotionRefusal', '03-05 wrongly refused as a no-motion shot');
    ok(e.name === 'GateRefusal', `expected the sheet gate to stop 03-05, got ${e.name}: ${e.message}`);
  }
});
t('a no-motion instruction cannot be flipped by the flag alone', async () => {
  const before = read('effects', { fresh: true });
  const snapshot = JSON.stringify(before);
  try {
    before.shots['05-06'].motion = true;   // instruction still says NO MOTION
    write('effects', before);
    await throws(() => renderMotion('M3', '05-06'), 'MotionRefusal', 'flipping the flag bypassed the NO MOTION instruction');
  } finally { write('effects', JSON.parse(snapshot)); clearCache(); }
});

// --- the rights gate --------------------------------------------------------------
t('a locator-only payload passes the rights gate', () => {
  assertNoRestrictedText({ locator: { sarga: 20, verses: '9-10', source: 'SRC.GRETIL.VR' } });
});
t('restricted text beside its source id is caught', async () => {
  await throws(
    () => assertNoRestrictedText({ p: { source: 'SRC.GRETIL.VR', verse_text: 'anything at all' } }),
    'RightsError', 'restricted verse text passed the rights gate');
});
t('text_held true is caught', async () => {
  await throws(() => assertNoRestrictedText({ p: { text_held: true } }), 'RightsError', 'text_held:true passed the rights gate');
});
t('Hindi narration is not mistaken for restricted verse', () => {
  const n = treatment('M3').narration;
  assertNoRestrictedText({ lines: Object.values(n).map((x) => ({ hi: x.hi, te: x.te })) });
});
t('locatorOf never returns text', () => {
  const c = read('claims').claims.find((x) => x.id === 'CLM.BALA.20.NOT-YET-SIXTEEN');
  const l = locatorOf(c);
  ok(l.text === null, 'locatorOf returned text');
  ok(l.sarga === 20, 'locatorOf lost the locator');
  ok(isRestricted(l.source), 'the source should be a restricted one in this case');
});

// --- what is actually SENT ---------------------------------------------------------
t('the negative prompt reaches the payload, not just the assembly', () => {
  // It was assembled, validated and regression-tested for weeks, then dropped at the
  // request body - because every check looked at the assembly and none at the payload.
  const p = buildImagePayload({ prompt: 'a hall', negative: 'dome, arch, marble', seed: 7 });
  ok(p.negative_prompt === 'dome, arch, marble', `negative_prompt is ${JSON.stringify(p.negative_prompt)} - it is not being sent`);
  ok(p.prompt === 'a hall', 'the prompt was altered');
  ok(p.seed === 7, 'the seed was not sent');
});
t('an empty negative is omitted rather than sent blank', () => {
  for (const n of [null, '', '   ']) {
    ok(!('negative_prompt' in buildImagePayload({ prompt: 'x', negative: n })), `a blank negative (${JSON.stringify(n)}) was sent`);
  }
});
t('a real shot is sent with EXACTLY the negative it assembled', () => {
  // The invariant is not which words are in the list - that is the graph's business -
  // but that the list assembled is the list sent, unchanged and not dropped.
  const a = assemble(shotOf('M3', '03-05'), 'M3');
  const p = buildImagePayload({ prompt: a.prompt, negative: a.negative });
  ok(a.negative && a.negative.length > 20, 'the shot assembled no negative at all');
  ok(p.negative_prompt === a.negative, 'the assembled negative is not what gets sent');
  ok(p.prompt === a.prompt, 'the assembled prompt is not what gets sent');
  // Whatever the graph forbids about cloth must survive into the payload.
  ok(/stitch|sewn|tailor/i.test(p.negative_prompt), 'the sent negative says nothing about stitched cloth');
});
t('a sheet is sent with EXACTLY the negative it assembled', () => {
  const v = viewPrompt('VISHVAMITRA', 'front');
  const p = buildImagePayload({ prompt: v.prompt, negative: v.negative });
  ok(v.negative && v.negative.length > 20, 'the sheet assembled no negative at all');
  ok(p.negative_prompt === v.negative, 'the assembled sheet negative is not what gets sent');
  // The character's own never-list must reach the payload, whatever the graph adds.
  ok(/glow|aura/i.test(p.negative_prompt), "the sent negative does not carry the character's own never-list");
});
t('inline mode asks for the image in the response, not on a media host', () => {
  ok(buildImagePayload({ prompt: 'x', inline: true }).sync_mode === true, 'inline mode does not set sync_mode');
  ok(!('sync_mode' in buildImagePayload({ prompt: 'x', inline: false })), 'sync_mode leaks into non-inline requests');
});
t('a data URI decodes to bytes', () => {
  const tiny = 'data:image/png;base64,iVBORw0KGgo=';
  const d = decodeInline(tiny);
  ok(d && d.contentType === 'image/png' && d.bytes.length > 0, 'a data URI did not decode');
  ok(decodeInline('https://example.com/a.png') === null, 'a plain URL decoded as inline');
});

// --- the fal adapter: the caller never learns a provider's shape ------------------
t('fal image shape A normalises', () => {
  const r = normaliseImage({ images: [{ url: 'https://x/1.png', width: 1080, height: 1920 }], seed: 7, model: 'flux' });
  ok(r.url === 'https://x/1.png' && r.seed === 7 && r.model_version === 'flux', 'shape A failed');
});
t('fal image shape B normalises', () => {
  const r = normaliseImage({ output: { images: [{ image_url: 'https://x/2.png' }], seed: 9, model: 'v2' } });
  ok(r.url === 'https://x/2.png' && r.seed === 9, 'shape B failed');
});
t('fal image shape C - bare string array - normalises', () => {
  const r = normaliseImage({ output: ['https://x/3.png'] });
  ok(r.url === 'https://x/3.png', 'shape C failed');
});
t('an unrecognised fal shape throws with the keys it saw', async () => {
  const e = await throws(() => normaliseImage({ nonsense: true }), 'Error', 'an unknown shape did not throw');
  ok(e.detail && Array.isArray(e.detail.seen_keys), 'the error does not report the keys it saw');
});
t('fal video shape normalises', () => {
  const r = normaliseVideo({ video: { url: 'https://x/v.mp4' }, seed: 3 });
  ok(r.url === 'https://x/v.mp4' && r.seed === 3, 'video shape failed');
});

// --- money ------------------------------------------------------------------------
t('cached input is cheaper than fresh input', () => {
  const fresh = priceOf('claude-sonnet-5', { input_tokens: 10000, output_tokens: 0 });
  const cached = priceOf('claude-sonnet-5', { input_tokens: 0, cache_read_input_tokens: 10000, output_tokens: 0 });
  ok(cached.usd < fresh.usd, 'a cache read is not cheaper than fresh input');
});
t('a cache write costs more than fresh input', () => {
  const fresh = priceOf('claude-opus-5', { input_tokens: 10000 });
  const written = priceOf('claude-opus-5', { cache_creation_input_tokens: 10000 });
  ok(written.usd > fresh.usd, 'a cache write is not more expensive than fresh input');
});
t('critics run on a different model from the director', () => {
  ok(modelFor('direct') !== modelFor('critic-register'), 'the register critic shares the director model');
  ok(modelFor('direct') !== modelFor('critic-evidence'), 'the evidence critic shares the director model');
});
t('image prompts are assembled on the cheapest model', () => {
  const cheapest = Object.entries(RATES).sort((a, b) => a[1].in - b[1].in)[0][0];
  ok(modelFor('image-prompt') === cheapest, `image prompts route to ${modelFor('image-prompt')}, not the cheapest model`);
});
t('the first film costs more than a later one, because nothing is cached yet', () => {
  ok(estimateFilm({ first_film: true }).usd > estimateFilm({ first_film: false }).usd, 'caching saves nothing');
});
t('a run past the ceiling refuses before it spends', async () => {
  await throws(() => assertWithinCeiling(1e9), 'CeilingError', 'a run past the ceiling was permitted');
});
t('a run inside the ceiling is permitted and reports headroom', () => {
  const r = assertWithinCeiling(0.01);
  ok(r.headroom > 0, 'no headroom reported');
});
t('an estimate can be produced without spending anything', () => {
  const before = read('spend', { fresh: true }).totals.calls;
  const e = estimate('M3');
  ok(e.usd.total > 0, 'the estimate is zero');
  ok(read('spend', { fresh: true }).totals.calls === before, 'producing an estimate recorded a spend row');
});

// --- the prompt is assembled, never hand-written -----------------------------------
t('an assembled prompt carries the locked skin albedo', () => {
  const p = assemble(shotOf('M3', '03-05'), 'M3').prompt;
  ok(p.includes('#6B4A33'), 'the prompt does not carry the locked albedo');
  ok(/never lighten/i.test(p), 'the prompt does not forbid lightening');
});
t('an assembled prompt forbids arches, domes and marble', () => {
  const p = assemble(shotOf('M3', '03-05'), 'M3').prompt;
  for (const bad of ['arch', 'dome', 'marble']) ok(p.includes(bad), `the prompt does not forbid ${bad}`);
});
t('an assembled prompt says draped and never tailored', () => {
  const p = assemble(shotOf('M3', '03-05'), 'M3').prompt;
  ok(/draped/i.test(p), 'the prompt does not say draped');
  ok(p.includes('tailored'), 'the prompt does not forbid tailored');
});
t('an assembled prompt carries the film-locked prop', () => {
  const p = assemble(shotOf('M3', '03-05'), 'M3').prompt;
  ok(/oil lamp/i.test(p), 'the prompt lost the locked lamp');
});
t('changing the data changes the prompt', () => {
  const before = read('entities', { fresh: true });
  const snapshot = JSON.stringify(before);
  try {
    before.entities.find((e) => e.id === 'DASARATHA').design.hair = 'shaved bald';
    write('entities', before);
    ok(/shaved bald/.test(assemble(shotOf('M3', '03-05'), 'M3').prompt), 'the prompt did not follow the data');
  } finally { write('entities', JSON.parse(snapshot)); clearCache(); }
});

// --- subtitles: the caption check --------------------------------------------------
t('a short Latin line fits its box', () => ok(fitsBox('He said no.', 'en').fits, 'a three word English line did not fit'));
t('an overlong Latin line does not fit', () => ok(!fitsBox('x'.repeat(200), 'en').fits, 'a 200 character line fitted'));
t('Telugu gets a taller line box than Latin', () => {
  ok(burnPlan('te').line_box_px > burnPlan('en').line_box_px, 'Telugu line box is not taller');
});
t('Devanagari gets a taller line box than Latin', () => {
  ok(burnPlan('hi').line_box_px > burnPlan('en').line_box_px, 'Devanagari line box is not taller');
});
t('every burn plan resolves to a font file that exists', () => {
  for (const l of ['en', 'hi', 'te']) {
    const p = burnPlan(l);
    ok(p.font_file, `no font resolved for ${l}`);
  }
});

// --- captions, the grade, and the cut ----------------------------------------------
t('wrapping never leaves a one-word widow', () => {
  for (const [, n] of Object.entries(treatment('M3').narration)) {
    for (const lang of ['en', 'hi', 'te']) {
      const lines = wrap(n[lang], burnPlan(lang).max_chars_per_line);
      if (lines.length < 2) continue;
      const lens = lines.map((l) => l.length);
      ok(Math.max(...lens) - Math.min(...lens) <= Math.max(...lens) * 0.6,
        `${lang} wraps badly: ${lines.join(' | ')}`);
    }
  }
});
t('wrapping respects the per-script character limit', () => {
  for (const [, n] of Object.entries(treatment('M3').narration)) {
    for (const lang of ['en', 'hi', 'te']) {
      const max = burnPlan(lang).max_chars_per_line;
      for (const l of wrap(n[lang], max)) ok(l.length <= max, `${lang} line over ${max}: "${l}"`);
    }
  }
});
t('the ASS script pins PlayRes to the real frame', () => {
  const doc = ass(treatment('M3'), 'te');
  ok(doc.includes('PlayResX: 1080'), 'PlayResX is not pinned to the frame width');
  ok(doc.includes('PlayResY: 1920'), 'PlayResY is not pinned to the frame height');
  // Without this libass scales every FontSize against an assumed resolution and the
  // caption renders at roughly three times its specified size, at the top of frame.
  ok(new RegExp(`Style: Default,[^,]+,${burnPlan('te').size_px},`).test(doc), 'the style font size is not the per-script size');
});
t('each language gets its own font in the ASS style', () => {
  for (const lang of ['en', 'hi', 'te']) {
    ok(ass(treatment('M3'), lang).includes(burnPlan(lang).font_family), `${lang} does not name its own font family`);
  }
});
t('ASS cue times match the shot windows', () => {
  const doc = ass(treatment('M3'), 'en');
  const t3 = treatment('M3');
  const shots = new Map(t3.shots.map((s) => [s.id, s]));
  for (const [, n] of Object.entries(t3.narration)) {
    const shot = shots.get(n.shot);
    const h = Math.floor(shot.start_s / 3600), m = Math.floor((shot.start_s % 3600) / 60);
    const sec = Math.floor(shot.start_s % 60), cs = Math.round((shot.start_s % 1) * 100);
    const stamp = `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    ok(doc.includes(stamp), `no cue starts at ${stamp} for shot ${n.shot}`);
  }
});
t('the shadow tint curve returns to the diagonal before it reaches skin', () => {
  const g = read('grade');
  ok(typeof g.shadow_tint.rejoin === 'number', 'the tint curve has no rejoin point');
  // Skin sits around 0.40-0.46 encoded. A tint still lifting there lightens every face.
  ok(g.shadow_tint.rejoin >= 0.55, `rejoin is ${g.shadow_tint.rejoin}, which is inside the skin band`);
  ok(g.shadow_tint.pivot < g.shadow_tint.rejoin, 'the pivot is not below the rejoin');
});
t('the grade chain never emits a curve point outside 0..1', () => {
  const pts = gradeChain().match(/\d*\.?\d+\/-?\d*\.?\d+/g) ?? [];
  ok(pts.length > 0, 'the grade chain has no curve points at all');
  for (const p of pts) {
    const [x, y] = p.split('/').map(Number);
    ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `curve point ${p} is outside 0..1 and ffmpeg will reject it`);
  }
});
t('the grade never tints shadows blue', () => {
  const ch = gradeChain();
  const b = ch.match(/b='0\/0 ([\d.]+)\/([\d.]+)/);
  ok(b, 'no blue shadow curve found');
  ok(Number(b[2]) < Number(b[1]), 'the blue shadow curve lifts rather than pulls - that is a blue shadow');
});
t('grain is applied and is subtle', () => {
  const g = grainChain();
  ok(g && /noise=/.test(g), 'grain is not applied');
  ok(read('grade').grain.strength < 0.1, 'grain strength is no longer subtle');
});
t('the assemble plan totals the declared frame count', () => {
  const p = assemblePlan('M3');
  ok(p.totalFrames === p.expected_frames, `plan totals ${p.totalFrames} frames, declared ${p.expected_frames}`);
  ok(p.totalFrames === 1320, `expected 1320 frames, got ${p.totalFrames}`);
});
t('every shot resolves to a frame, real or placeholder', () => {
  for (const s of assemblePlan('M3').shots) ok(s.frame, `shot ${s.id} resolves to no frame at all`);
});
t('a reuse resolves to the frame it points at, not its own', () => {
  const p = assemblePlan('M3');
  const reuse = p.shots.find((s) => s.source === 'reuse');
  ok(reuse.frame.from === reuse.reuse_of, `shot ${reuse.id} resolves to ${reuse.frame.from}, not ${reuse.reuse_of}`);
});

// --- the director harness: fix the harness, not the treatment -----------------------
t('uneven durations are quantised to whole frames', () => {
  const r = reconcile({ shots: [{ id: 'a', duration_s: 20.017 }, { id: 'b', duration_s: 23.1 }], narration: {} }, 'M3');
  for (const s of r.shots) ok(Number.isInteger(s.duration_frames), `shot ${s.id} is not a whole number of frames`);
  ok(r.total_frames === 1320, `total is ${r.total_frames} frames, not 1320`);
});
t('a total that does not sum is reconciled exactly, and the repair is reported', () => {
  const r = reconcile({ shots: [{ id: 'a', duration_s: 10 }, { id: 'b', duration_s: 10 }], narration: {} }, 'M3');
  ok(r.total_frames === 1320, `total is ${r.total_frames}`);
  ok(r.repairs.some((x) => /absorbed/.test(x)), 'the reconciliation was silent');
});
t('starts are recomputed from durations, not trusted', () => {
  const r = reconcile({ shots: [{ id: 'a', duration_s: 22, start_s: 999 }, { id: 'b', duration_s: 22, start_s: 999 }], narration: {} }, 'M3');
  ok(r.shots[0].start_s === 0 && r.shots[1].start_s === 22, 'the model\'s bogus starts were trusted');
});
t('fenced JSON is parsed rather than rejected', () => {
  ok(parseJson('```json\n{"a":1}\n```')?.a === 1, 'a fenced response was rejected');
  ok(parseJson('here you go: {"a":2} hope that helps')?.a === 2, 'a wrapped response was rejected');
  ok(parseJson('not json at all') === null, 'garbage was accepted as JSON');
});
t('a duplicate shot id is reported', () => {
  const r = reconcile({ shots: [{ id: 'a', duration_s: 22 }, { id: 'a', duration_s: 22 }], narration: {} }, 'M3');
  ok(r.problems.some((p) => /appears twice/.test(p)), 'a duplicate shot id passed');
});
t('a reuse pointing forward or nowhere is reported', () => {
  const r = reconcile({ shots: [{ id: 'a', duration_s: 22, source: 'reuse', reuse_of: 'b' }, { id: 'b', duration_s: 22 }], narration: {} }, 'M3');
  ok(r.problems.some((p) => /comes later/.test(p)), 'a forward reuse passed');
  const r2 = reconcile({ shots: [{ id: 'a', duration_s: 44, source: 'reuse', reuse_of: 'zz' }], narration: {} }, 'M3');
  ok(r2.problems.some((p) => /does not exist/.test(p)), 'a dangling reuse passed');
});
t('narration returned as a bare string is normalised', () => {
  const r = reconcile({ shots: [{ id: 'a', duration_s: 44, narration: 'L1' }], narration: { L1: 'He said no.' } }, 'M3');
  ok(r.narration.L1.en === 'He said no.', 'a bare-string narration was lost');
  ok(r.narration.L1.shot === 'a', 'the narration was not bound to its shot');
});
t('the register is checked offline, before any critic is paid for', () => {
  const bad = checkNarration({ L1: { en: 'Behold, the great sage did come unto the king.', shot: 'a' } });
  ok(bad.verdict === 'fail', 'fake-epic narration passed the offline register check');
  ok(bad.findings.some((f) => /fake-epic/.test(f.problem)), 'the finding does not name the problem');
  ok(bad.findings[0].quote, 'the finding does not quote the line');
});
t('the test line passes the register check', () => {
  ok(checkNarration({ L7: { en: 'He said no.', speaker: 'DASARATHA', shot: 'z' } }).verdict === 'pass',
    'the test line failed its own register check');
});
t('a marketing adjective is caught', () => {
  ok(checkNarration({ L1: { en: 'An epic refusal.', shot: 'a' } }).verdict === 'fail', 'a marketing adjective passed');
});
t('an attributed line that drops its attribution is caught', () => {
  const r = checkNarration({ L1: { en: 'The boy was not yet sixteen.', speaker: 'DASARATHA', shot: 'a' } });
  ok(r.verdict === 'fail', 'a statement rendered as narrator fact passed');
  ok(r.findings.some((f) => /narrator fact/.test(f.suggestion)), 'the finding does not explain why it matters');
});
t('the same line WITH its attribution passes', () => {
  ok(checkNarration({ L1: { en: 'He said the boy was not yet sixteen.', speaker: 'DASARATHA', shot: 'a' } }).verdict === 'pass',
    'a properly attributed line was rejected');
});
t('the whole treatment passes its own register check', () => {
  const t3 = treatment('M3');
  const r = checkNarration(Object.fromEntries(Object.entries(t3.narration).map(([k, v]) => [k, { en: v.en, speaker: v.speaker, shot: v.shot }])));
  ok(r.verdict === 'pass', `the standard fails its own check: ${JSON.stringify(r.findings)}`);
});
t('the director brief carries locators and never text', () => {
  const b = briefFor('M3');
  ok(/BALA 20\./.test(b), 'the brief carries no locators');
  ok(!/[\u0900-\u097F]{40,}/.test(b), 'the brief carries a long Devanagari run');
  assertNoRestrictedText({ user: b }, 'director brief');
});
t('the director brief names the speaker on every attributed claim', () => {
  const b = briefFor('M3');
  ok(/SPOKEN BY DASARATHA/.test(b), 'the brief does not carry speaker attribution');
});

// --- model sheets: the decisions must not drift -----------------------------------
t('the four design decisions are recorded and classed as ours', () => {
  const d = sheetDecisions();
  ok(d.decisions.length >= 4, `only ${d.decisions.length} decisions recorded`);
  for (const x of d.decisions) {
    if (x.subject === 'PROCESS') continue;
    ok(x.class === 'S', `${x.id} is classed ${x.class}, not S - a design choice is ours, never the text's`);
  }
});
t('Rama\'s complexion is declared ours, never the text\'s', () => {
  const dd = sheetDecisions().decisions.find((x) => x.subject === 'RAMA');
  ok(dd, 'no complexion decision recorded for Rama');
  ok(dd.class === 'S', 'the complexion decision is not classed S');
  ok(/never/i.test(dd.never_presented_as ?? '') || /never/i.test(JSON.stringify(dd)), 'it is not declared as never the text\'s');
  const p = viewPrompt('RAMA', 'front').prompt;
  ok(/OURS/i.test(p), 'the Rama prompt does not declare the complexion as ours');
  ok(!/the text says.{0,30}(complexion|colour)/i.test(p), 'the Rama prompt attributes a complexion to the text');
});
t('the brothers share a complexion range, and Lakshmana is never lighter', () => {
  const c = sheetBriefs().characters.find((x) => x.id === 'LAKSHMANA');
  ok(/same range|same complexion/i.test(c.complexion + ' ' + (c.complexion_declaration ?? '')),
    'Lakshmana is no longer in the same complexion range as Rama');
  ok(/build and hair/i.test(c.distinct_from.how), 'Lakshmana is no longer told apart by build and hair');
  ok(c.never.some((n) => /lighter/i.test(n)), 'the brief no longer forbids lighter skin than Rama');
  // And the generated prompt must carry it.
  const p = viewPrompt('LAKSHMANA', 'front').prompt;
  ok(/same range|same complexion/i.test(p), 'the Lakshmana prompt does not put him in Rama\'s range');
  ok(!/lighter than/i.test(p.replace(/never lighter than[^.]*/gi, '')), 'the Lakshmana prompt makes him lighter');
});
t('every sheet prompt carries the mandatory cloth line', () => {
  const line = sheetBriefs()._universal.mandatory_line;
  for (const id of sheetOrder()) {
    ok(viewPrompt(id, 'front').prompt.includes(line), `${id} is missing the mandatory cloth line`);
  }
});
t('a character whose face is withheld never gets a face prompt', () => {
  for (const c of sheetBriefs().characters.filter((x) => x.face_withheld)) {
    const p = viewPrompt(c.id, 'front').prompt;
    ok(/FACE NOT SHOWN|hands only|never shown/i.test(p), `${c.id} does not withhold the face`);
  }
});
t('only the front view is an anchor; the others are conditioned on it', () => {
  const p = sheetPlan('VISHVAMITRA');
  ok(p.step_1_anchor.conditioned_on === null, 'the front view is conditioned on something');
  for (const v of p.step_2_views) {
    ok(/anchor/i.test(v.conditioned_on ?? ''), `${v.slot} is not conditioned on the anchor - drift compounds`);
  }
});
t('the sheet order starts with Vishvamitra and says why', () => {
  ok(sheetOrder()[0] === 'VISHVAMITRA', `order starts with ${sheetOrder()[0]}`);
  ok(/fourteen shots|four films/i.test(sheetPlan('VISHVAMITRA').why_first ?? ''), 'the reason for going first is not recorded');
});

// --- creative direction may correct how a thing is shown, never what is true ------
t('an override replaces the phrase it names', () => {
  const r = applyOverrides('07-06', 'a woman\'s hand releasing the edge of a sleeve - hand only');
  ok(!r.text.includes('sleeve'), 'the sleeve survived the override');
  ok(r.text.includes('draped upper cloth'), 'the correction was not applied');
  ok(r.applied.length === 1 && r.applied[0].reason, 'the override was applied without recording why');
});
t('an override leaves other shots alone', () => {
  const r = applyOverrides('01-01', 'a wide shot with a sleeve in it');
  ok(r.text.includes('sleeve'), 'an override for 07-06 altered a different shot');
  ok(r.applied.length === 0, 'an override reported itself applied to the wrong shot');
});
t('an override that claims to change truth is refused', async () => {
  const o = directionOverrides();
  const snapshot = JSON.stringify(o.prompt_overrides);
  try {
    o.prompt_overrides.push({ shot: 'ZZ-99', find: 'a', replace: 'b', changes_truth: true, reason: 'x', class: 'creative' });
    await throws(() => applyOverrides('ZZ-99', 'a'), 'Error', 'an override declaring changes_truth was applied');
  } finally { o.prompt_overrides.length = 0; o.prompt_overrides.push(...JSON.parse(snapshot)); }
});
t('every shipped override is creative, reasoned, and changes no truth', () => {
  const o = directionOverrides();
  const all = [...(o.prompt_overrides ?? []), ...(o.action_overrides ?? [])];
  ok(all.length > 0, 'no overrides are shipped at all');
  for (const x of all) {
    ok(x.changes_truth === false, `override for ${x.shot} does not declare changes_truth: false`);
    ok(x.class === 'creative', `override for ${x.shot} is not classed creative`);
    ok((x.reason ?? '').length > 20, `override for ${x.shot} states no reason`);
  }
});

// --- the contract: every loosened rule keeps its blocked case ----------------------
t('a numeric verse is a locator; a verse holding text is caught', () => {
  ok(passageTextFields({ id: 'p', sarga: 18, verse: 1 }).length === 0, 'a numeric verse number was read as text');
  ok(passageTextFields({ id: 'p', verse: '1-9' }).length === 0, 'a verse range was read as text');
  ok(passageTextFields({ id: 'p', verse: '\u0930\u093e\u092e\u094b \u0930\u093e\u091c\u0940\u0935\u0932\u094b\u091a\u0928\u0903' }).includes('verse'), 'verse text was not caught');
  ok(passageTextFields({ id: 'p', verse_text: 'anything' }).includes('verse_text'), 'verse_text was not caught');
  ok(passageTextFields({ id: 'p', text_held: true }).length > 0, 'text_held:true was not caught');
});
t('a use_policy that permits display, quotation or generation input means text travels', () => {
  ok(textMayTravel({ use_policy: { display_to_viewer: false, quote_in_product: false, generation_input: false } }) === false, 'a fully closed policy read as travelling');
  for (const k of ['display_to_viewer', 'quote_in_product', 'generation_input']) {
    ok(textMayTravel({ use_policy: { [k]: true } }) === true, `a policy permitting ${k} did not read as travelling`);
  }
  ok(textMayTravel({ id: 'x' }) === null, 'a source that says nothing did not read as unstated');
  ok(!sourceStatesTravel({ id: 'x' }), 'a silent source counted as having stated its policy');
});
t('a Dutt section locator identifies a place; an empty one does not', () => {
  ok(locatorIdentifiesAPlace({ sarga: 20, verses: '1-9' }), 'a sarga locator was rejected');
  ok(locatorIdentifiesAPlace({ sarga: null, section: 'XVIII', edition: 'Dutt 1891' }), 'an edition-section locator was rejected');
  ok(!locatorIdentifiesAPlace({ work: 'VR', kanda: 'BALA' }), 'a locator naming no place was accepted');
  ok(!locatorIdentifiesAPlace(null), 'a missing locator was accepted');
  ok(locatorKind({ sarga: null, section: 'XVIII', edition: 'Dutt 1891' }) === 'edition-section', 'edition-section was not recognised');
});
t('an identity record is not a design, but a design is', () => {
  ok(!hasDesign({ id: 'TATAKA', name: 'Tataka', kind: 'person', gate: 'depiction', design: null }), 'an identity record counted as a design');
  ok(!hasDesign({ id: 'X' }), 'an entity with no design key counted as designed');
  ok(hasDesign({ id: 'X', design: { garment: { lower: 'antariya' } } }), 'a real design did not count');
  ok(hasDesign({ id: 'X', design: { skin_albedo: 'LOCK.SKIN.X' } }), 'a skin albedo did not count as design');
});
t('skin must be governed somehow, and whatever governs it forbids lightening', () => {
  const policy = [{ id: 'LOCK.SKIN.POLICY', kind: 'skin_policy', value: null, rule: 'Never lighter than the approved model sheet.' }];
  ok(skinGovernance(policy).kind === 'policy', 'a policy lock was not recognised as governance');
  ok(skinGovernance(policy).measurable === false, 'a policy lock claimed to be measurable');
  ok(forbidsLightening(policy[0]), 'the policy wording was not read as forbidding lightening');
  const perEntity = [{ id: 'L', kind: 'skin_albedo', value: { lab_L: 34 }, rule: 'Never lighten.' }];
  ok(skinGovernance(perEntity).measurable === true, 'a numeric lock was not measurable');
  ok(skinGovernance([]).kind === 'none', 'a graph governing skin nowhere passed');
  ok(!forbidsLightening({ rule: 'Use tasteful skin tones.' }), 'vague wording counted as forbidding lightening');
});
t('Latin is exempt from conjunct probes whether or not it declares a script', () => {
  ok(isLatinScript('en', { script: 'Latin' }), 'declared Latin was not exempt');
  ok(isLatinScript('en', { size_px: 44 }), 'undeclared English was not treated as Latin');
  ok(!isLatinScript('te', { script: 'Telugu' }), 'Telugu was treated as Latin');
  ok(!isLatinScript('hi', {}), 'undeclared Hindi was treated as Latin');
});
t('only an authored film must declare a duration', () => {
  ok(filmNeedsDuration({ id: 'M8', status: 'claims-only' }, false) === false, 'a ledger film was required to have a duration');
  ok(filmNeedsDuration({ id: 'M3', status: 'claims-only' }, true) === true, 'a film with a treatment escaped the duration rule');
  ok(filmNeedsDuration({ id: 'M3', status: 'directed' }, false) === true, 'a film marked directed escaped the duration rule');
});

// --- graph independence: the studio must run on a graph it has never seen ---------
t('the store reads whichever graph is pointed at, not a captured one', () => {
  const before = process.env.PBL_GRAPH;
  ok(before === 'tools/fixtures/graph', 'the regressions are not running against the frozen fixture');
  // ESM evaluates imports before the importing module's body, so a const DATA captured
  // at load would have pinned data/ and this whole suite would test production data.
  ok(dataDir().endsWith('tools/fixtures/graph'), `the store resolved to ${dataDir()}, not the fixture`);
});
t('firstDirected finds a film without being told its id', () => {
  ok(firstDirected() === 'M3', `firstDirected returned ${firstDirected()}`);
});
t('no tool hardcodes a language triple', () => {
  // The graph declares its languages; nothing downstream may assume three, or these.
  const langs = Object.keys(read('narrator').languages);
  ok(langs.length >= 1, 'the graph declares no languages');
  for (const f of ['lib/render.js', 'tools/build_export.js', 'tools/dryrun.js', 'tools/build_packets.py']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    ok(!/'en',\s*'hi',\s*'te'|"en",\s*"hi",\s*"te"/.test(src), `${f} hardcodes the en/hi/te triple`);
  }
});
t('no tool hardcodes a film id as its default', () => {
  for (const f of ['tools/dryrun.js', 'tools/typecheck.js', 'tools/cutcheck.js', 'tools/assemble.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    ok(!/process\.argv\[2\]\s*\?\?\s*'M3'/.test(src), `${f} defaults to the hardcoded film M3`);
  }
});
t('validate.js references no specific claim, film or entity id', () => {
  const src = readFileSync(join(ROOT, 'tools/validate.js'), 'utf8');
  for (const bad of ["'M3'", "'CLM.", "'DASARATHA'", "'TATAKA'", "'05-06'"]) {
    ok(!src.includes(bad), `tools/validate.js hardcodes ${bad} - it would fail on a real graph`);
  }
});
t('the handoff contract exists and names the required files', () => {
  const h = readFileSync(join(ROOT, 'HANDOFF.md'), 'utf8');
  for (const f of ['films.json', 'claims.json', 'entities.json', 'locks.json', 'sheets.json', 'memos.json']) {
    ok(h.includes(f), `HANDOFF.md does not name ${f}`);
  }
  ok(/import_graph/.test(h), 'HANDOFF.md does not say how to hand a graph over');
});

// --- the treatment holds -----------------------------------------------------------
t('M3 still runs 44 seconds', () => {
  const sum = Math.round(treatment('M3').shots.reduce((a, s) => a + s.duration_s, 0) * 1e6) / 1e6;
  ok(sum === 44.0, `M3 runs ${sum}s`);
});
t('the closing line is still three words', () => {
  const t3 = treatment('M3');
  const last = t3.shots[t3.shots.length - 1];
  ok(t3.narration[last.narration].en.split(/\s+/).length === 3, 'the closing line is no longer three words');
});
t('the not-yet-sixteen line keeps its attribution in all three languages', () => {
  const n = treatment('M3').narration.L4;
  ok(/he said/i.test(n.en), 'English lost the attribution');
  ok(n.hi.includes('कहा'), 'Hindi lost the attribution');
  ok(n.te.includes('అన్నాడు'), 'Telugu lost the attribution');
});

// --- reference conditioning ---------------------------------------------------------
// The blocked case beside the allowed one, for a defect that has now happened twice in
// this file's history: a value assembled, recorded, and never sent.

t('a reference-conditioned endpoint carries the sheet in image_url', async () => {
  const fal = await import('../lib/fal.js');
  const p = fal.buildReferencePayload({ prompt: 'x', references: ['SHEET-A'], endpoint: 'fal-ai/flux-pro/kontext/max' });
  ok(p.image_url === 'SHEET-A', 'the single-reference field did not carry the sheet');
  ok(!('image_urls' in p), 'the wrong reference field was also sent');
});

t('an endpoint that reads image_urls is given image_urls, not image_url', async () => {
  const fal = await import('../lib/fal.js');
  const p = fal.buildReferencePayload({ prompt: 'x', references: ['SHEET-A'], endpoint: 'fal-ai/nano-banana/edit' });
  ok(Array.isArray(p.image_urls) && p.image_urls[0] === 'SHEET-A', 'the multi-reference field did not carry the sheet');
  ok(!('image_url' in p), 'image_url was sent to an endpoint that ignores it - fal would return 200 and a text-only picture');
});

t('BLOCKED: a text-to-image endpoint refuses a reference', async () => {
  const fal = await import('../lib/fal.js');
  let threw = null;
  try { fal.buildReferencePayload({ prompt: 'x', references: ['SHEET-A'], endpoint: 'fal-ai/flux-pro/v1.1' }); }
  catch (e) { threw = e; }
  ok(threw, 'flux-pro v1.1 has no reference field and accepted one silently');
  ok(/text-to-image/.test(threw.message), 'the refusal does not say why');
});

t('BLOCKED: an unregistered endpoint refuses rather than guessing', async () => {
  const fal = await import('../lib/fal.js');
  let threw = null;
  try { fal.buildReferencePayload({ prompt: 'x', references: ['S'], endpoint: 'fal-ai/something-new' }); }
  catch (e) { threw = e; }
  ok(threw && /not in lib\/endpoints\.js/.test(threw.message), 'an unknown endpoint was assumed to take a reference');
});

t('BLOCKED: two principals refuse a single-reference endpoint', async () => {
  const fal = await import('../lib/fal.js');
  let threw = null;
  try { fal.buildReferencePayload({ prompt: 'x', references: ['A', 'B'], endpoint: 'fal-ai/flux-pro/kontext' }); }
  catch (e) { threw = e; }
  ok(threw && /takes one reference/.test(threw.message), 'two sheets were silently collapsed to one');
});

t('BLOCKED: reference conditioning with no reference sends nothing', async () => {
  const fal = await import('../lib/fal.js');
  let threw = null;
  try { fal.buildReferencePayload({ prompt: 'x', references: [], endpoint: 'fal-ai/flux-pro/kontext' }); }
  catch (e) { threw = e; }
  ok(threw && /no reference/.test(threw.message), 'an empty reference list was sent as a text-only request');
});

t('the negative prompt still travels on the reference route', async () => {
  const fal = await import('../lib/fal.js');
  const p = fal.buildReferencePayload({ prompt: 'x', references: ['S'], negative: 'plastic skin', endpoint: 'fal-ai/flux-pro/kontext' });
  ok(p.negative_prompt === 'plastic skin', 'the reference route dropped the negative prompt - the exact bug the text route had');
});

t('the endpoint is read per call, not captured at import', async () => {
  const fal = await import('../lib/fal.js');
  const before = process.env.FAL_IMAGE_MODEL;
  process.env.FAL_IMAGE_MODEL = 'fal-ai/bytedance/seedream/v4/edit';
  const got = fal.imageEndpoint();
  if (before === undefined) delete process.env.FAL_IMAGE_MODEL; else process.env.FAL_IMAGE_MODEL = before;
  ok(got === 'fal-ai/bytedance/seedream/v4/edit', 'FAL_IMAGE_MODEL was captured at module load and cannot be changed');
});

t('BLOCKED: a mandated graph plus a text-only endpoint refuses the render', async () => {
  const { referencePlan } = await import('../lib/render.js');
  const policy = { reference_conditioned: true, method: 'reference-conditioned; never text-only', rule: 'r' };
  const cond = { people: ['P'], missing: [], files: ['sheet.png'], usable: [{}] };
  const r = referencePlan({ policy, cond, endpoint: 'fal-ai/flux-pro/v1.1' });
  ok(r.use === false, 'a text-only endpoint was allowed to render a person under a reference-conditioned policy');
  ok(/text-to-image/.test(r.refusal ?? ''), 'the refusal does not name the cause');
});

t('ALLOWED: the same graph on a reference-conditioned endpoint renders', async () => {
  const { referencePlan } = await import('../lib/render.js');
  const policy = { reference_conditioned: true, method: 'reference-conditioned; never text-only', rule: 'r' };
  const cond = { people: ['P'], missing: [], files: ['sheet.png'], usable: [{}] };
  const r = referencePlan({ policy, cond, endpoint: 'fal-ai/flux-pro/kontext/max' });
  ok(r.use === true && !r.refusal, 'a reference-conditioned endpoint with an approved sheet was refused');
});

t('a graph that declares no identity policy is not forced onto the reference route', async () => {
  const { referencePlan } = await import('../lib/render.js');
  // The bundled fixture has no render_policy.json. Absence means unconstrained.
  const r = referencePlan({ policy: { reference_conditioned: false }, cond: { people: ['P'], missing: [], files: [] }, endpoint: 'fal-ai/flux/dev' });
  ok(r.use === false && !r.refusal, 'a graph with no identity policy was refused anyway');
});

t('BLOCKED: an approved-but-fileless sheet refuses rather than falling back to text-only', async () => {
  const { referencePlan } = await import('../lib/render.js');
  const policy = { reference_conditioned: true, method: 'reference-conditioned; never text-only' };
  const r = referencePlan({ policy, cond: { people: ['P'], missing: ['P'], files: [] }, endpoint: 'fal-ai/flux-pro/kontext/max' });
  ok(r.use === false && /no file to send/.test(r.refusal ?? ''), 'a missing sheet file silently became a text-only render');
});

t('every reference-conditioned endpoint is priced and the guesses are marked', async () => {
  const { ENDPOINTS, referenceConditioned } = await import('../lib/endpoints.js');
  const { endpointCost } = await import('../lib/cost.js');
  for (const ep of referenceConditioned()) {
    ok(endpointCost(ep).usd > 0, `${ep} prices at zero`);
    ok(typeof ENDPOINTS[ep].estimated === 'boolean', `${ep} does not say whether its price was confirmed`);
  }
});

// --- run ---------------------------------------------------------------------------
let pass = 0; const failures = [];
for (const test of tests) {
  try { await test.fn(); pass++; }
  catch (e) { failures.push({ name: test.name, error: e.message }); }
}
console.log(`\nREGRESS - ${tests.length} regressions\n`);
if (failures.length) {
  console.log(`  ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ${f.name}\n      ${f.error}`);
  console.log('');
  process.exit(1);
}
console.log(`  all ${pass} green\n`);

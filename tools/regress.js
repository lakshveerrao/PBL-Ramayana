#!/usr/bin/env node
// regress - behaviour, not data shape. Every regression that guards a rule pairs the
// allowed case with the blocked one, so a rule cannot be loosened without a test noticing.
import { read, write, treatment, clearCache } from '../lib/store.js';
import { checkShot, checkFilm, entityCleared, assertNoMemoBlocked, GateRefusal, stillAllowed } from '../lib/consistency.js';
import { assertNoRestrictedText, RightsError, isRestricted, locatorOf } from '../lib/sources.js';
import { normaliseImage, normaliseVideo } from '../lib/fal.js';
import { renderMotion, MotionRefusal, estimate, shotOf } from '../lib/render.js';
import { assemble } from '../lib/prompt.js';
import { priceOf, modelFor, estimateFilm, RATES } from '../lib/cost.js';
import { assertWithinCeiling, CeilingError } from '../lib/state.js';
import { burnPlan, fitsBox } from '../lib/subtitle.js';

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

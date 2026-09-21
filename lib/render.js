// render.js - the render layer. Holds the three refusals that matter:
//   1. the consistency gate (no approved sheet, no shot)
//   2. the motion refusal (a shot marked no-motion refuses, in code)
//   3. the ceiling (nothing spends without an estimate first)
import { read, treatment, ensureDir, ROOT } from './store.js';
import { effectsShots, rejectionCriteria } from './graph.js';
import { assemble } from './prompt.js';
import { checkFilm, checkShot, GateRefusal, isPerson } from './consistency.js';
import { assertWithinCeiling, recordSpend } from './state.js';
import { UNIT, endpointCost } from './cost.js';
import * as providers from './providers.js';
import { spendAllowed } from './env.js';
import { imageEndpoint } from './fal.js';
import { acceptsReference, describe as describeEndpoint } from './endpoints.js';
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A fourth refusal, and the graph asked for it in writing:
//   render_policy.identity.method = "reference-conditioned; never text-only"
// The studio could not honour it, so it did the next worst thing - generated text-only
// and wrote the sheet files into the record under "references" anyway.
export class ReferenceRefusal extends Error {
  constructor(message, detail) { super(message); this.name = 'ReferenceRefusal'; this.detail = detail; }
}

export class MotionRefusal extends Error {
  constructor(message, detail) { super(message); this.name = 'MotionRefusal'; this.detail = detail; }
}

export function shotOf(filmId, shotId) {
  const t = treatment(filmId);
  if (!t) throw new Error(`film ${filmId} has no treatment`);
  const s = t.shots.find((x) => x.id === shotId);
  if (!s) throw new Error(`film ${filmId} has no shot ${shotId}`);
  return s;
}

// Nothing spends without this being answerable first.
export function estimate(filmId) {
  const t = treatment(filmId);
  const gate = checkFilm(t.shots);
  const gen = t.shots.filter((s) => s.source === 'generate');
  const motionShots = Object.entries(effectsShots())
    .filter(([, v]) => v.film === filmId && v.motion === true);

  // Price the endpoint that is actually configured, not a flat rate. Every estimate
  // was wrong the moment FAL_IMAGE_MODEL changed.
  const endpoint = imageEndpoint();
  const priced = endpointCost(endpoint);
  const image_usd = gen.length * priced.usd;
  const motion_usd = motionShots.length * UNIT.motion.usd;
  // Languages come from the graph, never from a hardcoded triple: a graph may ship
  // two languages or five.
  const langs = Object.keys(read('narrator').languages);
  const chars = Object.values(t.narration)
    .reduce((a, n) => a + langs.reduce((b, l) => b + (n[l] ?? '').length, 0), 0);
  const voice_usd = chars * UNIT.voice.usd;

  return {
    film: filmId,
    shots_total: t.shots.length,
    shots_to_generate: gen.length,
    shots_reused: t.shots.length - gen.length,
    motion_clips: motionShots.length,
    voice_characters: chars,
    usd: { image: r(image_usd), motion: r(motion_usd), voice: r(voice_usd), total: r(image_usd + motion_usd + voice_usd) },
    gate: { allowed: gate.allowed, blocked: gate.blocked, of: gate.total, still_allowed: gate.still_allowed },
    endpoint: {
      name: endpoint,
      usd_each: priced.usd,
      price_known: priced.known,
      reference_conditioned: acceptsReference(endpoint),
      ...(describeEndpoint(endpoint)?.note ? { note: describeEndpoint(endpoint).note } : {}),
    },
    identity: identityPolicy(),
    note: 'Estimate only. Nothing has been spent. Gate refusals are not deducted - a blocked shot costs nothing because it does not run.',
  };
}

export async function renderShot(filmId, shotId, { allow_spend = null } = {}) {
  const shot = shotOf(filmId, shotId);

  if (shot.source !== 'generate') {
    return { skipped: true, reason: `shot ${shotId} is source=${shot.source}, not generate`, shot: shotId };
  }

  // Gate 1: consistency. Refuses; does not warn.
  const gate = checkShot(shot);
  if (!gate.allowed) {
    throw new GateRefusal(`shot ${shotId} refused by the consistency gate: ${gate.reason}`, gate);
  }

  // Prompt is assembled, never hand-written. This also runs the memo gate.
  const { prompt, negative, negatives } = assemble(shot, filmId);

  // Gate 4: reference conditioning. If the graph says identity comes from the approved
  // sheet, the sheet has to travel in the request - not just into the record.
  const policy = identityPolicy();
  const cond = conditioningFor(shot);
  const endpoint = imageEndpoint();
  const plan = referencePlan({ policy, cond, endpoint });
  if (plan.refusal) throw new ReferenceRefusal(`shot ${shotId}: ${plan.refusal}`, { shot: shotId, endpoint, ...plan.detail });
  const useReference = plan.use;

  // Gate 3: the ceiling, and the estimate before the spend.
  const priced = endpointCost(endpoint);
  const est = priced.usd;
  assertWithinCeiling(est);
  const permitted = allow_spend === null ? spendAllowed() : allow_spend;
  if (!permitted) {
    return {
      would_spend: est, spent: false, shot: shotId, prompt,
      endpoint, endpoint_price_known: priced.known,
      conditioned_on: useReference ? cond.files : [],
      reason: 'ALLOW_SPEND is not 1. This is the estimate; nothing was sent.',
    };
  }

  const args = { prompt, negative, seed: seedFor(filmId, shotId), width: 1080, height: 1920 };
  const out = useReference
    ? await providers.image.generateFromReference({ ...args, references: cond.files })
    : await providers.image.generate(args);
  recordSpend({ provider: 'fal', route: 'image', model: out.model_version, label: `${filmId}/${shotId}`, usd: est, estimate_usd: est });

  const record = {
    film: filmId, shot: shotId,
    prompt, negatives,
    seed: out.seed ?? seedFor(filmId, shotId),
    provider: 'fal', model_version: out.model_version, endpoint,
    // Two different claims, and collapsing them is how a text-only render came to be
    // recorded as reference-conditioned. conditioned_on is what was SENT.
    conditioned_on: useReference ? cond.files : [],
    text_only: !useReference,
    identity_policy: policy.method,
    references: referencesFor(shot),
    url: out.url,
    prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
    at: new Date().toISOString(),
  };
  saveRecord(filmId, shotId, record);
  return { spent: true, usd: est, ...record };
}

// The motion refusal. A shot whose instruction says NO MOTION refuses here, in code.
export async function renderMotion(filmId, shotId, { allow_spend = null } = {}) {
  const effects = read('effects', { fresh: true });
  const spec = effectsShots()[shotId];

  if (!spec) throw new Error(`no motion instruction for shot ${shotId} in data/effects.json`);
  if (spec.film !== filmId) throw new Error(`shot ${shotId} does not belong to ${filmId}`);

  if (spec.motion === false || /NO MOTION/i.test(spec.instruction)) {
    throw new MotionRefusal(
      `shot ${shotId} refuses motion: ${spec.instruction}`,
      { shot: shotId, instruction: spec.instruction, refusal_note: spec.refusal_note ?? null },
    );
  }

  const shot = shotOf(filmId, shotId);
  const gate = checkShot(shot);
  if (!gate.allowed) throw new GateRefusal(`shot ${shotId} refused by the consistency gate: ${gate.reason}`, gate);

  const still = loadRecord(filmId, shotId);
  if (!still) throw new Error(`shot ${shotId} has no approved still yet - motion needs a frame to move`);

  const est = UNIT.motion.usd;
  assertWithinCeiling(est);
  const permitted = allow_spend === null ? spendAllowed() : allow_spend;
  if (!permitted) return { would_spend: est, spent: false, shot: shotId, instruction: spec.instruction, reason: 'ALLOW_SPEND is not 1.' };

  const out = await providers.motion.generate({ image_url: still.url, prompt: spec.instruction, duration_s: shot.duration_s });
  recordSpend({ provider: 'fal', route: 'motion', model: out.model_version, label: `${filmId}/${shotId}`, usd: est, estimate_usd: est });
  return { spent: true, usd: est, shot: shotId, url: out.url, instruction: spec.instruction, criteria: rejectionCriteria() };
}

function seedFor(filmId, shotId) {
  // Deterministic per shot, so a re-run reproduces rather than re-rolls.
  const h = createHash('sha256').update(`${filmId}/${shotId}`).digest();
  return h.readUInt32BE(0);
}

// The decision itself, separated from the render so it can be tested without a graph,
// a key or a spend. An inline decision inside an async paid path is a decision nothing
// ever checks.
export function referencePlan({ policy, cond, endpoint }) {
  if (!policy.reference_conditioned) return { use: false, refusal: null, detail: {} };
  if (cond.people.length === 0) return { use: false, refusal: null, detail: { reason: 'no people in frame' } };
  if (cond.missing.length) {
    // The consistency gate should already have caught this; if it has not, refuse
    // rather than fall back to text-only.
    return {
      use: false,
      refusal: `needs the approved sheet for ${cond.missing.join(', ')} and there is no file to send`,
      detail: { missing: cond.missing, policy: policy.method },
    };
  }
  if (!acceptsReference(endpoint)) {
    return {
      use: false,
      refusal: `${endpoint} is text-to-image and the graph says identity is ${policy.method}. Set FAL_IMAGE_MODEL to a reference-conditioned endpoint (see lib/endpoints.js) before rendering a shot with people in it.`,
      detail: { policy: policy.method, rule: policy.rule, entities: cond.people },
    };
  }
  return { use: true, refusal: null, detail: { files: cond.files } };
}

// What the graph says about identity, if it says anything. A graph without a
// render_policy.json is not wrong - the bundled fixture has none - so absence means
// "unconstrained", never "reference-conditioned".
export function identityPolicy() {
  let rp = null;
  try { rp = read('render_policy'); } catch { /* optional */ }
  const method = String(rp?.identity?.method ?? '');
  return {
    declared: Boolean(method),
    reference_conditioned: /reference-conditioned/i.test(method),
    never_text_only: /never text-only/i.test(method),
    method: method || null,
    rule: rp?.identity?.rule ?? null,
  };
}

// The sheet files that would actually be SENT, as distinct from the sheet records that
// merely exist. Only approved sheets with files qualify: an approved sheet with no file
// conditions nothing.
export function conditioningFor(shot) {
  const sheets = read('sheets', { fresh: true });
  const people = (shot.entities ?? []).filter(isPerson);
  const found = people.map((e) => {
    const s = sheets.sheets.find((x) => x.entity === e);
    return { entity: e, approved: Boolean(s?.approved), files: s?.files ?? [] };
  });
  return {
    people,
    usable: found.filter((f) => f.approved && f.files.length > 0),
    missing: found.filter((f) => !(f.approved && f.files.length > 0)).map((f) => f.entity),
    files: found.filter((f) => f.approved && f.files.length > 0).flatMap((f) => f.files),
  };
}

function referencesFor(shot) {
  const sheets = read('sheets');
  return (shot.entities ?? []).map((e) => {
    const s = sheets.sheets.find((x) => x.entity === e);
    return { entity: e, sheet_files: s?.files ?? [], sheet_hashes: s?.hashes ?? [], approved_by: s?.approved_by ?? null };
  });
}

function recordPath(filmId, shotId) {
  ensureDir(`renders/${filmId}`);
  return join(ROOT, 'renders', filmId, `${shotId}.json`);
}
function saveRecord(filmId, shotId, record) {
  writeFileSync(recordPath(filmId, shotId), JSON.stringify(record, null, 2) + '\n', 'utf8');
}
export function loadRecord(filmId, shotId) {
  const p = recordPath(filmId, shotId);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function r(n) { return Math.round(n * 1e6) / 1e6; }

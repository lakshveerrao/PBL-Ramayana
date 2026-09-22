// render.js - the render layer. Holds the three refusals that matter:
//   1. the consistency gate (no approved sheet, no shot)
//   2. the motion refusal (a shot marked no-motion refuses, in code)
//   3. the ceiling (nothing spends without an estimate first)
import { read, treatment, ensureDir, assetsDir, ROOT } from './store.js';
import { effectsShots, rejectionCriteria, entityReferences } from './graph.js';
import { assemble, foldNegatives } from './prompt.js';
import { checkFilm, checkShot, GateRefusal, isPerson } from './consistency.js';
import { assertWithinCeiling, recordSpend } from './state.js';
import { UNIT } from './cost.js';
import * as providers from './providers.js';
import { spendAllowed } from './env.js';
import { acceptsReference } from './endpoints.js';
import { decodeInline } from './fal.js';

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
  // Priced on the provider that will actually serve it, not on whichever adapter
  // happened to be imported here.
  // Price each shot on the references IT will actually send. A flat `references: 1`
  // under-reported M2 by 48% - $0.2827 estimated against $0.4180 billed - because four
  // of the eleven shots carry two references and two carry four. An estimate that is
  // only right for the cheapest shot in the film is not an estimate.
  const priced = providers.image.cost({ references: 1 });
  const endpoint = priced.endpoint;
  let image_usd = 0;
  const per_shot = [];
  for (const s of gen) {
    let refs = 1;
    try { refs = Math.max(1, conditioningFor(s).files.length); } catch { /* priced as one */ }
    const usd = providers.image.cost({ references: refs }).usd;
    per_shot.push({ shot: s.id, references: refs, usd: r(usd) });
    image_usd += usd;
  }
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
    per_shot,
    gate: { allowed: gate.allowed, blocked: gate.blocked, of: gate.total, still_allowed: gate.still_allowed },
    endpoint: {
      name: endpoint,
      usd_each: priced.usd,
      price_known: priced.known,
      reference_conditioned: priced.reference_conditioned,
      ...(priced.note ? { note: priced.note } : {}),
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
  const priced = providers.image.cost({ references: cond.files.length });
  const endpoint = priced.endpoint;
  const plan = referencePlan({ policy, cond, endpoint, accepts: priced.reference_conditioned });
  if (plan.refusal) throw new ReferenceRefusal(`shot ${shotId}: ${plan.refusal}`, { shot: shotId, endpoint, ...plan.detail });
  const useReference = plan.use;

  // Gate 3: the ceiling, and the estimate before the spend.
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

  // A provider with no negative_prompt field gets the terms in the prompt body instead.
  // Recorded either way: a term that was dropped must never read like one enforced.
  const negSupported = providers.image.supportsNegative();
  const folded = negSupported ? null : foldNegatives(prompt, negative);
  const sentPrompt = folded ? folded.prompt : prompt;
  const args = {
    prompt: sentPrompt,
    negative: negSupported ? negative : null,
    seed: seedFor(filmId, shotId), width: 1080, height: 1920,
  };
  const out = useReference
    ? await providers.image.generateFromReference({ ...args, references: cond.files })
    : await providers.image.generate(args);
  recordSpend({ provider: 'fal', route: 'image', model: out.model_version, label: `${filmId}/${shotId}`, usd: est, estimate_usd: est });

  // Write the bytes down. The record was keeping the whole image as a data URI - a
  // multi-megabyte JSON file that lib/assemble.js could not use, because it looks for a
  // local_path or a still on disk. A render nothing can find is not a render.
  const inline = decodeInline(out.url);
  let local_path = null, sha256 = null;
  if (inline) {
    const ext = inline.contentType.includes('png') ? 'png' : 'jpg';
    const dir = ensureDir(`${assetsDir()}/stills/${filmId}`);
    local_path = `${assetsDir()}/stills/${filmId}/${shotId}.${ext}`;
    writeFileSync(join(ROOT, local_path), inline.bytes);
    sha256 = createHash('sha256').update(inline.bytes).digest('hex');
  }

  const record = {
    film: filmId, shot: shotId,
    local_path, sha256, bytes: inline ? inline.bytes.length : null,
    generated_size: out.generated_size ?? null,
    frame: out.frame ?? null,
    needs_scale_to_frame: out.needs_scale_to_frame ?? null,
    prompt: sentPrompt,
    prompt_as_assembled: folded ? prompt : undefined,
    negatives,
    negative_handling: folded
      ? { method: 'folded into the prompt body', folded: folded.folded,
          dropped_as_already_stated: folded.dropped_as_already_stated,
          dropped_for_length: folded.dropped_for_length, note: folded.note }
      : { method: 'negative_prompt field' },
    seed: out.seed ?? seedFor(filmId, shotId),
    provider: 'fal', model_version: out.model_version, endpoint,
    // Two different claims, and collapsing them is how a text-only render came to be
    // recorded as reference-conditioned. conditioned_on is what was SENT.
    conditioned_on: useReference ? cond.files : [],
    conditioned_on_sheets: useReference ? cond.sheet_files : [],
    conditioned_on_places: useReference ? cond.place_files : [],
    text_only: !useReference,
    identity_policy: policy.method,
    references: referencesFor(shot),
    url: inline ? '(inline; written to local_path)' : out.url,
    prompt_sha256: createHash('sha256').update(sentPrompt).digest('hex'),
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
// `accepts` is the PROVIDER's answer, not a lookup in fal's endpoint registry. Asking
// lib/endpoints.js whether "gpt-image-2" takes a reference returns false - it is a fal
// table and gpt-image-2 is not in it - and every shot with a person in it was refused
// on the grounds that the endpoint is text-to-image. It is not. Same mistake as pricing
// M1 at fal-ai/flux/dev: a fal helper applied to an OpenAI endpoint.
export function referencePlan({ policy, cond, endpoint, accepts = null }) {
  if (!policy.reference_conditioned) return { use: false, refusal: null, detail: {} };
  if (cond.people.length === 0) {
    // No principal, but a hall still has a look. Condition on it rather than inventing
    // a new room for every establishing shot.
    if (cond.place_files?.length) return { use: true, refusal: null, detail: { files: cond.place_files, places_only: true } };
    return { use: false, refusal: null, detail: { reason: 'no people and no place reference' } };
  }
  if (cond.missing.length) {
    // The consistency gate should already have caught this; if it has not, refuse
    // rather than fall back to text-only.
    return {
      use: false,
      refusal: `needs the approved sheet for ${cond.missing.join(', ')} and there is no file to send`,
      detail: { missing: cond.missing, policy: policy.method },
    };
  }
  const takesReference = accepts ?? acceptsReference(endpoint);
  if (!takesReference) {
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
  const all = shot.entities ?? [];

  // A person needs an APPROVED SHEET, and the gate refuses the shot without one.
  const withSheet = new Set(sheets.sheets.map((s) => s.entity));
  const people = all.filter((e) => isPerson(e) && withSheet.has(e));
  const found = people.map((e) => {
    const s = sheets.sheets.find((x) => x.entity === e);
    return { entity: e, approved: Boolean(s?.approved), files: s?.files ?? [] };
  });

  // A place or a crowd carries a reference and no identity. It is never a sheet, never
  // clears anybody, and its absence never blocks a shot - it only changes how the shot
  // is drawn. The hall is the same hall in all seven films because of this.
  const place = entityReferences(all.filter((e) => !people.includes(e)));

  const sheetFiles = found.filter((f) => f.approved && f.files.length > 0).flatMap((f) => f.files);
  return {
    people,
    usable: found.filter((f) => f.approved && f.files.length > 0),
    missing: found.filter((f) => !(f.approved && f.files.length > 0)).map((f) => f.entity),
    sheet_files: sheetFiles,
    place_files: place.map((p) => p.file),
    place_refs: place,
    // What is actually SENT: the people's sheets, then the hall and the crowd.
    files: [...sheetFiles, ...place.map((p) => p.file)],
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

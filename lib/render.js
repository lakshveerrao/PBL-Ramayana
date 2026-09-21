// render.js - the render layer. Holds the three refusals that matter:
//   1. the consistency gate (no approved sheet, no shot)
//   2. the motion refusal (a shot marked no-motion refuses, in code)
//   3. the ceiling (nothing spends without an estimate first)
import { read, treatment, ensureDir, ROOT } from './store.js';
import { effectsShots, rejectionCriteria } from './graph.js';
import { assemble } from './prompt.js';
import { checkFilm, checkShot, GateRefusal } from './consistency.js';
import { assertWithinCeiling, recordSpend } from './state.js';
import { UNIT } from './cost.js';
import * as providers from './providers.js';
import { spendAllowed } from './env.js';
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  const image_usd = gen.length * UNIT.image.usd;
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

  // Gate 3: the ceiling, and the estimate before the spend.
  const est = UNIT.image.usd;
  assertWithinCeiling(est);
  const permitted = allow_spend === null ? spendAllowed() : allow_spend;
  if (!permitted) {
    return {
      would_spend: est, spent: false, shot: shotId, prompt,
      reason: 'ALLOW_SPEND is not 1. This is the estimate; nothing was sent.',
    };
  }

  const out = await providers.image.generate({ prompt, negative, seed: seedFor(filmId, shotId), width: 1080, height: 1920 });
  recordSpend({ provider: 'fal', route: 'image', model: out.model_version, label: `${filmId}/${shotId}`, usd: est, estimate_usd: est });

  const record = {
    film: filmId, shot: shotId,
    prompt, negatives,
    seed: out.seed ?? seedFor(filmId, shotId),
    provider: 'fal', model_version: out.model_version,
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

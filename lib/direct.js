// direct.js - the director harness.
// The treatment is the standard. When the model's output drifts from the contract,
// THIS file is what gets fixed - never the treatment, and never the contract.
import { read, treatment, film } from './store.js';
import { agent } from './agents.js';
import { assertNoRestrictedText, locatorOf } from './sources.js';
import * as providers from './providers.js';
import { estimateFilm } from './cost.js';
import { assertWithinCeiling } from './state.js';
import { spendAllowed } from './env.js';

// What the director must return. Drift from this is a harness problem.
export const CONTRACT = {
  durations_sum_exactly: true,
  whole_frames_at_30fps: true,
  max_words_per_line: 12,
  english_only: true,
};

export function briefFor(filmId) {
  const f = film(filmId);
  const claims = read('claims').claims.filter((c) => c.film === filmId);
  const accepted = claims.filter((c) => c.state === 'accepted');
  const held = claims.filter((c) => c.state !== 'accepted');

  // Locators travel; text does not. The brief carries no verse text at all.
  const claimLines = accepted.map((c) => {
    const l = locatorOf(c);
    const where = l ? `${l.kanda} ${l.sarga}.${l.verses}` : 'no locator - this is ours';
    const who = c.speaker ? ` SPOKEN BY ${c.speaker} - the line must keep the attribution.` : '';
    return `- [${c.evidence_class}] ${c.id}: ${c.text} (${where})${who}`;
  });

  const heldLines = held.map((c) => `- [${c.evidence_class}/${c.state}] ${c.id}: ${c.text}${c.silence_note ? ` -- ${c.silence_note}` : ''}${c.disposition_note ? ` -- ${c.disposition_note}` : ''}`);

  const entities = read('entities').entities
    .filter((e) => e.appears_in.includes(filmId))
    .map((e) => `- ${e.id} (${e.name_en}): ${e.design.age_reading}`);

  const standard = treatment('M3');

  return [
    `FILM ${f.id} - "${f.title_en}"`,
    `${f.kanda} sarga ${f.sarga}. ${f.duration_s} seconds at 30fps, 1080x1920.`,
    '',
    'ACCEPTED CLAIMS - these and only these may be staged as what happens:',
    ...claimLines,
    '',
    'NOT ACCEPTED - do not stage these as the text:',
    ...(heldLines.length ? heldLines : ['- none']),
    '',
    'WHO MAY APPEAR:',
    ...entities,
    '',
    `THE BAR - this is a directed film of the same length, and the standard your output is judged against:`,
    JSON.stringify({ shots: standard.shots.map((s) => ({ id: s.id, duration_s: s.duration_s, size: s.size, lens_mm: s.lens_mm, source: s.source, narration: s.narration })), narration: Object.fromEntries(Object.entries(standard.narration).map(([k, v]) => [k, v.en])) }, null, 1),
    '',
    `Return JSON only. Durations must sum to exactly ${f.duration_s}. Every duration must be a multiple of 1/30 second.`,
  ].join('\n');
}

// Where the model drifts, we repair rather than reject - but we report every repair,
// so the drift is visible and the harness can be fixed properly.
export function reconcile(out, filmId) {
  const f = film(filmId);
  const FPS = 30;
  const repairs = [];
  let shots = Array.isArray(out?.shots) ? out.shots.map((s) => ({ ...s })) : [];

  if (!shots.length) return { ok: false, problems: ['the director returned no shots'], repairs, shots, narration: {} };

  // Work in whole frames throughout. Seconds are a presentation detail: doing the
  // arithmetic in floats is what produced a 44.00000033s film the first time.
  const targetFrames = Math.round(f.duration_s * FPS);

  for (const s of shots) {
    const exact = (s.duration_s ?? 0) * FPS;
    s._frames = Math.max(1, Math.round(exact));
    if (Math.abs(exact - s._frames) > 1e-9) {
      repairs.push(`shot ${s.id}: ${s.duration_s}s was not a whole number of frames, quantised to ${s._frames} frames (${fmt(s._frames, FPS)}s)`);
    }
  }

  // The total must land exactly. Absorb the difference in the longest shot rather than
  // rescaling everything, which would move every cut.
  let sumFrames = shots.reduce((a, s) => a + s._frames, 0);
  if (sumFrames !== targetFrames) {
    const delta = targetFrames - sumFrames;
    const target = shots.reduce((a, b) => (b._frames > a._frames ? b : a));
    const was = target._frames;
    target._frames += delta;
    if (target._frames <= 0) {
      return { ok: false, problems: [`durations summed to ${fmt(sumFrames, FPS)}s and cannot be reconciled to ${f.duration_s}s`], repairs, shots, narration: {} };
    }
    repairs.push(`total was ${fmt(sumFrames, FPS)}s, not ${f.duration_s}s: absorbed ${delta > 0 ? '+' : ''}${delta} frame(s) into the longest shot ${target.id} (${fmt(was, FPS)}s -> ${fmt(target._frames, FPS)}s)`);
    sumFrames = shots.reduce((a, s) => a + s._frames, 0);
  }

  // Starts are recomputed from frames. The model's starts are advisory.
  let runFrames = 0;
  for (const s of shots) {
    s.duration_s = fmt(s._frames, FPS);
    s.duration_frames = s._frames;
    s.start_s = fmt(runFrames, FPS);
    s.start_frame = runFrames;
    runFrames += s._frames;
    delete s._frames;
  }

  // Normalise the narration map, whatever shape it came back in.
  const narration = {};
  const raw = out.narration ?? {};
  for (const [k, v] of Object.entries(raw)) {
    narration[k] = typeof v === 'string' ? { shot: null, en: v, speaker: null } : { shot: v.shot ?? null, en: v.en ?? v.text ?? '', speaker: v.speaker ?? null };
  }
  for (const s of shots) {
    if (s.narration && !narration[s.narration]) repairs.push(`shot ${s.id} names narration ${s.narration}, which the director did not return`);
    if (s.narration && narration[s.narration] && !narration[s.narration].shot) narration[s.narration].shot = s.id;
  }

  const problems = [];
  if (runFrames !== targetFrames) problems.push(`durations sum to ${runFrames} frames, not ${targetFrames}`);
  for (const [id, n] of Object.entries(narration)) {
    const words = (n.en ?? '').split(/\s+/).filter(Boolean).length;
    if (words > CONTRACT.max_words_per_line) problems.push(`narration ${id} is ${words} words, over the ${CONTRACT.max_words_per_line} word limit`);
  }
  return { ok: problems.length === 0, problems, repairs, shots, narration, total_frames: runFrames };
}

// Frames to seconds, rounded to the precision a 30fps timeline can actually express.
function fmt(frames, fps) { return Math.round((frames / fps) * 1e6) / 1e6; }

export async function direct(filmId, { allow_spend = null, rounds = 1 } = {}) {
  const est = estimateFilm({ first_film: false });
  assertWithinCeiling(est.usd);
  const permitted = allow_spend === null ? spendAllowed() : allow_spend;

  const system = agent('director');
  const user = briefFor(filmId);
  assertNoRestrictedText({ system, user }, 'director brief');

  if (!permitted) {
    return {
      spent: false, would_spend: est.usd, film: filmId,
      reason: 'ALLOW_SPEND is not 1. This is the estimate and the brief; nothing was sent.',
      estimate: est, brief_chars: user.length,
    };
  }

  const res = await providers.text.call({ route: 'direct', system, user, max_tokens: 8000, label: `direct/${filmId}` });
  const parsed = parseJson(res.text);
  if (!parsed) return { spent: true, film: filmId, ok: false, problems: ['the director did not return parseable JSON'], raw: res.text.slice(0, 600), price: res.price };

  const rec = reconcile(parsed, filmId);
  const critics = await runCritics(filmId, rec, permitted);

  return { spent: true, film: filmId, ...rec, critics, price: res.price, usage: res.usage, model: res.model };
}

export async function runCritics(filmId, rec, permitted) {
  if (!permitted) return { skipped: true, reason: 'ALLOW_SPEND is not 1' };
  const payload = JSON.stringify({ shots: rec.shots, narration: rec.narration }, null, 1);
  const claims = read('claims').claims.filter((c) => c.film === filmId)
    .map((c) => `[${c.evidence_class}/${c.state}] ${c.id}: ${c.text}`).join('\n');

  const [reg, ev] = await Promise.all([
    providers.text.call({ route: 'critic-register', system: agent('critic-register'), user: payload, max_tokens: 2000, label: `critic-register/${filmId}` }),
    providers.text.call({ route: 'critic-evidence', system: agent('critic-evidence'), user: `CLAIMS:\n${claims}\n\nTREATMENT:\n${payload}`, max_tokens: 2000, label: `critic-evidence/${filmId}` }),
  ]);

  return {
    register: parseJson(reg.text) ?? { verdict: 'unparsed', raw: reg.text.slice(0, 400) },
    evidence: parseJson(ev.text) ?? { verdict: 'unparsed', raw: ev.text.slice(0, 400) },
    price: { register: reg.price.usd, evidence: ev.price.usd },
  };
}

export function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fall through */ }
  // Models fence JSON. Strip the fence rather than rejecting the round.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* fall through */ } }
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch { /* fall through */ } }
  return null;
}

function round(n) { return Math.round(n * 1e6) / 1e6; }

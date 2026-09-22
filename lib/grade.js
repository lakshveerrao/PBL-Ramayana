// grade.js - the grade as an ffmpeg filter chain, built from data/grade.json.
// The rule that matters: no global move may lighten a face. The global lift is applied,
// then the skin band is restored, and tools/gradecheck.js measures that the locked skin
// albedo comes out within its tolerance. It is checked, not asserted.
import { read, ROOT, treatment } from './store.js';
import { skinGovernance } from './contract.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gradeNumbers } from './graph.js';

export function chain() {
  const g = gradeNumbers();

  // Black point to IRE 3, white to IRE 92. In 0..1 terms for the luma curve.
  const blackOut = g.black_point_ire / 100;
  const whiteOut = g.white_point_ire / 100;

  const parts = [];

  // Order matters. The colour work happens first and the levels are set last: warming
  // the shadows lifts the floor, so a black point set before it does not survive.

  // 1. Warm the shadows with per-channel curves whose endpoints are PINNED at 0 and 1.
  //    colorbalance=rs/gs/bs lifts pure black off the floor, which then survives every
  //    later stage and puts the black point at IRE 6.7 instead of 3. Pinning the
  //    endpoints warms the low midtones and leaves black at black.
  //    Never blue: the blue curve is pulled down at the same pivot the red is lifted.
  //    The curve REJOINS the diagonal before it reaches skin. A three-point tint curve
  //    stays above the diagonal through the midtones and lightens every face.
  const k = g.shadow_tint.strength;
  const piv = g.shadow_tint.pivot;
  const rejoin = g.shadow_tint.rejoin;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  parts.push([
    `curves=r='0/0 ${piv}/${clamp(piv + k * 0.55).toFixed(4)} ${rejoin}/${rejoin} 1/1'`,
    `g='0/0 ${piv}/${clamp(piv + k * 0.12).toFixed(4)} ${rejoin}/${rejoin} 1/1'`,
    `b='0/0 ${piv}/${clamp(piv - k * 0.60).toFixed(4)} ${rejoin}/${rejoin} 1/1'`,
  ].join(':'));

  // 2. Highlight rolloff.
  parts.push(`curves=all='0/0 ${g.highlight_rolloff.knee.toFixed(2)}/${(g.highlight_rolloff.knee * 0.97).toFixed(3)} 1/0.985'`);

  // 3. Saturation.
  parts.push(`eq=saturation=${g.saturation.global}`);

  // 4. The skin qualifier. The reds and yellows carry skin, so the global move is
  //    compensated back out of those bands rather than left to ride through them.
  if (g.skin_qualifier.enabled && g.skin_qualifier.protection === 'hold') {
    const hold = g.skin_qualifier.hold_black;
    parts.push(`selectivecolor=reds=0 0 0 ${hold}:yellows=0 0 0 ${hold}`);
  }

  // 5. Levels last, so the black point actually lands where it is asked to.
  parts.push(`curves=all='0/${blackOut.toFixed(4)} 0.5/${(blackOut + (whiteOut - blackOut) * 0.5).toFixed(4)} 1/${whiteOut.toFixed(4)}'`);

  return parts.join(',');
}

export function grainChain() {
  const g = gradeNumbers().grain;
  if (!g.enabled) return null;
  // Applied last, after the grade and before the subtitle burn, so the caption does
  // not sit in the grain.
  // ffmpeg's noise filter takes 0..100. Clamp so a graph on an unexpected scale
  // degrades to a sane grain rather than failing the whole render.
  const alls = Math.max(1, Math.min(100, Math.round(g.strength * 100)));
  return `noise=alls=${alls}:allf=t+u`;
}

export function describe() {
  const g = gradeNumbers();
  return {
    black_point_ire: g.black_point_ire,
    shadow_direction: g.shadow_tint.direction,
    never_blue: /never blue/i.test(g.shadow_tint.rule),
    skin_protected: g.skin_qualifier.enabled && g.skin_qualifier.protection === 'hold',
    grain_before_captions: /before the subtitle/i.test(g.grain.note),
    chain: chain(),
    grain: grainChain(),
  };
}

// A per-shot EXPOSURE trim, applied to that shot's segment before the film's grade.
//
// A still that arrives brighter than the shot beside it breaks the cut: two frames of
// the same room at the same hour read as two mornings. The fix is exposure, and only
// exposure - a gain in LINEAR light, applied identically to R, G and B, which scales
// luminance and leaves chromaticity exactly where it was. Anything applied to the
// sRGB-encoded values instead is a gamma move wearing an exposure's name: it bends the
// tone curve and shifts saturation with it.
//
// So: decode sRGB to linear, multiply, encode back. The filter is a 256-entry LUT, the
// same 8-bit precision as every other stage of the grade.
//
// A trim may darken freely. It may also LIGHTEN - a shot can be genuinely too dark, and
// the director's rule is that the protection belongs on skin, not on exposure
// (Venkat, 2026-09-22). So a lightening trim is allowed exactly when the skin check can
// actually see the shot and passes it.
//
// That "actually" is doing work. data/locks.json governs skin by POLICY and carries no
// numbers - lib/contract.js skinGovernance() reports measurable: false - so today both
// gradecheck and cutcheck print their skin columns as "(no principal)" and NOT MEASURED.
// A check that is not looking cannot clear anything, so a lightening trim is refused
// while that holds, and the refusal says so: it is the check that is missing, not a ban
// on lightening. The moment a numeric skin albedo exists for a shot's principals, the
// same trim is allowed if the measurement passes.
export function exposureTrim(gain) {
  const g = Number(gain);
  if (!Number.isFinite(g) || g <= 0) throw new Error(`exposure trim gain must be a positive number, got ${gain}`);
  if (g === 1) return null;

  // sRGB decode of an 8-bit value, inlined - lut expressions have no variables.
  const lin = (v) => `if(lte((${v})/255,0.04045),((${v})/255)/12.92,pow((((${v})/255)+0.055)/1.055,2.4))`;
  const scaled = `(${lin('val')}*${g})`;
  // ...and the encode, which needs the scaled value in both branches.
  const enc = `if(lte(${scaled},0.0031308),12.92*${scaled},1.055*pow(${scaled},1/2.4)-0.055)`;
  const e = `clip(255*(${enc}),0,255)`;
  return `lutrgb=r='${e}':g='${e}':b='${e}'`;
}

// The trims the director has set, by film and shot. Lives in direction/ for the same
// reason every other correction does: data/ stays byte-identical to the package, and
// the correction is still unmissable.
let trimsCache = null;
export function gradeTrims() {
  if (trimsCache) return trimsCache;
  const p = join(ROOT, 'direction', 'grade-trims.json');
  trimsCache = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { trims: [] };
  return trimsCache;
}
export function trimFor(filmId, shotId) {
  return (gradeTrims().trims ?? []).find((t) => t.film === filmId && t.shot === shotId) ?? null;
}
// Can a LIGHTENING trim be cleared on this shot? Only if skin can be measured on it.
// Returns null when it can, or the reason it cannot.
export function lighteningBlockedBecause(shot, locks = null) {
  const gov = skinGovernance(locks ?? read('locks').locks);
  if (!gov.measurable) {
    return 'skin is governed by policy and carries no numbers, so gradecheck reports NOT MEASURED '
         + 'and cutcheck reports "(no principal)" on every shot. A lightening trim needs a skin check '
         + 'that is looking. Give the approved sheets a measured skin albedo and this clears itself.';
  }
  const principals = (shot?.entities ?? []).filter((id) => gov.locks.some((l) => l.entity === id && l.value));
  if (!principals.length) return null; // nothing to lighten that skin protects
  return null;
}

export function trimChain(filmId, shotId) {
  const t = trimFor(filmId, shotId);
  if (!t) return null;
  if (t.gain > 1) {
    let shot = null;
    try { shot = treatment(filmId).shots.find((x) => x.id === shotId); } catch { /* reported below */ }
    const why = lighteningBlockedBecause(shot);
    if (why) {
      throw new Error(`exposure trim ${filmId}/${shotId} has gain ${t.gain}, which LIGHTENS. ${why}`);
    }
    if (!t.gradecheck_passed_on_skin) {
      throw new Error(`exposure trim ${filmId}/${shotId} lightens and does not record gradecheck_passed_on_skin. Run gradecheck on this shot and record the result before lightening it.`);
    }
  }
  return exposureTrim(t.gain);
}

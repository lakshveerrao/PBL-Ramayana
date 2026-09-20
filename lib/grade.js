// grade.js - the grade as an ffmpeg filter chain, built from data/grade.json.
// The rule that matters: no global move may lighten a face. The global lift is applied,
// then the skin band is restored, and tools/gradecheck.js measures that the locked skin
// albedo comes out within its tolerance. It is checked, not asserted.
import { read } from './store.js';

export function chain() {
  const g = read('grade');

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
  const g = read('grade').grain;
  if (!g.enabled) return null;
  // Applied last, after the grade and before the subtitle burn, so the caption does
  // not sit in the grain.
  return `noise=alls=${Math.round(g.strength * 100)}:allf=t+u`;
}

export function describe() {
  const g = read('grade');
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

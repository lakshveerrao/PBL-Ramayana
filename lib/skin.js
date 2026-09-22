// skin.js - the measured albedo of each approved model sheet, and what it is for.
//
// LOCK.SKIN.POLICY holds the RULE and no numbers: "Never lighter than the approved model
// sheet, in any grade, for any character. Fair-equals-good coding is forbidden outright.
// Exact skin values are production design, set by the studio's approved sheets - not by
// this workspace." So the numbers live in direction/skin-albedo.json, read from the
// sheets by tools/skinsample.js, and data/ stays byte-identical.
//
// TWO CHECKS, AND THEY ARE NOT THE SAME TEST. The director set this on 2026-09-22 and
// the distinction is the whole design:
//
//   A FRAME outside the albedo is REPORTED, never blocked. A face in shadow, or in the
//   lattice light, or three-quarters to a window, differs from its sheet legitimately.
//   Blocking on that would be measuring the lighting and calling it colourism.
//
//   A GRADE OP that RAISES skin relative to the ungraded frame is a HARD FAIL. That is
//   the defect the rule exists for: not a dark shot, but a process that lightens faces.
//
// The exception, and it is deliberate: a per-shot EXPOSURE TRIM may raise a frame, and
// therefore its skin. A shot can be genuinely too dark and the director may lift it.
// That is one declared act on one shot under a name, not a process quietly lightening
// every face in the arc, which is what the rule is for. Its effect on skin is REPORTED,
// every time, and never hidden.
import { ROOT } from './store.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let cache = null;
export function albedos() {
  if (cache) return cache;
  const p = join(ROOT, 'direction', 'skin-albedo.json');
  cache = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { entities: [], tolerance_L: 2.0 };
  return cache;
}
export function measurable() { return (albedos().entities ?? []).length > 0; }
export function toleranceL() { return albedos().grade_tolerance_L ?? albedos().tolerance_L ?? 2.0; }
export function reportBandL() { return albedos().report_band_L ?? 10; }
export function albedoFor(entity) {
  return (albedos().entities ?? []).find((e) => e.entity === entity) ?? null;
}
// An entity id in a graph may not be spelled the way a sheet directory is. Try both.
export function albedoForShot(entities = []) {
  for (const id of entities) {
    const hit = albedoFor(id) ?? albedoFor(String(id).toUpperCase());
    if (hit) return hit;
  }
  return null;
}

export function hexRgb(hex) {
  const m = String(hex).replace('#', '');
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}
export function lstar({ r, g, b }) {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16;
}

// The one verdict that blocks. `delta` is L* out minus L* in through a grade op.
export function raisesSkin(delta, tol = toleranceL()) { return delta > tol; }

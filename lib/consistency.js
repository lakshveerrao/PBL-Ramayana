// consistency.js - the consistency gate.
// No principal may be rendered until a named human has approved their model sheet.
// The gate refuses; it does not warn. It is not bypassable from a render route, and
// every refusal names what it still ALLOWS, so it never blocks unrelated work.
import { read } from './store.js';

export class GateRefusal extends Error {
  constructor(message, detail) { super(message); this.name = 'GateRefusal'; this.detail = detail; }
}

export function sheetFor(entityId) {
  return read('sheets', { fresh: true }).sheets.find((s) => s.entity === entityId) ?? null;
}

// The consistency gate binds on PEOPLE. A hall, a road or a lamp has no model sheet
// and never needed one - blocking a shot because a place is in frame is a gate binding
// something that is not its dependency.
export function isPerson(entityId) {
  const e = read('entities', { fresh: true }).entities.find((x) => x.id === entityId);
  if (!e) return true;                       // unknown: treat as a person and refuse
  const kind = String(e.kind ?? 'person').toLowerCase();
  return /person|character|principal/.test(kind);
}

// Does this one entity clear the gate?
export function entityCleared(entityId) {
  const sheet = sheetFor(entityId);
  if (!sheet) return { cleared: false, reason: `no model sheet record for ${entityId}` };
  if (!sheet.approved) {
    const why = sheet.files.length === 0
      ? `no sheet files uploaded for ${entityId}`
      : `sheet for ${entityId} has ${sheet.files.length} file(s) uploaded but is not approved`;
    return { cleared: false, reason: why };
  }
  if (!sheet.approved_by) return { cleared: false, reason: `sheet for ${entityId} is approved with no approver recorded` };
  return { cleared: true, reason: `sheet approved by ${sheet.approved_by}`, outstanding_axes: sheet.twenty_frame_test.outstanding };
}

// A gate binds only its real dependency: a shot with no principals in it is not blocked
// by an unapproved sheet somewhere else in the film.
export function checkShot(shot) {
  const all = shot.entities ?? [];
  const entities = all.filter(isPerson);
  const nonPeople = all.filter((e) => !isPerson(e));
  if (entities.length === 0) {
    return {
      allowed: true,
      reason: nonPeople.length
        ? `no person in frame (${nonPeople.join(', ')}) - the sheet gate does not bind this shot`
        : 'no principal in frame - the sheet gate does not bind this shot',
      entities: [],
    };
  }
  const blocked = [];
  const cleared = [];
  for (const e of entities) {
    const r = entityCleared(e);
    (r.cleared ? cleared : blocked).push({ entity: e, ...r });
  }
  if (blocked.length) {
    return {
      allowed: false,
      reason: blocked.map((b) => b.reason).join('; '),
      blocked_by: blocked.map((b) => b.entity),
      cleared: cleared.map((c) => c.entity),
      still_allowed: stillAllowed(blocked.map((b) => b.entity)),
    };
  }
  return { allowed: true, reason: cleared.map((c) => c.reason).join('; '), entities: cleared.map((c) => c.entity) };
}

// Every gate names what it still allows.
export function stillAllowed(blockedEntities) {
  return [
    'writing, direction and criticism on any film',
    'claim verification and disposition',
    'subtitle and typography work in all three languages',
    'assembly of shots that carry no blocked principal',
    'estimates and dry runs for the blocked shots',
    `everything not involving: ${blockedEntities.join(', ')}`,
  ];
}

export function checkFilm(shots) {
  const results = shots.map((s) => ({ shot: s.id, ...checkShot(s) }));
  const blocked = results.filter((r) => !r.allowed);
  return {
    allowed: blocked.length === 0,
    total: shots.length,
    blocked: blocked.length,
    allowed_count: results.length - blocked.length,
    results,
    still_allowed: blocked.length ? stillAllowed([...new Set(blocked.flatMap((b) => b.blocked_by))]) : [],
  };
}

// The memo gate. An entity with an outstanding memo may not be designed or shown.
export function memoBlocked(entityId) {
  const memo = read('memos', { fresh: true }).memos.find((m) => m.entity === entityId);
  return memo && memo.state === 'outstanding' ? memo : null;
}

export function assertNoMemoBlocked(entities) {
  const hits = (entities ?? []).map(memoBlocked).filter(Boolean);
  if (hits.length) {
    throw new GateRefusal(
      `entities with outstanding memos may not be designed: ${hits.map((h) => h.entity).join(', ')}`,
      hits,
    );
  }
  return true;
}

// cut.js - shots the director has cut, and the retime that follows.
//
// A cut is not a render note. Removing a shot moves every shot after it, moves every
// caption with them, and changes the film's length - so it has to happen in ONE place,
// before anything reads a timing, or the picture and the captions will disagree about
// where they are. That place is here: the frozen treatment goes in, a retimed view
// comes out, and lib/assemble.js builds both the picture and the subtitle script from
// the same view.
//
// data/ is untouched, as always. v1.0.6 stays byte-identical and direction/<film>-cut.json
// carries the decision, its reason and the name behind it.
import { treatment, ROOT } from './store.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const cache = new Map();
export function cutFor(filmId) {
  if (cache.has(filmId)) return cache.get(filmId);
  const p = join(ROOT, 'direction', `${filmId.toLowerCase()}-cut.json`);
  const c = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  cache.set(filmId, c);
  return c;
}

export function directedTreatment(filmId) {
  const t = treatment(filmId);
  const cut = cutFor(filmId);
  const removed = new Set(cut?.cut ?? []);
  if (!removed.size) return t;

  for (const id of removed) {
    if (!t.shots.some((s) => s.id === id)) {
      throw new Error(`direction/${filmId.toLowerCase()}-cut.json cuts ${id}, which ${filmId} does not have`);
    }
  }

  // Retime from zero. Durations are the treatment's own; only the starts move.
  let at = 0;
  const shots = [];
  for (const s of t.shots) {
    if (removed.has(s.id)) continue;
    shots.push({ ...s, start_s: Number(at.toFixed(6)) });
    at += s.duration_s;
  }

  // A caption whose shot is gone goes with it. Nothing is re-pointed at another shot:
  // moving a line onto a frame it was not written for is a rewrite, not a cut.
  const narration = {};
  for (const [k, n] of Object.entries(t.narration ?? {})) {
    if (removed.has(n.shot)) continue;
    narration[k] = n;
  }

  return { ...t, shots, narration, duration_s: Number(at.toFixed(6)), cut_applied: [...removed] };
}

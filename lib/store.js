// store.js - the only reader and writer of data/. Flat JSON, no database, on purpose.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Which graph is loaded. data/ is the live graph, replaced by a handoff.
// PBL_GRAPH points somewhere else - tools/regress.js points it at the frozen test
// fixture, so the regressions do not depend on production data and stay meaningful
// whatever graph is installed.
// Computed on each call, never captured at module load: ESM evaluates every import
// before the importing module's body runs, so a const here would be fixed before a
// caller could ever set PBL_GRAPH.
export function dataDir() {
  return process.env.PBL_GRAPH ? join(ROOT, process.env.PBL_GRAPH) : join(ROOT, 'data');
}
export function usingFixture() { return Boolean(process.env.PBL_GRAPH); }

let cache = new Map();
let cacheFor = null;

export function read(name, { fresh = false } = {}) {
  const dir = dataDir();
  if (cacheFor !== dir) { cache = new Map(); cacheFor = dir; }
  if (!fresh && cache.has(name)) return cache.get(name);
  const path = join(dataDir(), `${name}.json`);
  if (!existsSync(path)) throw new Error(`data/${name}.json does not exist`);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  cache.set(name, value);
  return value;
}

export function write(name, value) {
  const path = join(dataDir(), `${name}.json`);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
  cache.set(name, value);
  return value;
}

export function readFileAt(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// Where the studio writes its own output. Computed on each call, never captured at
// module load - the same ESM hoisting trap dataDir() already documents.
//
// It exists because the regressions were writing 1x1 test GIFs into the real
// assets/sheets/ tree, beside the actual sheet evidence, and had been for some time.
// A test must not leave anything in the directory a human approves from.
export function assetsDir() {
  return process.env.PBL_ASSETS ?? 'assets';
}

export function ensureDir(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  return path;
}

export function treatment(filmId) {
  const films = read('films');
  const film = films.films.find((f) => f.id === filmId);
  if (!film) throw new Error(`no such film: ${filmId}`);
  if (!film.treatment) return null;
  // A graph states its treatment paths relative to ITSELF - the frozen package says
  // "treatments/M1.json". Resolving against the graph directory first means the
  // package's own files never have to be edited to fit the studio's layout.
  for (const base of [dataDir(), ROOT]) {
    const path = join(base, film.treatment);
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  }
  return null;
}

export function film(filmId) {
  const f = read('films').films.find((x) => x.id === filmId);
  if (!f) throw new Error(`no such film: ${filmId}`);
  return f;
}

export function filmByStory(storyId) {
  const f = read('films').films.find((x) => x.story_id === storyId);
  if (!f) throw new Error(`no such story: ${storyId}`);
  return f;
}

export function entity(id) {
  const e = read('entities').entities.find((x) => x.id === id);
  if (!e) throw new Error(`no such entity: ${id}`);
  return e;
}

export function lock(id) {
  const l = read('locks').locks.find((x) => x.id === id);
  if (!l) throw new Error(`no such lock: ${id}`);
  return l;
}

// The first film that actually has a treatment on disk. Tools default to this rather
// than to a hardcoded id, so they run on whatever graph is installed.
export function firstDirected() {
  for (const f of read('films').films) if (treatment(f.id)) return f.id;
  throw new Error('no film in this graph has a treatment - nothing to work on');
}

export function clearCache() { cache.clear(); cacheFor = null; }

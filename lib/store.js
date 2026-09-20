// store.js - the only reader and writer of data/. Flat JSON, no database, on purpose.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');

const cache = new Map();

export function read(name, { fresh = false } = {}) {
  if (!fresh && cache.has(name)) return cache.get(name);
  const path = join(DATA, `${name}.json`);
  if (!existsSync(path)) throw new Error(`data/${name}.json does not exist`);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  cache.set(name, value);
  return value;
}

export function write(name, value) {
  const path = join(DATA, `${name}.json`);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
  cache.set(name, value);
  return value;
}

export function readFileAt(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
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
  const path = join(ROOT, film.treatment);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
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

export function clearCache() { cache.clear(); }

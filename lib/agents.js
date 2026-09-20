// agents.js - load the system prompts. The shared block goes first and never varies
// between films, which is what makes the prompt cache hit.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './store.js';

const cache = new Map();
export function agent(name) {
  if (cache.has(name)) return cache.get(name);
  const shared = readFileSync(join(ROOT, 'agents', '_shared.md'), 'utf8');
  const own = readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8');
  const text = `${shared}\n\n---\n\n${own}`;
  cache.set(name, text);
  return text;
}

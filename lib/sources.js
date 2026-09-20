// sources.js - the rights gate.
// A restricted source may be cited by locator anywhere. Its TEXT may never enter a
// public payload, a generation input, or an export. Verification against it stays
// valid: verification is not redistribution.
import { read } from './store.js';

export function source(id) {
  const s = read('source_register').sources.find((x) => x.id === id);
  if (!s) throw new Error(`no such source: ${id}`);
  return s;
}

export function isRestricted(id) {
  try { return source(id).restricted === true; } catch { return false; }
}

// A locator is always safe to carry. Text is not.
export function locatorOf(claim) {
  if (!claim.locator) return null;
  const { work, kanda, sarga, verses, source: src } = claim.locator;
  return { work, kanda, sarga, verses, source: src, text: null };
}

export class RightsError extends Error {
  constructor(message, detail) { super(message); this.name = 'RightsError'; this.detail = detail; }
}

// Guard every outbound payload. Throws if restricted text is riding along.
export function assertNoRestrictedText(payload, where = 'payload') {
  const register = read('source_register').sources.filter((s) => s.restricted);
  const seen = JSON.stringify(payload);

  // 1. A verse_text / text field carried beside a restricted source id is the
  //    common way this leaks. Walk the object rather than pattern-match the string.
  const offenders = [];
  walk(payload, (node, path) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const srcId = node.source ?? node.source_id ?? node.edition;
      const restricted = typeof srcId === 'string' && register.some((r) => r.id === srcId);
      if (restricted) {
        for (const key of ['text', 'verse_text', 'verse', 'sanskrit', 'body', 'content', 'quote']) {
          if (typeof node[key] === 'string' && node[key].trim().length > 0) {
            offenders.push(`${path}.${key} carries text beside restricted source ${srcId}`);
          }
        }
      }
      if (node.text_held === true) offenders.push(`${path}.text_held is true - restricted text must not be held`);
    }
  });

  // 2. Devanagari in an outbound payload is not proof of a leak, but a run of it
  //    beside a restricted citation is. Keep it narrow so Hindi narration passes.
  if (/[ऀ-ॿ]{40,}/.test(seen) && register.some((r) => seen.includes(r.id))) {
    offenders.push('a long Devanagari run appears in the same payload as a restricted source id');
  }

  if (offenders.length) {
    throw new RightsError(`restricted source text in ${where}`, offenders);
  }
  return true;
}

function walk(node, fn, path = '$') {
  fn(node, path);
  if (Array.isArray(node)) node.forEach((c, i) => walk(c, fn, `${path}[${i}]`));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, fn, `${path}.${k}`);
}

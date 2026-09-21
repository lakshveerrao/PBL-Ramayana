// contract.js - the predicates HANDOFF.md describes, in one place.
//
// tools/validate.js and tools/import_graph.js both ask these questions. Two
// implementations would drift, and the importer would accept a graph the validator
// then rejected.
//
// Each predicate is written to accept any shape that genuinely satisfies the rule and
// to refuse anything that does not - never to accept a shape merely because a real
// package happened to use it.

// ---------------------------------------------------------------- rights
// Fields that would carry source TEXT. A numeric `verse` is a locator component -
// verse 1 of sarga 18 - and is not text. A string in one of these is.
const TEXT_BEARING = ['text', 'verse_text', 'sanskrit', 'body', 'content', 'quote', 'line', 'shloka'];

export function passageTextFields(p) {
  const found = [];
  for (const k of TEXT_BEARING) {
    if (typeof p[k] === 'string' && p[k].trim()) found.push(k);
  }
  // `verse` is ambiguous by name: a number is a locator, a string may be text.
  if (typeof p.verse === 'string' && p.verse.trim() && !/^[\d\-–,. ]+$/.test(p.verse)) found.push('verse');
  if (p.text_held === true) found.push('text_held:true');
  return found;
}

// A restricted source must forbid its text reaching a viewer, a product, or a
// generation input. Two shapes are accepted: a flat boolean, or a use_policy.
export function textMayTravel(source) {
  if (typeof source.text_may_travel === 'boolean') return source.text_may_travel;
  const u = source.use_policy;
  if (u && typeof u === 'object') {
    // Travelling means reaching a viewer, a product, or a model.
    return Boolean(u.display_to_viewer || u.quote_in_product || u.generation_input);
  }
  return null;   // the source does not say
}

export function sourceStatesTravel(source) {
  return textMayTravel(source) !== null;
}

// ---------------------------------------------------------------- locators
// A Text claim must say WHERE. Two numbering systems are legitimate: a Sanskrit
// sarga/verse reference, or an edition's own section numbering (Dutt XVIII), which
// asserts no verse equivalence.
export function locatorIdentifiesAPlace(loc) {
  if (!loc) return false;
  if (loc.sarga != null) return true;
  if (loc.section != null && loc.edition) return true;
  return false;
}

export function locatorKind(loc) {
  if (!loc) return 'none';
  if (loc.sarga != null) return 'sarga';
  if (loc.section != null && loc.edition) return 'edition-section';
  return 'unrecognised';
}

// ---------------------------------------------------------------- design and skin
// An entities file may hold identity records - who exists, what they are called,
// which gate applies - without holding any DESIGN. A design is what a memo forbids,
// and what a prompt is assembled from.
const DESIGN_KEYS = ['garment', 'ornament', 'skin_albedo', 'hair', 'build', 'age_reading', 'complexion_claim'];

export function hasDesign(entity) {
  const d = entity.design;
  if (!d || typeof d !== 'object') return false;
  return DESIGN_KEYS.some((k) => d[k] != null && d[k] !== '');
}

// Skin may be governed per entity by a numeric albedo lock, or for the whole graph by
// a policy lock that defers to the studio's approved sheets. One of the two must hold;
// "nobody governs skin" is never acceptable.
export function skinGovernance(locks) {
  const perEntity = locks.filter((l) => l.kind === 'skin_albedo');
  const policy = locks.filter((l) => l.kind === 'skin_policy');
  if (perEntity.length) return { kind: 'per-entity', locks: perEntity, measurable: true };
  if (policy.length) return { kind: 'policy', locks: policy, measurable: false };
  return { kind: 'none', locks: [], measurable: false };
}

// Whatever governs skin must forbid lightening, in words.
export function forbidsLightening(lock) {
  return /never lighter|never lighten|not lighter|no lightening/i.test(lock.rule ?? '');
}

// ---------------------------------------------------------------- scripts
// A script that stacks marks above and below the line needs conjunct probes. Latin
// does not. A graph may declare `script`, or the language may be a known Latin one.
const LATIN_LANGS = new Set(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'id', 'sw', 'vi', 'tr']);

export function isLatinScript(lang, spec) {
  if (spec.script) return /latin/i.test(spec.script);
  return LATIN_LANGS.has(lang);
}

// ---------------------------------------------------------------- films
// A film with no treatment is a ledger entry: named, not yet authored. It need not
// declare a duration. A film WITH a treatment must.
export function filmNeedsDuration(film, hasTreatment) {
  return Boolean(hasTreatment) || film.status === 'directed';
}

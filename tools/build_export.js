#!/usr/bin/env node
// build_export - the public payload.
//
// This is the last place restricted text could leak, so the rights gate runs over the
// finished payload before it is written, not over its inputs. If it refuses, nothing
// is written at all.
import { read, treatment, ensureDir, ROOT } from '../lib/store.js';
import { assertNoRestrictedText, locatorOf, isRestricted } from '../lib/sources.js';
import { checkFilm } from '../lib/consistency.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const films = read('films');
const claims = read('claims').claims;
const sources = read('source_register').sources;

const payload = {
  _doc: 'Public export. Carries locators, never source text. Every accepted claim prints how it was accepted.',
  built: new Date().toISOString().slice(0, 10),
  arc: films.arcs[0],
  films: films.films.map((f) => {
    const t = treatment(f.id);
    const fc = claims.filter((c) => c.film === f.id);
    return {
      id: f.id, story_id: f.story_id,
      title: { en: f.title_en, hi: f.title_hi, te: f.title_te },
      kanda: f.kanda, sarga: f.sarga, duration_s: f.duration_s, status: f.status,
      shots: t ? t.shots.length : 0,
      gate: t ? { blocked: checkFilm(t.shots).blocked, of: t.shots.length } : null,
      narration: t ? Object.fromEntries(Object.entries(t.narration).map(([k, v]) => [k, {
        shot: v.shot, en: v.en, hi: v.hi, te: v.te,
        speaker: v.speaker ?? null,
        // Attribution travels with the line. A surface that drops it turns a
        // character's statement into narrator fact.
        attribution_required: Boolean(v.speaker),
      }])) : null,
      claims: fc.map((c) => ({
        id: c.id, text: c.text,
        evidence_class: c.evidence_class, state: c.state,
        speaker: c.speaker ?? null,
        locator: locatorOf(c),                       // locator only - never text
        restricted_source: c.locator ? isRestricted(c.locator.source) : false,
        inferred_from: c.inferred_from ?? null,
        inference_basis: c.inference_basis ?? null,
        staging_note: c.staging_note ?? null,
        tradition: c.tradition ?? null,
        silence_note: c.silence_note ?? null,
        // The Ledger prints this verbatim. It never implies human review.
        accepted_how: c.state === 'accepted' ? {
          method: c.verification.method,
          text_consulted: c.verification.text_consulted,
          basis: c.verification.basis,
          attested_at: c.verification.attested_at,
          not_human_review: 'An AI-assisted passage check. This is not qualified human review.',
        } : null,
      })),
    };
  }),
  sources: sources.map((s) => ({
    id: s.id, work: s.work, edition: s.edition, licence: s.licence,
    restricted: Boolean(s.restricted),
    what_travels: s.text_may_travel ? 'text and locators' : 'locators only',
    restriction_reason: s.restriction_reason ?? null,
  })),
  promise: [
    'No invented events, motives or consequences.',
    'Every line comes from somewhere, and we can show where.',
    'Where the text is silent, we say so.',
    'What we chose for the screen, we declare as ours.',
    'We do not claim authentic, definitive, faithful or scholarly.',
  ],
};

// The gate, over the finished payload.
try {
  assertNoRestrictedText(payload, 'public export');
} catch (e) {
  console.error(`\nEXPORT REFUSED by the rights gate: ${e.message}`);
  for (const d of e.detail ?? []) console.error(`  - ${d}`);
  console.error('\nNothing was written.\n');
  process.exit(1);
}

ensureDir('exports');
const out = join(ROOT, 'exports', 'public.json');
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');

const accepted = payload.films.flatMap((f) => f.claims).filter((c) => c.state === 'accepted');
console.log(`\nexports/public.json  ${payload.films.length} films, ${payload.films.flatMap((f) => f.claims).length} claims`);
console.log(`  ${accepted.length} accepted, each printing its method and whether a text was consulted`);
console.log(`  ${payload.sources.filter((s) => s.restricted).length} restricted source(s): locators only`);
console.log(`  rights gate: passed\n`);

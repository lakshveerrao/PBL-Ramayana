#!/usr/bin/env node
// refcount - how many references does this graph's shot list actually need?
//
// The endpoint choice turns on this number. A single-reference endpoint (the kontext
// family: one image_url) cannot render a frame holding two principals; a
// multi-reference endpoint (nano-banana/edit, seedream v4 edit: image_urls) can, and
// may sit in a different photographic register.
//
// Counts only principals that HAVE a sheet record. A crowd entity - "the ministers and
// court" - is kind=person and has no sheet, because a crowd has no identity lock; it
// contributes no reference. Graph-agnostic: it names no entity and no film.
import { read, treatment } from '../lib/store.js';
import { isPerson } from '../lib/consistency.js';

export function refcount() {
  const withSheet = new Set(read('sheets').sheets.map((s) => s.entity));
  const films = [];
  const hist = {};
  const pairs = {};
  let gen = 0;

  for (const f of read('films').films) {
    let t;
    try { t = treatment(f.id); } catch { continue; }
    if (!t?.shots) continue;
    const shots = t.shots.map((s) => {
      const refs = (s.entities ?? []).filter(isPerson).filter((e) => withSheet.has(e)).sort();
      return { id: s.id, source: s.source, refs };
    });
    for (const s of shots) {
      if (s.source !== 'generate') continue;
      gen++;
      hist[s.refs.length] = (hist[s.refs.length] ?? 0) + 1;
      if (s.refs.length >= 2) {
        const k = s.refs.join(' + ');
        pairs[k] = (pairs[k] ?? 0) + 1;
      }
    }
    films.push({ film: f.id, shots });
  }

  // The number that decides whether ONE endpoint can serve the whole arc: does a
  // multi-reference shot ever sit next to a single-reference one? If it does, using a
  // different endpoint for each means the register shifts between adjacent cuts -
  // inside a 44-second film, where a viewer sees both within seconds.
  const adjacencies = [];
  for (const { film, shots } of films) {
    for (let i = 1; i < shots.length; i++) {
      const a = shots[i - 1], b = shots[i];
      const aMulti = a.refs.length >= 2, bMulti = b.refs.length >= 2;
      if (aMulti !== bMulti && (a.refs.length > 0 && b.refs.length > 0)) {
        // A reuse shot is cropped from a generated one, never generated itself, so it
        // carries whatever register its source had. Recorded, but not counted as a cut
        // that a second endpoint would create on its own.
        adjacencies.push({ film, from: a.id, to: b.id, from_refs: a.refs.length, to_refs: b.refs.length,
                           both_generated: a.source === 'generate' && b.source === 'generate' });
      }
    }
  }

  const multi = Object.entries(hist).filter(([k]) => +k >= 2).reduce((a, [, v]) => a + v, 0);
  const max = Math.max(0, ...Object.keys(hist).map(Number));
  return { generate_shots: gen, histogram: hist, multi_reference: multi, max_in_frame: max, pairs, adjacencies, films };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = refcount();
  console.log('\nREFCOUNT - how many approved sheets must travel with each shot\n');
  console.log(`  ${r.generate_shots} shots with source=generate\n`);
  for (const k of Object.keys(r.histogram).sort()) {
    console.log(`    ${k} reference${k === '1' ? ' ' : 's'}: ${String(r.histogram[k]).padStart(3)} shots`);
  }
  const pct = r.generate_shots ? (100 * r.multi_reference / r.generate_shots).toFixed(1) : '0.0';
  console.log(`\n  ${r.multi_reference} of ${r.generate_shots} shots need two or more (${pct}%), at most ${r.max_in_frame} in one frame`);
  if (Object.keys(r.pairs).length) {
    console.log('\n  who shares a frame:');
    for (const [k, v] of Object.entries(r.pairs).sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(3)}  ${k}`);
  }
  const direct = r.adjacencies.filter((a) => a.both_generated);
  console.log(`\n  ${direct.length} cuts run straight from a one-reference shot to a multi-reference one,`);
  console.log(`  or back, with BOTH sides generated (${r.adjacencies.length - direct.length} more involve a reuse shot, which`);
  console.log('  inherits its register from whatever generated its source):');
  for (const a of r.adjacencies) {
    console.log(`    ${a.film}  ${a.from} (${a.from_refs}) -> ${a.to} (${a.to_refs})${a.both_generated ? '' : '   via reuse'}`);
  }
  console.log('\n  Each of those is a place where two endpoints would shift the photographic');
  console.log('  register across a single cut. That is the argument for one endpoint.\n');
}

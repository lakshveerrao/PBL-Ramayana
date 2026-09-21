// prompt.js - where a shot's image prompt comes from.
//
// A source package may SHIP the prompt, built from its own execution graph and its
// visibility notes - which faces are withheld, who is in frame. When it does, that
// prompt is used verbatim: the package owns what may be shown, and rebuilding it here
// from entity designs would quietly assert things the package did not.
//
// Only when a graph carries designs and no prompt does the studio assemble one, from
// data/entities.json and data/material_world.json. Either way it is never hand-written.
import { read, entity, lock, ROOT } from './store.js';
import { assertNoMemoBlocked } from './consistency.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Creative direction that supersedes the frozen package. The package wins on source
// truth; the packs win on how a thing is shown. An override lives here rather than in
// data/ so the package stays byte-identical and the correction is still unmissable.
let overridesCache = null;
export function directionOverrides() {
  if (overridesCache) return overridesCache;
  const p = join(ROOT, 'direction', 'overrides.json');
  overridesCache = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { prompt_overrides: [], action_overrides: [] };
  return overridesCache;
}

export function applyOverrides(shotId, text, kind = 'prompt_overrides') {
  if (!text) return { text, applied: [] };
  const applied = [];
  let out = text;
  for (const o of directionOverrides()[kind] ?? []) {
    if (o.shot !== shotId) continue;
    if (o.changes_truth === true) {
      throw new Error(`direction override for ${shotId} declares changes_truth - direction may never change what is true`);
    }
    for (const find of [o.find, ...(o.also_find ?? [])]) {
      if (find && out.includes(find)) {
        out = out.split(find).join(o.replace);
        applied.push({ shot: shotId, find, replace: o.replace, reason: o.reason, authority: o.authority ?? null });
      }
    }
  }
  return { text: out, applied };
}

const SIZE = {
  WIDE: 'wide shot, full figure and the room around it',
  MS: 'medium shot, from the waist',
  MCU: 'medium close-up, chest and head',
  CU: 'close-up, the face fills the frame',
  INSERT: 'tight insert, a detail only',
};
const HEIGHT = {
  eye: 'camera at eye height',
  high: 'camera above, looking down',
  low: 'camera below eye height, looking up',
  'slightly low': 'camera a little below eye height',
};

// The negative prompt belongs to the render policy when the graph ships one; otherwise
// it is built from the material world's forbidden lists.
export function negativePrompt() {
  let rp = null;
  try { rp = read('render_policy'); } catch { /* optional */ }
  if (rp?.negative_prompt) {
    return { text: rp.negative_prompt, from: 'data/render_policy.json' };
  }
  const mw = read('material_world');
  const bag = [
    ...(mw.architecture?.forbidden ?? []),
    ...(mw.cloth?.forbidden ?? []),
    ...(mw.forbidden_globally?.anglicisation ?? []),
    ...(mw.forbidden_globally?.colourism ?? []),
  ];
  return { text: [...new Set(bag)].join(', '), from: 'data/material_world.json' };
}

export function assemble(shot, filmId) {
  // The memo gate binds whatever the prompt's origin.
  assertNoMemoBlocked(shot.entities);

  const negative = negativePrompt();

  // 1. The package's own prompt, when it ships one - with any creative-direction
  //    correction applied on top.
  if (typeof shot.image_prompt === 'string' && shot.image_prompt.trim()) {
    const { text, applied } = applyOverrides(shot.id, shot.image_prompt);
    return {
      prompt: text,
      negative: negative.text,
      negatives: negative.text.split(/,\s*/).filter(Boolean),
      source: applied.length ? 'package + direction' : 'package',
      overrides: applied,
      assembled_from: [
        'the treatment\'s own image_prompt',
        ...(applied.length ? ['direction/overrides.json'] : []),
        negative.from,
      ],
    };
  }

  // 2. Otherwise assemble from the graph's designs.
  const mw = read('material_world');
  const parts = [];
  parts.push(`${SIZE[shot.size] ?? shot.size}. ${shot.lens_mm}mm lens. ${HEIGHT[shot.height] ?? shot.height}. Camera ${shot.camera_move}.`);
  for (const id of shot.entities ?? []) {
    const d = describeEntity(id, shot);
    if (d) parts.push(d);
  }
  if (mw.architecture?.allowed) parts.push(`Setting: ${mw.architecture.allowed.slice(0, 4).join(', ')}. Surface: ${mw.architecture.surface ?? ''}`.trim());
  if (mw.light?.sources) parts.push(`Light: ${mw.light.sources.join('; ')}. ${mw.light.rule ?? ''}`.trim());
  for (const l of read('locks').locks.filter((x) => x.film === filmId && x.kind === 'prop')) {
    parts.push(`Prop, held: ${l.value.prop}, ${l.value.position}.`);
  }
  parts.push(`Absolutely not present: ${negative.text}.`);

  return {
    prompt: parts.join('\n'),
    negative: negative.text,
    negatives: negative.text.split(/,\s*/).filter(Boolean),
    source: 'assembled',
    assembled_from: ['data/entities.json', 'data/material_world.json', 'data/locks.json', negative.from],
  };
}

function describeEntity(id, shot) {
  let e;
  try { e = entity(id); } catch { return null; }
  const d = e.design;
  // An identity record with no design contributes nothing to a prompt - appearance
  // then belongs to the studio's approved sheet, not to this text.
  if (!d) return null;

  const bits = [];
  const name = e.name_en ?? e.name ?? e.id;
  bits.push(`${name}: ${[d.age_reading, d.build].filter(Boolean).join(' ')}.`.replace(' .', '.'));
  if (d.hair) bits.push(`Hair: ${d.hair}.`);
  if (d.garment) bits.push(`Lower garment: ${d.garment.lower}. Upper: ${d.garment.upper}. ${d.garment.construction} Weave: ${d.garment.weave}.`);
  if (d.ornament) bits.push(`Ornament: ${d.ornament.items.join('; ')}. ${d.ornament.rule}`);
  if (d.skin_albedo) {
    try {
      const skin = lock(d.skin_albedo);
      bits.push(`Skin: ${skin.value.srgb_hex}, L* ${skin.value.lab_L}. ${skin.rule}`);
    } catch { /* the lock check in validate reports this */ }
  }
  if (shot.expression && shot.expression !== 'n/a') bits.push(`Expression: ${shot.expression}.`);
  return bits.join(' ');
}

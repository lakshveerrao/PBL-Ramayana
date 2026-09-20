// prompt.js - image prompts are ASSEMBLED from data/entities.json and
// data/material_world.json. They are never written by hand. If a frame comes back
// wrong - cloth reading as sewn, an arch in shot, skin lightened - the fix is in the
// data, not in a string here.
import { read, entity, lock } from './store.js';
import { assertNoMemoBlocked } from './consistency.js';

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

export function assemble(shot, filmId) {
  assertNoMemoBlocked(shot.entities);

  const mw = read('material_world');
  const parts = [];

  // 1. The frame itself.
  parts.push(`${SIZE[shot.size] ?? shot.size}. ${shot.lens_mm}mm lens. ${HEIGHT[shot.height] ?? shot.height}. Camera ${shot.camera_move}.`);

  // 2. Who is in it, assembled from their entity record.
  for (const id of shot.entities ?? []) {
    parts.push(describeEntity(id, shot));
  }

  // 3. The world. Architecture, cloth rules and ornament come from material_world.
  parts.push(`Setting: ${mw.architecture.allowed.slice(0, 4).join(', ')}. Surface: ${mw.architecture.surface}`);
  parts.push(`Light: ${mw.light.sources.join('; ')}. ${mw.light.rule}`);

  // 4. Film-specific locked props.
  for (const l of read('locks').locks.filter((x) => x.film === filmId && x.kind === 'prop')) {
    parts.push(`Prop, held: ${l.value.prop}, ${l.value.position}.`);
  }

  // 5. The negatives, straight from the forbidden lists. These are why the gate exists.
  const negatives = [
    ...mw.architecture.forbidden,
    ...mw.cloth.forbidden,
    ...mw.forbidden_globally.anglicisation,
    ...mw.forbidden_globally.colourism,
  ];
  parts.push(`Absolutely not present: ${[...new Set(negatives)].join(', ')}.`);

  return { prompt: parts.join('\n'), negatives, assembled_from: ['data/entities.json', 'data/material_world.json', 'data/locks.json'] };
}

function describeEntity(id, shot) {
  const e = entity(id);
  const d = e.design;
  const skin = lock(d.skin_albedo);
  const bits = [
    `${e.name_en}: ${d.age_reading} ${d.build}.`,
    `Hair: ${d.hair}.`,
    `Lower garment: ${d.garment.lower}. Upper: ${d.garment.upper}. ${d.garment.construction} Weave: ${d.garment.weave}.`,
    `Ornament: ${d.ornament.items.join('; ')}. ${d.ornament.rule}`,
    `Skin: ${skin.value.srgb_hex}, L* ${skin.value.lab_L}. ${skin.rule}`,
  ];
  if (shot.expression && shot.expression !== 'n/a') bits.push(`Expression: ${shot.expression}.`);
  return bits.join(' ');
}

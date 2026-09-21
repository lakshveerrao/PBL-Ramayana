// sheetprompt.js - model sheet prompts, assembled from the briefs.
//
// Nothing here is written by hand at generation time. The character brief and the
// four design decisions are the source; this file slots them into the anchor-first
// procedure the briefs set out. If a candidate comes back wrong, the fix is in
// direction/sheet-briefs.json.
import { read, ROOT } from './store.js';
import { negativePrompt } from './prompt.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cache = null;
export function briefs() {
  if (!cache) cache = JSON.parse(readFileSync(join(ROOT, 'direction', 'sheet-briefs.json'), 'utf8'));
  return cache;
}
export function decisions() {
  return JSON.parse(readFileSync(join(ROOT, 'direction', 'design-decisions.json'), 'utf8'));
}

export function character(id) {
  const c = briefs().characters.find((x) => x.id === id);
  if (!c) throw new Error(`no sheet brief for ${id}`);
  return c;
}

export function order() {
  return briefs().characters.slice().sort((a, b) => a.order - b.order).map((c) => c.id);
}

// The negative prompt is the render policy's, plus this character's own "never" list.
// A character's nevers are as binding as the world's.
export function negativeFor(id) {
  const base = negativePrompt();
  const c = character(id);
  const all = [...base.text.split(/,\s*/), ...(c.never ?? [])]
    .map((s) => s.trim()).filter(Boolean);
  return { text: [...new Set(all)].join(', '), from: [base.from, 'direction/sheet-briefs.json never list'] };
}

// One view's prompt. `view` is a slot from the universal view list.
export function viewPrompt(id, slot) {
  const u = briefs()._universal;
  const c = character(id);
  const view = u.views.find((v) => v.slot === slot);
  if (!view) throw new Error(`no such view slot: ${slot}`);

  const parts = [];
  parts.push(`Character model sheet, ${view.shot}. 9:16 vertical.`);
  parts.push(`SUBJECT: ${c.subject}.`);
  if (c.build) parts.push(`Build: ${c.build}.`);
  if (c.hair) parts.push(`Hair: ${c.hair}.`);
  if (c.complexion) {
    // A complexion that is a declared choice says so in the prompt, so no downstream
    // copy can mistake it for something the source established.
    parts.push(c.complexion_declaration
      ? `Complexion: ${c.complexion}. (${c.complexion_declaration})`
      : `Complexion: ${c.complexion}.`);
  }
  if (c.dress) parts.push(`Dress: ${c.dress}.`);
  if (c.headdress) parts.push(`Headdress: ${c.headdress}.`);
  if (c.ornament) parts.push(`Ornament: ${c.ornament}.`);
  if (c.props) parts.push(`Carries: ${c.props}.`);
  if (c.the_one_thing) parts.push(`The one thing to get right: ${c.the_one_thing}`);
  if (c.distinct_from) parts.push(`Must be distinct from ${c.distinct_from.who} at a glance: ${c.distinct_from.how}.`);
  if (c.face_withheld) parts.push('FACE NOT SHOWN. Hands only.');
  if (slot === 'in_world') parts.push(u.in_world_light);

  parts.push(...u.world);
  parts.push(u.mandatory_line);

  const negative = negativeFor(id);
  // A brief's sentences already end in a stop; joining blindly gives "ornament.."
  const sentence = (x) => String(x).trim().replace(/\s+/g, ' ').replace(/\.\.+$/, '.');
  return {
    character: id,
    slot,
    prompt: parts.map(sentence).join(' ').replace(/\.\s*\./g, '.'),
    negative: negative.text,
    assembled_from: ['direction/sheet-briefs.json', 'direction/design-decisions.json', ...negative.from],
    conditioned_on: slot === 'front' ? null : 'the approved FRONT anchor',
  };
}

// The whole anchor-first plan for one character.
export function plan(id) {
  const u = briefs()._universal;
  const c = character(id);
  const front = viewPrompt(id, 'front');
  return {
    character: id,
    order: c.order,
    why_first: c.why_first ?? null,
    anchor_rule: u.anchor_rule,
    step_1_anchor: { candidates: u.candidates_per_anchor, ...front },
    step_2_views: u.views.filter((v) => v.slot !== 'front').map((v) => viewPrompt(id, v.slot)),
    step_3_expressions: (c.expressions ?? []).map((e) => ({ state: e, conditioned_on: 'the approved FRONT anchor' })),
    step_4_detail_plates: c.plates_only ?? ['hands', ...(c.headdress ? ['headdress close-up'] : []), ...(c.ornament ? ['ornament close-up'] : [])],
    step_5_approval: 'A named human approves through POST /api/sheets/:id/approve. Only then does the consistency gate open for this character.',
    acceptance: [
      'a stranger, shown the four views shuffled, says it is one person',
      'the age reads correctly at thumbnail size',
      'it cannot be mistaken for another principal at a glance',
      'the cloth hangs like cloth, not like a garment',
      'no dome, arch or marble anywhere behind',
      'the skin is at least as deep as intended',
      'the ornament looks like a temple relief, not a jewellery shop',
      'a named person signs it off',
    ],
  };
}

export function allPlans() {
  return order().map(plan);
}

// graph.js - a canonical view of whatever graph is installed.
//
// The source package is FROZEN. It is never edited to fit the studio; the studio
// adapts to it. Every accessor here accepts the shapes a conforming graph may use and
// presents one shape to the rest of the studio, so lib/grade.js, lib/subtitle.js and
// lib/assemble.js do not each grow their own guesswork.
//
// Where the package deliberately holds a value as PROSE because it belongs to the
// studio - the grade, per HANDOFF §6 "creative proposals ... the studio may change
// these" - this file supplies the number and records where it came from.
import { directionOverrides } from './prompt.js';
import { read, treatment } from './store.js';

// ---------------------------------------------------------------- frame
export function frame() {
  const t = read('typography').frame ?? {};
  let width = t.width, height = t.height;
  if ((!width || !height) && typeof t.resolution === 'string') {
    const m = t.resolution.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (m) { width = Number(m[1]); height = Number(m[2]); }
  }
  // fps is a property of the cut, so a treatment is its authority.
  let fps = t.fps;
  if (!fps) {
    for (const f of read('films').films) {
      const tr = treatment(f.id);
      if (tr?.fps) { fps = tr.fps; break; }
    }
  }
  return { width, height, fps: fps ?? 30, safe_bottom_px: t.safe_bottom_px, safe_sides_px: t.safe_sides_px };
}

// ---------------------------------------------------------------- grade
// The package states the grade as intent. The studio owns the numbers, and every one
// is traceable to the sentence it came from.
const IRE = (s, fallback) => {
  const m = String(s ?? '').match(/IRE\s*(\d+)/i);
  return m ? Number(m[1]) : fallback;
};

export function gradeNumbers() {
  const g = read('grade');

  // Either the studio's own numeric shape, or derived from the package's prose.
  if (typeof g.black_point_ire === 'number') {
    return { ...g, _derived: false };
  }

  const lv = g.levels ?? {};
  const st = g.shadow_tint ?? {};
  const sk = g.skin_qualifier ?? {};
  const gr = g.grain ?? {};

  return {
    _derived: true,
    _from: 'package prose in data/grade.json; numbers are the studio\'s, per HANDOFF section 6',
    black_point_ire: IRE(lv.black_point, 3),
    white_point_ire: IRE(lv.white_point, 96),
    shadow_tint: {
      direction: /warm|ochre|amber/i.test(st.hue ?? st.direction ?? '') ? 'warm' : (st.direction ?? 'warm'),
      strength: typeof st.strength === 'number' ? st.strength : 0.14,
      // A tint curve must be finished before it reaches skin or it lightens every face.
      pivot: typeof st.pivot === 'number' ? st.pivot : 0.18,
      rejoin: typeof st.rejoin === 'number' ? st.rejoin : 0.60,
      rule: st.rule ?? `${st.hue ?? 'warm'}. Never blue.`,
      hex_ref: st.hex_ref ?? null,
      shape_note: st.shape_note ?? 'The tint curve rejoins the diagonal before it reaches skin. A three-point curve stays above the diagonal through the midtones and lightens every face.',
    },
    highlight_rolloff: g.highlight_rolloff ?? { knee: 0.78, softness: 0.35 },
    saturation: g.saturation ?? { global: 0.94, shadows: 0.88 },
    skin_qualifier: {
      enabled: sk.enabled !== false,
      protection: sk.protection ?? 'hold',
      hold_black: typeof sk.hold_black === 'number' ? sk.hold_black : -0.03,
      rule: sk.rule ?? sk.principle ?? 'No global move may take skin outside its lock, in either direction.',
      ...sk,
    },
    grain: {
      enabled: gr.enabled !== false && gr.required !== false,
      // Two conventions are in use: a 0..1 fraction, or ffmpeg's own 0..100 scale.
      // A value above 1 is already on the ffmpeg scale.
      strength: typeof gr.strength === 'number'
        ? (gr.strength > 1 ? gr.strength / 100 : gr.strength)
        : 0.035,
      strength_raw: gr.strength ?? null,
      size: typeof gr.size === 'number' ? gr.size : 1.4,
      size_note: typeof gr.size === 'string' ? gr.size : null,
      why: gr.why ?? null,
      note: gr.note ?? gr.when ?? 'Applied after the grade and before the subtitle burn, so the caption does not sit in the grain.',
    },
    forbidden: g.forbidden ?? g.never ?? [],
    never: g.never ?? [],
  };
}

// ---------------------------------------------------------------- sheets
// Either {twenty_frame_test:{evidence_held,outstanding}} or {axes:{angle:bool,...}}.
const AXES = ['angle', 'lighting', 'distance', 'expression'];

export function sheetAxes(sheet) {
  if (sheet.twenty_frame_test) {
    return {
      held: sheet.twenty_frame_test.evidence_held ?? [],
      outstanding: sheet.twenty_frame_test.outstanding ?? [],
    };
  }
  if (sheet.axes && typeof sheet.axes === 'object') {
    return {
      held: AXES.filter((a) => sheet.axes[a] === true),
      outstanding: AXES.filter((a) => sheet.axes[a] !== true),
    };
  }
  return { held: [], outstanding: [...AXES] };
}

export function setSheetAxes(sheet, held) {
  const h = AXES.filter((a) => held.includes(a));
  if (sheet.axes && typeof sheet.axes === 'object') {
    for (const a of AXES) sheet.axes[a] = h.includes(a);
  } else {
    sheet.twenty_frame_test = { evidence_held: h, outstanding: AXES.filter((a) => !h.includes(a)) };
  }
  return sheet;
}

// ---------------------------------------------------------------- effects
// A graph may put the film on each effects shot, or rely on the shot id carrying it
// (05-06 is film 5, shot 6). Both are unambiguous; neither is guessed at.
export function filmOfShotId(shotId, films) {
  const m = String(shotId).match(/^(\d+)-/);
  if (!m) return null;
  const n = Number(m[1]);
  const byOrder = films.find((f) => f.n === n || f.order === n);
  if (byOrder) return byOrder.id;
  const byName = films.find((f) => f.id === `M${n}`);
  return byName ? byName.id : null;
}

export function effectsShots() {
  const e = read('effects');
  const films = read('films').films;
  const out = {};
  for (const [id, v] of Object.entries(e.shots ?? {})) {
    out[id] = {
      ...v,
      id,
      film: v.film ?? filmOfShotId(id, films),
      camera_locked: v.camera_locked ?? /camera does not move|locked/i.test(v.instruction ?? ''),
    };
  }
  return out;
}

export function rejectionCriteria() {
  const rc = read('effects').rejection_criteria ?? [];
  // Either objects with ids, or plain sentences.
  return rc.map((c, i) => (typeof c === 'string'
    ? { id: `REJ.${i + 1}`, test: c, rule: c }
    : c));
}

// ---------------------------------------------------------------- joins
export function joins() {
  const t = read('transitions');
  const rt = t.room_tone ?? {};
  return (t.joins ?? []).map((j) => ({
    ...j,
    // A continuous join shares its frame and carries tone unless it says otherwise.
    shared_frame: j.shared_frame ?? (j.kind === 'continuous'),
    room_tone: j.room_tone ?? (j.kind === 'continuous'
      ? (/not reseated|same file|same level/i.test(rt.continuous ?? '') ? 'carry' : 'carry')
      : 'reseat'),
  }));
}

export function roomTone() {
  const rt = read('transitions').room_tone ?? {};
  return {
    id: rt.id ?? 'TONE.DEFAULT',
    lufs: rt.lufs ?? null,
    rule: rt.rule ?? rt.continuous ?? 'One continuous bed across a continuous join.',
    ...rt,
  };
}

// ---------------------------------------------------------------- memos
export function memoReason(m) {
  return m.reason ?? m.question ?? m.why ?? '';
}
export function memoAllows(m) {
  return m.allows ?? m.still_allowed ?? [];
}

// ---------------------------------------------------------------- material world
export function forbiddenEverywhere() {
  const mw = read('material_world');
  const bag = [];
  const walk = (node) => {
    if (typeof node === 'string') { bag.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (/forbid|never|not allowed|wrong/i.test(k)) walk(v);
        else if (typeof v === 'object') walk(v);
        else if (typeof v === 'string' && /\bif a frame contains|is wrong|never\b/i.test(v)) bag.push(v);
      }
    }
  };
  walk(mw);
  return bag.join(' ‖ ').toLowerCase();
}

export function materialSays(pattern) {
  return new RegExp(pattern, 'i').test(JSON.stringify(read('material_world')));
}

// ---------------------------------------------------------------- caption style
// A graph may state the caption as numbers or as design prose. Parsed here so the
// ASS writer does not grow its own guesswork - and so a graph that forbids an outline
// actually gets no outline.
const hexIn = (s, fallback) => {
  const m = String(s ?? '').match(/#([0-9A-Fa-f]{6})/);
  return m ? `#${m[1]}` : fallback;
};
const firstNumber = (s, fallback) => {
  const m = String(s ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : fallback;
};

export function captionStyle() {
  const st = read('typography').style ?? {};

  const colour = hexIn(st.colour ?? st.fill, '#F2EBE0');
  const opacity = (() => {
    const m = String(st.fill ?? '').match(/(\d+)\s*%/);
    return m ? Number(m[1]) / 100 : 1;
  })();

  // "none. Outlined captions read as television." means zero, not a default.
  const outlineOff = /^\s*none/i.test(String(st.outline ?? ''));
  const outline_px = outlineOff ? 0 : (typeof st.outline_px === 'number' ? st.outline_px : firstNumber(st.outline, 3));

  const shadowSpec = String(st.shadow ?? '');
  const shadowOff = /^\s*(none|false)\b/i.test(shadowSpec) || st.shadow === false;
  // "0 2px 14px rgba(0,0,0,0.92)" - the second length is the offset.
  const shadowOffsets = shadowSpec.match(/(\d+(?:\.\d+)?)px/g) ?? [];
  const shadow_px = shadowOff ? 0 : (shadowOffsets.length >= 2 ? Math.round(Number(shadowOffsets[1].replace('px', '')) / 2) : (shadowOffsets.length ? 1 : 0));
  const shadowAlpha = (() => {
    const m = shadowSpec.match(/rgba?\([^)]*?,\s*(\d?\.?\d+)\s*\)/);
    return m ? Number(m[1]) : 0.9;
  })();

  const place = st.placement ?? {};
  const safe_bottom_px = firstNumber(place.anchor, null) ?? read('typography').frame?.safe_bottom_px ?? 220;

  return {
    colour, opacity,
    outline: hexIn(st.outline_colour ?? st.outline, '#000000'),
    outline_px,
    shadow_px, shadow_alpha: shadowAlpha,
    alignment: /bottom/i.test(String(place.anchor ?? st.alignment ?? 'bottom')) ? 'bottom-centre' : (st.alignment ?? 'bottom-centre'),
    safe_bottom_px,
    // A beat with no narration carries no caption. Silence with a caption is not silence.
    silence_uncaptioned: /no caption|NO caption/i.test(JSON.stringify(place)),
    rule: place.rule ?? st.rule ?? null,
  };
}

// Sound cues, with direction/overrides.json applied.
//
// The package is frozen, so a stale creative note in it is corrected here rather than
// edited there. M1's cue puts the water on 01-07; beat 6 is the honouring - 01-06,
// "water at the feet" - and the directing packs say so outright. The richest sound in
// the film belongs on the gesture it is about.
export function soundCues(filmId) {
  const t = treatment(filmId);
  const cues = (t?.sound?.cues ?? []).map((c) => ({ ...c }));
  const overrides = (directionOverrides().sound_overrides ?? []).filter((o) => o.film === filmId);
  const applied = [];
  for (const o of overrides) {
    for (const c of cues) {
      if (o.cue_shot_was && c.shot !== o.cue_shot_was) continue;
      const before = { shot: c.shot, cue: c.cue };
      if (o.cue_shot) {
        c.shot = o.cue_shot;
        // The time moves with the cue. Leaving at_s pointing at the old shot's start
        // would put the sound on the right shot at the wrong moment.
        const target = (t?.shots ?? []).find((sh) => sh.id === o.cue_shot);
        if (target && typeof target.start_s === 'number') c.at_s = target.start_s;
      }
      if (o.find && typeof c.cue === 'string') c.cue = c.cue.split(o.find).join(o.replace);
      c.overridden = { from: before, reason: o.reason, class: o.class, authority: o.authority };
      applied.push(o);
    }
  }
  // An override that matched nothing is a defect, not a no-op: the package has moved
  // and the correction is now aimed at something that is not there.
  for (const o of overrides) {
    if (!applied.includes(o)) {
      throw new Error(`direction/overrides.json has a sound override for ${filmId} shot ${o.cue_shot_was} and the treatment has no such cue. The override and the package have drifted apart.`);
    }
  }
  return cues;
}

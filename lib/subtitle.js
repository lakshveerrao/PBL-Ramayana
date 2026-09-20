// subtitle.js - per-script caption planning and burn-in.
// Scripts are not interchangeable. Devanagari stacks conjuncts above and below the
// line; Telugu stacks further. A single line-height for all three clips the tall
// scripts, and the clip never shows up in the English cut.
import { read } from './store.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

let fontCache = null;
function fontIndex() {
  if (fontCache) return fontCache;
  fontCache = new Map();
  try {
    const out = execFileSync('fc-list', ['--format', '%{file}|%{family}\n'], { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const [file, families] = line.split('|');
      if (!file) continue;
      for (const fam of (families ?? '').split(',')) fontCache.set(fam.trim(), file.trim());
    }
  } catch { /* fontconfig absent - resolveFont falls through to the candidate paths */ }
  return fontCache;
}

export function resolveFont(lang) {
  const spec = read('typography').scripts[lang];
  if (!spec) throw new Error(`no typography for language ${lang}`);
  const idx = fontIndex();
  // Prefer the Regular face: fc-list maps a family to whichever face it saw last,
  // and a Bold default silently thickens every caption.
  const named = idx.get(spec.font_family);
  if (named) {
    const regular = named.replace(/-(Bold|Italic|BoldItalic|Medium|Light)\.(ttf|otf)$/i, '-Regular.$2');
    return existsSync(regular) ? regular : named;
  }
  for (const cand of spec.font_file_candidates ?? []) {
    for (const [, file] of idx) if (file.endsWith('/' + cand)) return file;
    if (existsSync(cand)) return cand;
  }
  // Last resort: any file whose family name mentions the script.
  for (const [fam, file] of idx) if (fam.toLowerCase().includes(spec.script.toLowerCase())) return file;
  return null;
}

export function burnPlan(lang) {
  const typo = read('typography');
  const spec = typo.scripts[lang];
  return {
    lang,
    script: spec.script,
    font_family: spec.font_family,
    font_file: resolveFont(lang),
    size_px: spec.size_px,
    line_height: spec.line_height,
    line_box_px: spec.line_box_px,
    max_chars_per_line: spec.max_chars_per_line,
    max_lines: spec.max_lines,
    safe_bottom_px: spec.safe_bottom_px,
    style: typo.style,
    frame: typo.frame,
  };
}

// Does a line fit its box, in characters and in lines?
export function fitsBox(text, lang) {
  const p = burnPlan(lang);
  const lines = wrap(text, p.max_chars_per_line);
  return {
    fits: lines.length <= p.max_lines && lines.every((l) => l.length <= p.max_chars_per_line),
    lines,
    max_lines: p.max_lines,
    max_chars: p.max_chars_per_line,
    overrun: lines.filter((l) => l.length > p.max_chars_per_line),
  };
}

export function wrap(text, max) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  // Greedy first, to learn how many lines this line actually needs.
  const greedy = greedyWrap(words, max);
  if (greedy.length <= 1) return greedy;

  // Then balance across that many lines, so a caption never leaves one word stranded
  // on its own line. A widow reads as a mistake on screen even when it fits the box.
  return balance(words, greedy.length, max) ?? greedy;
}

function greedyWrap(words, max) {
  const out = [];
  let line = '';
  for (const w of words) {
    if (line === '') line = w;
    else if ((line + ' ' + w).length <= max) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

// Split into exactly n lines, minimising the spread between the longest and shortest.
function balance(words, n, max) {
  let best = null;
  const splits = (start, remaining, acc) => {
    if (remaining === 1) {
      const last = words.slice(start).join(' ');
      if (last.length > max) return;
      const lines = [...acc, last];
      const lens = lines.map((l) => l.length);
      const spread = Math.max(...lens) - Math.min(...lens);
      if (!best || spread < best.spread) best = { lines, spread };
      return;
    }
    for (let i = start + 1; i <= words.length - remaining + 1; i++) {
      const piece = words.slice(start, i).join(' ');
      if (piece.length > max) break;
      splits(i, remaining - 1, [...acc, piece]);
    }
  };
  if (words.length < n) return null;
  splits(0, n, []);
  return best?.lines ?? null;
}

function srtTime(s) {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mil = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${sec},${mil}`;
}

// Build an SRT from a treatment. Cues sit on their shot's exact window.
export function srt(treatmentDoc, lang) {
  const shots = new Map(treatmentDoc.shots.map((s) => [s.id, s]));
  const cues = [];
  for (const [, n] of Object.entries(treatmentDoc.narration)) {
    const shot = shots.get(n.shot);
    if (!shot) continue;
    cues.push({ start: shot.start_s, end: shot.start_s + shot.duration_s, text: n[lang] });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues.map((c, i) => {
    const p = burnPlan(lang);
    const lines = wrap(c.text, p.max_chars_per_line);
    return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${lines.join('\n')}\n`;
  }).join('\n');
}

// ASS, not SRT+force_style.
//
// libass scales a subtitle script from its own PlayRes to the video size. An SRT has no
// PlayRes, so libass assumes one, and every force_style FontSize is multiplied by
// 1920/assumed. That renders a 44px caption at ~150px and throws it to the top of frame.
// Pinning PlayResX/PlayResY to the real frame makes Fontsize mean pixels, which is what
// the per-script metrics in data/typography.json are expressed in.
export function ass(treatmentDoc, lang) {
  const p = burnPlan(lang);
  const shots = new Map(treatmentDoc.shots.map((s) => [s.id, s]));
  const cues = [];
  for (const [, n] of Object.entries(treatmentDoc.narration)) {
    const shot = shots.get(n.shot);
    if (!shot) continue;
    cues.push({ start: shot.start_s, end: shot.start_s + shot.duration_s, text: n[lang] });
  }
  cues.sort((a, b) => a.start - b.start);
  return assDoc(cues, lang);
}

export function assDoc(cues, lang) {
  const p = burnPlan(lang);
  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${p.frame.width}`,
    `PlayResY: ${p.frame.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${p.font_family},${p.size_px},${assColour(p.style.colour)},&H000000FF,${assColour(p.style.outline)},&H00000000,0,0,0,0,100,100,0,0,1,${p.style.outline_px},0,2,60,60,${p.safe_bottom_px},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const body = cues.map((c) => {
    const lines = wrap(c.text, p.max_chars_per_line);
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${lines.join('\\N')}`;
  });
  return head.concat(body).join('\n') + '\n';
}

function assTime(s) {
  // ASS resolves to centiseconds. Every M3 duration is a multiple of 0.2s so this is
  // exact; a treatment with odd-frame durations would round by at most half a frame.
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// The ffmpeg filter that burns an ASS file for this language.
export function burnFilter(assPath, lang) {
  const p = burnPlan(lang);
  if (!p.font_file) throw new Error(`no font available for ${lang} (${p.font_family}) - the caption would render as boxes`);
  const dir = p.font_file.replace(/\/[^/]+$/, '');
  return `ass=${assPath}:fontsdir=${dir}`;
}

function assColour(hex) {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

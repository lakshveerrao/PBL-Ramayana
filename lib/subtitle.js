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
  const words = text.split(/\s+/);
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

// The ffmpeg subtitles filter for this language, using the per-script metrics.
export function burnFilter(srtPath, lang) {
  const p = burnPlan(lang);
  if (!p.font_file) throw new Error(`no font available for ${lang} (${p.font_family}) - the caption would render as boxes`);
  const style = [
    `FontName=${p.font_family}`,
    `FontSize=${Math.round(p.size_px * 0.75)}`,
    `PrimaryColour=${assColour(p.style.colour)}`,
    `OutlineColour=${assColour(p.style.outline)}`,
    `Outline=${p.style.outline_px}`,
    'Shadow=0',
    'BorderStyle=1',
    'Alignment=2',
    `MarginV=${p.safe_bottom_px}`,
  ].join(',');
  const dir = p.font_file.replace(/\/[^/]+$/, '');
  return `subtitles=${srtPath}:fontsdir=${dir}:force_style='${style}'`;
}

function assColour(hex) {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

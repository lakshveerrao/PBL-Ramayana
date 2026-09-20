// voice.js - narration, line by line, never the whole script in one call.
// The edit owns the silences.
import { read, treatment, ensureDir, ROOT } from './store.js';
import * as providers from './providers.js';
import { UNIT } from './cost.js';
import { assertWithinCeiling, recordSpend } from './state.js';
import { spendAllowed } from './env.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function plan(filmId, lang) {
  const t = treatment(filmId);
  const n = read('narrator');
  const lines = Object.entries(t.narration).map(([id, v]) => ({
    id, shot: v.shot, text: v[lang], speaker: v.speaker ?? null,
    delivery: n.delivery_notes[filmId]?.lines?.[v.shot] ?? null,
    chars: (v[lang] ?? '').length,
  }));
  const chars = lines.reduce((a, l) => a + l.chars, 0);
  return {
    film: filmId, lang, lines, characters: chars,
    settings: n.voice_settings,
    overall_delivery: n.delivery_notes[filmId]?.overall ?? null,
    register: n.languages[lang]?.register ?? null,
    estimate_usd: round(chars * UNIT.voice.usd),
    rule: n.per_line_rule,
  };
}

export async function speakFilm(filmId, lang, { allow_spend = null } = {}) {
  const p = plan(filmId, lang);
  assertWithinCeiling(p.estimate_usd);
  const permitted = allow_spend === null ? spendAllowed() : allow_spend;
  if (!permitted) {
    return { spent: false, would_spend: p.estimate_usd, ...p, reason: 'ALLOW_SPEND is not 1. This is the plan and the estimate; nothing was sent.' };
  }

  const dir = ensureDir(`renders/${filmId}/voice/${lang}`);
  const written = [];
  for (const line of p.lines) {
    // One call per line. Never the whole script.
    const audio = await providers.voice.speak({ text: line.text, lang });
    const file = join(dir, `${line.id}.mp3`);
    writeFileSync(file, audio);
    const usd = line.chars * UNIT.voice.usd;
    recordSpend({ provider: 'elevenlabs', route: 'voice', model: lang, label: `${filmId}/${lang}/${line.id}`, usd, estimate_usd: usd });
    written.push({ id: line.id, shot: line.shot, file: `renders/${filmId}/voice/${lang}/${line.id}.mp3`, chars: line.chars });
  }
  return { spent: true, film: filmId, lang, files: written, usd: round(p.estimate_usd) };
}

function round(n) { return Math.round(n * 1e6) / 1e6; }

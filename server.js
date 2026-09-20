// server.js - plain Node http. No framework, on purpose.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ROOT, read, treatment, film, filmByStory } from './lib/store.js';
import { loadEnv, env } from './lib/env.js';
import { estimate, renderShot, renderMotion, loadRecord } from './lib/render.js';
import { checkFilm } from './lib/consistency.js';
import { pingAll, configured } from './lib/providers.js';
import { assemble } from './lib/prompt.js';
import { srt, burnPlan, fitsBox } from './lib/subtitle.js';
import { estimateFilm, estimateArc } from './lib/cost.js';
import { direct } from './lib/direct.js';
import { uploadSheet, approveSheet } from './lib/sheets.js';
import { speakFilm } from './lib/voice.js';

loadEnv();
const PORT = Number(env('PORT', '4173'));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.srt': 'text/plain; charset=utf-8' };

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
};

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

const routes = [
  ['GET', /^\/api\/state$/, async () => ({
    providers: configured(),
    films: read('films', { fresh: true }).films.map((f) => ({ id: f.id, title: f.title_en, status: f.status, sarga: f.sarga, has_treatment: !!treatment(f.id) })),
    claims: countBy(read('claims', { fresh: true }).claims, 'state'),
    sheets: read('sheets', { fresh: true }).sheets.map((s) => ({ id: s.id, approved: s.approved, approved_by: s.approved_by, files: s.files.length, outstanding: s.twenty_frame_test.outstanding })),
    memos: read('memos', { fresh: true }).memos.filter((m) => m.state === 'outstanding').map((m) => m.entity),
    spend: read('spend', { fresh: true }).totals,
    estimates: { film_cached: estimateFilm({ first_film: false }).usd, arc7: estimateArc(7).usd },
  })],

  ['GET', /^\/api\/preflight$/, async () => ({ providers: await pingAll() })],

  ['GET', /^\/api\/films\/([^/]+)$/, async (m) => {
    const f = film(m[1]);
    const t = treatment(m[1]);
    return { film: f, treatment: t, gate: t ? checkFilm(t.shots) : null, claims: read('claims').claims.filter((c) => c.film === m[1]) };
  }],

  ['POST', /^\/api\/films\/([^/]+)\/direct$/, async (m, req) => {
    const opts = await body(req);
    return direct(m[1], opts);
  }],

  ['GET', /^\/api\/render\/([^/]+)\/estimate$/, async (m) => estimate(filmByStory(m[1]).id)],

  ['POST', /^\/api\/render\/([^/]+)\/shot\/([^/]+)$/, async (m, req) => {
    const opts = await body(req);
    return renderShot(filmByStory(m[1]).id, m[2], opts);
  }],

  ['POST', /^\/api\/render\/([^/]+)\/motion\/([^/]+)$/, async (m, req) => {
    const opts = await body(req);
    return renderMotion(filmByStory(m[1]).id, m[2], opts);
  }],

  ['POST', /^\/api\/render\/([^/]+)\/voice\/([a-z]{2})$/, async (m, req) => {
    const opts = await body(req);
    return speakFilm(filmByStory(m[1]).id, m[2], opts);
  }],

  ['GET', /^\/api\/render\/([^/]+)\/shot\/([^/]+)$/, async (m) => {
    const rec = loadRecord(filmByStory(m[1]).id, m[2]);
    return rec ?? { record: null, reason: 'no render record for this shot yet' };
  }],

  ['GET', /^\/api\/prompt\/([^/]+)\/([^/]+)$/, async (m) => {
    const id = film(m[1]).id;
    const shot = treatment(id).shots.find((s) => s.id === m[2]);
    if (!shot) throw new Error(`no shot ${m[2]} in ${id}`);
    return { shot: shot.id, ...assemble(shot, id) };
  }],

  ['POST', /^\/api\/sheets\/([^/]+)\/upload$/, async (m, req) => uploadSheet(m[1], await body(req))],
  ['POST', /^\/api\/sheets\/([^/]+)\/approve$/, async (m, req) => approveSheet(m[1], await body(req))],

  ['GET', /^\/api\/narrator\/([^/]+)$/, async (m) => ({
    settings: read('narrator').voice_settings,
    per_line_rule: read('narrator').per_line_rule,
    delivery: read('narrator').delivery_notes[m[1]] ?? null,
    languages: read('narrator').languages,
  })],

  ['GET', /^\/api\/subtitles\/([^/]+)\/([a-z]{2})$/, async (m) => {
    const t = treatment(film(m[1]).id);
    const plan = burnPlan(m[2]);
    const overruns = Object.entries(t.narration).filter(([, n]) => !fitsBox(n[m[2]], m[2]).fits).map(([id]) => id);
    return { plan, srt: srt(t, m[2]), overruns };
  }],

  ['GET', /^\/api\/spend$/, async () => read('spend', { fresh: true })],
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  for (const [method, re, fn] of routes) {
    if (req.method !== method) continue;
    const m = path.match(re);
    if (!m) continue;
    try { return json(res, 200, await fn(m, req)); }
    catch (e) {
      const code = e.name === 'GateRefusal' || e.name === 'MotionRefusal' || e.name === 'RightsError' || e.name === 'CeilingError' ? 409 : 400;
      return json(res, code, { error: e.name, message: e.message, detail: e.detail ?? null });
    }
  }

  if (path === '/favicon.ico') { res.writeHead(204); return res.end(); }

  // static
  let file = path === '/' ? '/index.html' : path;
  const candidates = [join(ROOT, 'public', file), join(ROOT, file.replace(/^\//, ''))];
  for (const c of candidates) {
    if (existsSync(c) && !c.includes('..')) {
      res.writeHead(200, { 'Content-Type': MIME[extname(c)] ?? 'application/octet-stream' });
      return res.end(await readFile(c));
    }
  }
  json(res, 404, { error: 'not found', path });
});

function countBy(rows, key) {
  const o = {};
  for (const r of rows) o[r[key]] = (o[r[key]] ?? 0) + 1;
  return o;
}

server.listen(PORT, () => {
  console.log(`\nPBL Ramayana Studio`);
  console.log(`  pipeline console  http://localhost:${PORT}/index.html`);
  console.log(`  render console    http://localhost:${PORT}/render.html\n`);
});

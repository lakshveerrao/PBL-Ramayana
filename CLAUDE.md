# CLAUDE.md — PBL Ramayana Studio

Standing context. Read this before touching anything.

---

## What this is

**PBL Ramayana** — the Rāmāyaṇa told as ~900 micro-episodes of about 44 seconds each, in
English, Hindi and Telugu. Brand: PBL, Projects by Laksh.

Three parts, and they must stay separate:

| | |
|---|---|
| **The graph** | `data/` is the source of truth. Everything — entities, scenes, claims, locks, sound, music, direction — lives here. The graph pages are VIEWS generated from it and can never drift. |
| **The studio** | The creation room. Turns locked records into frames, voice and cuts. |
| **The webapp** | The experience. Player, chain, doors, Ledger, Trail. Not built yet. |

**Never hand-edit a generated page.** Edit `data/`, then rebuild.

---

## The Golden Rule

Above everything else in this repo:

- **No invented events, motives or consequences.** Ever.
- Every line comes from somewhere, and we can show where.
- Where the text is silent, we say so.
- What we chose for the screen, we declare as ours.

We do **not** claim authentic, definitive, faithful or scholarly. The moment a face and a
lamp enter a frame, something has been added the text does not specify. The promise is only
that we always say which is which.

---

## Non-negotiables

**Evidence classes never collapse.** `T` spine · `Tr` named tradition · `I` inference ·
`S` our staging. A tradition is never promoted to Text. An inference must name what it is
inferred *from* — "period-appropriate" is not a source; "Amarāvatī, 2nd–3rd c. CE, court
panel" is.

**Claim states are distinct.** `proposed` · `accepted` · `disputed` · `unresolved`. Nothing
is promoted because its passage exists. `accepted` means an AI-assisted passage check — it
is **not** qualified human review, and no code or copy may imply it is. Every accepted
claim carries a verification record naming the method and whether a digitised text was
actually consulted.

**Restricted sources.** The GRETIL Sanskrit digitisation is CC BY-NC-SA. Its verse text must
never enter a public payload, a generation input, or an export. Locators travel; text does
not. Claims verified against it remain valid — verification is not redistribution.

**Gates bind only their real dependency.** A gate on one entity never blocks unrelated work,
and no gate ever blocks writing. Every gate names what it still *allows*.

**Speaker attribution survives everywhere.** "Not yet sixteen" is Daśaratha's statement,
never narrator fact.

**Nothing is anglicised.** Cloth is woven, cut from the loom and **draped** — never tailored.
Post-and-lintel only: no arches, domes, marble. Ornament from the relief vocabulary. Skin is
never lightened, and fair-equals-good coding is forbidden outright.

---

## Layout

```
data/          23 JSON files — THE SOURCE OF TRUTH
agents/        8 system prompts + _shared.md — the real editorial asset
corpus/        holds NO text, deliberately. See corpus/README.md.
exports/       treatments — the film as written. The standard a direction is judged against.
lib/           store · sources · cost · state · consistency · providers · claude · fal ·
               eleven · prompt · render · subtitle · direct · sheets · voice · agents · env
tools/         validate · regress · dryrun · preflight · ingest · build_*
graph/         generated views — never hand-edit
public/        index.html (pipeline console) · render.html (render console)
```

---

## Commands

```bash
npm run validate          # offline, no key, no spend
node tools/regress.js      # behaviour, blocked case beside allowed
node tools/dryrun.js       # exercise the pipeline with mock responses
npm run preflight          # one cheap call per provider; honest about "no key set"
npm start                  # http://localhost:4173
```

**Run `npm run validate` and `node tools/regress.js` before and after every change.**
Both must be green. Update a test **only** when its intended invariant genuinely changed,
and then add a blocked case beside the allowed one. Never weaken a check to pass.

---

## Providers

One interface per concern in `lib/providers.js`. Swap in `.env`, change no code.

```
TEXT_PROVIDER=anthropic
IMAGE_PROVIDER=fal
MOTION_PROVIDER=fal
VOICE_PROVIDER=elevenlabs
MUSIC_PROVIDER=none        # composed by a person. Deliberate. No API writes our theme.
```

**Model routing** is in `lib/cost.js`: Haiku assembles image prompts, Sonnet writes, Opus
criticises — and critics run on a different model from the director, on purpose. Prompt
caching is on; the system block never varies between films.

`ALLOW_SPEND=0` by default. Every route answers "what will this cost" before it runs, and
`SPEND_CEILING_USD` refuses a run that would exceed it.

---

## Things that will look like bugs and are not

- **Films 1–2 and 4–7 have `proposed` claims and no treatment.** Correct. An editor has not
  disposed.
- **`data/passages.json` holds only Bāla 18–26, and holds no text.** Correct.
- **`corpus/` is empty of text.** Correct. See `corpus/README.md`.
- **Every accepted claim says `text_consulted: false`.** Correct and deliberate — no
  digitised edition is reachable from this environment, and the record says so rather than
  implying a check that did not happen.
- **Rāma's complexion is "not established".** Correct, and the gate blocks *claiming* a
  source-mandated complexion — **not** depicting him.
- **`MUSIC_PROVIDER=none`.** Deliberate. `data/music.json` is a brief for a composer.
- **The consistency gate refuses 15 of M3's 18 shots.** Correct. No principal has an
  approved sheet. The 3 it allows carry no principal in frame.

---

## Tone, if you write any copy

Plain speech. Short sentences. No fake-epic vocabulary, no translation register
("rained upon his altar"), no marketing adjectives. The test line is *He said no.* —
three level words. If a line could not be said aloud to a friend, it is written wrong.

---

## What is verified, and how

Four checks measure rather than assert. Run them with `npm run check` (the first two) or
individually.

| | |
|---|---|
| `npm run typecheck` | Burns every conjunct and every narration line through the real libass path at 1080×1920 and measures the ink box against the per-script line box. Telugu conjuncts really are the tallest, which is why the line boxes differ. |
| `npm run gradecheck` | Pushes every locked skin albedo through the real grade chain and measures L\* out against the lock, **in both directions**. Lightening is the colourism defect; drifting dark is a consistency defect against the same lock. |
| `npm run cutcheck` | Pulls each shot boundary out of the finished video and confirms the cut lands on the frame the shot list names, and that no face drifts outside its lock through grade, grain and encode. |
| `node tools/joincheck.js` | Checks that continuous joins actually join. Reports "not checkable" rather than passing vacuously when a film has no treatment yet. |

`lib/register.js` runs the register check offline, so the Opus critic is only paid for an
opinion on something that already passes deterministically.

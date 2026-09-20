# HANDOFF — what the studio needs from the graph

The **graph** is the source of truth: entities, claims, locks, direction, sound, music.
The **studio** is this repository: it turns locked records into frames, voice and cuts.
They are separate on purpose, and this file is the seam between them.

The studio does not author graph content. Point it at a graph and it runs.

---

## How to hand a graph over

```bash
node tools/import_graph.js <path-to-graph-dir>      # check it, show what changes
node tools/import_graph.js <path-to-graph-dir> --install
npm run validate && node tools/regress.js
```

`import_graph.js` never overwrites without `--install`, and it backs up whatever is
already in `data/` to `data/_replaced/<timestamp>/` first. It reports every missing
file, every missing required field, and every broken reference **before** it installs
anything.

A graph directory is just the JSON files below, at its top level, plus a `treatments/`
folder.

---

## What is currently in `data/` is SCAFFOLD

The repo ships with a small working graph — 7 films, 1 directed, 18 claims, 5 entities —
written so the studio could be built and proven end to end. **It is not the Rāmāyaṇa
graph.** It exists to be replaced. See `data/_SCAFFOLD.md`.

---

## Required files

The studio refuses to validate without these. Everything the studio does reads from them.

| file | key | what the studio does with it |
|---|---|---|
| `films.json` | `films[]`, `arcs[]` | what to direct, cut and join |
| `claims.json` | `claims[]` | the claim gate; the Ledger; the director's brief |
| `entities.json` | `entities[]` | prompt assembly — who is in frame and how they are built |
| `locks.json` | `locks[]` | the consistency gate; skin protection in the grade |
| `sheets.json` | `sheets[]`, `_twenty_frame_spec`, `_upload_spec` | the model-sheet gate |
| `memos.json` | `memos[]` | the memo gate — who may not be designed yet |
| `passages.json` | `passages[]` | locators only. Never text |
| `source_register.json` | `sources[]` | the rights gate |
| `kandas.json` | `kandas[]` | the brain view; film placement |
| `episodes.json` | `episodes[]` | the brain view |
| `material_world.json` | architecture, cloth, ornament, light, forbidden | prompt assembly |
| `typography.json` | `frame`, `scripts{}`, `style` | per-script caption metrics |
| `grade.json` | levels, shadow tint, skin qualifier, grain | the grade chain |
| `effects.json` | `shots{}`, `rejection_criteria[]` | motion, and the motion refusal |
| `transitions.json` | `joins[]`, `room_tone` | continuous joins |
| `narrator.json` | `voice_settings`, `languages{}`, `delivery_notes{}` | voice, register, attribution markers |
| `music.json` | `provider`, `brief` | must stay `none`. No API writes the theme |
| `evidence_libraries.json` | `libraries[]` | what an inference may cite |
| `traditions.json` | `traditions[]` | named traditions |
| `spend.json` | `rows[]`, `totals` | the ledger. Ship it empty |

Optional: `threads.json`, `incidents.json`, `app_design.json`.

---

## Field contracts that the gates depend on

These are not style preferences. A gate reads them and refuses on them.

### `claims[]`

```jsonc
{
  "id": "CLM....",                 // unique
  "film": "M3",                    // or null
  "text": "Dasaratha refuses...",  // plain speech
  "evidence_class": "T",           // T | Tr | I | S  — never collapse
  "state": "accepted",             // proposed | accepted | disputed | unresolved
  "speaker": "DASARATHA",          // required when speech_act is true; must be an entity
  "speech_act": true,
  "locator": {                     // required for every T claim; MUST be null for S
    "work": "VR", "kanda": "BALA", "sarga": 20, "verses": "9-10",
    "source": "SRC.GRETIL.VR"      // must exist in source_register
  },
  "verification": {                // required when state is "accepted"
    "method": "ai-passage-check",  // ai-passage-check | human | none
    "text_consulted": false,       // boolean, always present
    "basis": "...",                // what was actually consulted. >10 chars
    "attested_at": "2026-09-20",
    "attested_by": "..."           // a person's name when method is "human"
  }
}
```

- `Tr` claims must carry `tradition`. A tradition is **never** class `T`.
- `I` claims must carry `inferred_from` (an id in `source_register` or
  `evidence_libraries`) and `inference_basis` containing a date or a specific holding.
  "period-appropriate" is rejected.
- `S` claims must carry `staging_note` and **must not** carry a locator.
- A `proposed` claim must have `verification.method === "none"`.
- Nothing in any file may imply human or scholarly review for an AI-accepted claim.

### `treatments/<FILM>.json`

One per directed film, referenced from `films[].treatment` as a repo-relative path.

```jsonc
{
  "film": "M3", "duration_s": 44.0, "fps": 30, "frame": [1080, 1920],
  "shots": [{
    "id": "03-05", "start_s": 18.4, "duration_s": 2.4,
    "size": "WIDE|MS|MCU|CU|INSERT", "lens_mm": 85,
    "height": "eye|high|low|slightly low", "camera_move": "locked",
    "expression": "...", "source": "generate|reuse|crop",
    "reuse_of": null, "crop_of": null,
    "entities": ["DASARATHA"], "claims": ["CLM...."], "narration": "L3"
  }],
  "narration": { "L3": { "shot": "03-05", "en": "...", "hi": "...", "te": "...",
                         "speaker": "DASARATHA", "speaker_rule": "..." } }
}
```

Hard rules the studio checks:

- Durations sum to `films[].duration_s` **exactly**, and every duration is a whole
  number of frames at `fps`.
- `start_s` values are contiguous from 0.
- A `reuse_of` / `crop_of` points only at an **earlier** shot in the same treatment.
- Every shot citing claims cites at least one `accepted` one, and never a `disputed` one.
- No shot cites a claim belonging to another film.
- No shot stages an entity whose memo is `outstanding`.
- Narration exists in **every** language declared in `narrator.languages`.
- A narration line with a `speaker` must carry one of that language's
  `attribution_markers` **in every language**, and must state a `speaker_rule`.
  Without the marker a character's statement becomes narrator fact, which is the
  collapse this project exists to prevent.
- English lines: 12 words maximum, no fake-epic vocabulary, no marketing adjectives.

### `locks[]` — skin albedo

```jsonc
{ "id": "LOCK.SKIN.X", "entity": "X", "kind": "skin_albedo",
  "value": { "srgb_hex": "#6B4A33", "lab_L": 34.5, "tolerance_L": 2.0 },
  "rule": "Never lighten. ..." }
```

`lab_L` must match `srgb_hex` to within 1.0 — the studio computes it and refuses if the
data disagrees with itself. `npm run gradecheck` then measures each albedo through the
real grade chain and fails if any face drifts outside `tolerance_L` **in either
direction**.

### `narrator.languages[lang]`

```jsonc
{ "voice_env": "ELEVEN_VOICE_TE", "register": "plain spoken Telugu...",
  "attribution_markers": ["అన్నాడు", "అడిగాడు", ...] }
```

Attribution markers are **data**, so the graph supplies its own per language. The studio
does not hardcode any language's grammar. Every language declared here must also have a
`typography.scripts[lang]` entry.

### `typography.scripts[lang]`

`size_px`, `line_height`, `line_box_px`, `max_chars_per_line`, `max_lines`,
`safe_bottom_px`, `font_family`, `font_file_candidates[]`, and for non-Latin scripts a
`conjunct_probe[]` of **real conjuncts or base+mark pairs** — an isolated combining mark
has no base and measures nothing. `line_box_px` must be at least `size_px × line_height`,
and any stacking script must get a taller line box than Latin.

`npm run typecheck` burns every probe and every line through the real libass path and
measures the ink box.

### `sheets[]`

Ship every principal with `approved: false`, `files: []`, `hashes: []`, and all four axes
outstanding. **Only a named human approves**, through the studio's own endpoint. The
graph must not hand over pre-approved sheets.

### `effects.shots{}`

A shot whose `instruction` contains `NO MOTION` must have `motion: false`, and vice
versa. The studio refuses motion on those in code, not by note.

---

## What the studio will refuse

| refusal | when |
|---|---|
| `GateRefusal` | a shot stages a principal with no approved model sheet |
| `GateRefusal` | a prompt is assembled for an entity with an outstanding memo |
| `MotionRefusal` | motion is requested on a `NO MOTION` shot |
| `RightsError` | source text rides in any outbound payload or export |
| `CeilingError` | a run would spend past `SPEND_CEILING_USD` |

None of these are bypassable from a render route. Every gate names what it still
**allows**, so a refusal never blocks unrelated work.

---

## What the studio provides back

- `npm run validate` — 119 invariants over whatever graph is installed
- `node tools/regress.js` — behaviour, each rule with its blocked case beside its allowed one
- `npm run typecheck` / `gradecheck` / `cutcheck` / `joincheck` — measured, not asserted
- `npm run preflight` — provider reachability, honest about "no key set"
- `npm run dryrun` — the whole pipeline on mock responses, no key, no spend
- `python3 tools/build_graph.py` / `build_brain.py` / `build_packets.py` — generated views
- `node tools/build_export.js` — the public payload, rights-gated
- `node tools/assemble.js <FILM>` — the cut, one file per language
- `npm start` — the two consoles

---

## Things the graph must NOT hand over

- Restricted source text, anywhere. Locators travel; text does not.
- Pre-approved model sheets.
- Claims promoted to `accepted` without a verification record.
- A `music.provider` other than `none`.
- Any entity design for an entity whose memo is still `outstanding`.

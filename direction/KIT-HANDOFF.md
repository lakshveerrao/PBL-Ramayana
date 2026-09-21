# PBL Ramayana — Arc 7 Studio Handoff

**Viśvāmitra at Ayodhyā · seven films · 299.7 seconds · English, Hindi, Telugu**
Prepared 21 September 2026 by the source and creative workspace, for the production studio.

---

## 0 · Read this first

This kit hands the studio everything it needs to make the first seven films of PBL Ramayana: the frozen source and editorial state, a directing pack for every film, and the rules for working with both.

**All seven films are production-ready.** Every shot has an authored subject, framing and source, and every line of narration exists in three languages with its speaker and evidence attached. The evidence behind them is not uniform, and should be read exactly:

- **M2–M7** rest on the audited Sanskrit spine — Bāla 18.1–20, 19.1–24, 20.1–9 and 21.1–6 — with Dutt's 1891 English as the corresponding comparison.
- **M1's core claim** — the king's promise, given before he hears the request — is supported by **Dutt XVIII**.
- **Sarga 17 is not loaded.** The reception in M1 — the arrival, the king stepping down, the water at the sage's feet — is therefore **declared staging**. The picture shows it; the narration does not assert it.

What the kit does **not** contain: character designs, footage, voices, music or edits. Those belong to the studio. This workspace cannot see them, and nothing here should be read as saying they do or don't exist. **PRODUCTION ASSET EXTERNAL / UNKNOWN HERE.**

**Order of reading:** this document → the directing packs → the character briefs → the package, as needed.

---

## 1 · The kit

| Item | What it is | Mutable? |
|---|---|---|
| `pbl-source-state-v1.0.6-studio-handoff.zip` | The frozen source and editorial package. 47 files. | **No.** Never edit. |
| `pbl-ramayana-arc7-directing-packs.md` | Creative direction for M1–M7: intent, performance, every shot, sound, language. | Yes — it's direction. |
| `pbl-ramayana-arc7-character-briefs.md` | Design briefs for the five principals and Kausalyā's hands — what each model sheet must be. | Yes — creative proposals until a sheet is approved. |
| `HANDOFF.md` | This document. | Yes. |
| `CHECKSUMS.txt` | SHA-256 of every item in the kit. | — |

**Package identity**
- Version `1.0.6` — frozen
- MANIFEST `20aeb6ccd1442311ed94aa855ff08f51102e38055cb3fb6af258ebf963020e65`
- Zip `5c9243cf0006376d3600072289ac0aa64b587d8773b90f1f2998960155d60b57`

Earlier versions (1.0.0–1.0.5) exist for history. **Use 1.0.6.** Each carries a migration note explaining what changed and why.

---

## 2 · What you are being handed

| | Film | Length | Shots | Generate | Reuse / crop | Lines | Joins |
|---|---|---|---|---|---|---|---|
| M1 | The Promise | 32.1 s | 16 | 14 | 2 | 5 | session open → hard |
| M2 | The Ask | 42.1 s | 18 | 11 | 7 | 11 | hard → continuous |
| M3 | A Father Says No | 51.4 s | 23 | 14 | 9 | 11 | continuous → continuous |
| M4 | The Name Behind Them | 48.7 s | 18 | 7 | 11 | 9 | continuous → continuous |
| M5 | The Sage's Anger | 40.4 s | 16 | 8 | 8 | 9 | continuous → continuous |
| M6 | Vasiṣṭha's Word | 44.6 s | 22 | 16 | 6 | 6 | continuous → continuous |
| M7 | Two Sons Leave | 40.4 s | 21 | 19 | 2 | 4 | continuous → end |
| | **Total** | **299.7 s** | **134** | **89** | **45** | **55** | |

**55 narration units, each in English, Hindi and Telugu. 35 accepted claims** underpin them.

**The arc in one line:** a king gives his word before hearing the request; is asked for his son; refuses; is shamed; is shown he was refusing the very protection he wanted; and gives him — glad. Then two boys walk out of a house behind an old man.

**M2 through M7 are one continuous run.** Each film opens on the exact frame the last one closed on. Release them in order; releasing a film from the middle hands a viewer half a sentence.

---

## 3 · The boundary

| The source package owns | The studio owns |
|---|---|
| What is true: claims, locators, sources | Approved character models and references |
| Who said it: speaker and attribution | Generated frames and motion |
| What may be shown: gates and memos | Voices and recordings |
| What may be quoted or reused: rights | Music, if any |
| What is sourced versus ours: classification | Edit, grade, mix, export |
| The execution graph: who is in each shot, and where it comes from | Spend and schedule |

**The studio's approved designs always win on appearance.** The package deliberately names no faces, complexions, crowns or costumes — every prompt says *"exactly as the APPROVED MODEL SHEET."* If anything in the package seems to describe a design, the approved sheet overrides it.

**The package always wins on truth.** If an approved design, a generated frame or an edit would show or say something the package doesn't support, the package is right and the frame is wrong.

### Precedence between the package and the directing packs

**SOURCE TRUTH PRECEDENCE — v1.0.6 wins for:**
claims · locators · evidence · attribution · rights · gates · tradition separation · the sourced-versus-artistic classification of every shot and line.

**CREATIVE DIRECTION PRECEDENCE — the latest directing packs win for:**
performance · framing intent · sound direction · rhythm · and every other creative note.

**The directing packs may never override source truth.** If a pack ever appears to — to show something unsourced, drop an attribution, or move a gate — the pack is wrong.

This rule exists because the frozen package deliberately keeps a few **stale creative notes** that the packs already supersede: a beat label, a sound cue's beat number, two expression notes, one contradictory performance note, and one image-prompt phrase — M7/06's "sleeve", which the packs correct before it can be generated. They are listed at the end of the directing packs. Where they differ from the packs, **the packs win** — they are creative, not source.

---

## 4 · Importing the package

Run the studio's importer as a dry run first. It reports everything and writes nothing.

```
node tools/import_graph.js <path-to-unzipped-v1.0.6>
```

**Expect friction in three known places.** Each is the contract catching up with a deliberate decision, not a defect in the package:

1. **CLM-0001's locator** uses Dutt's own section numbering — `section: XVIII`, with `sarga` and `verses` null. No Sanskrit verse equivalence is asserted, so none is encoded. If the importer requires a sarga on every Text claim, change the importer.
2. **There are no per-character skin values.** One lock, `LOCK.SKIN.POLICY`, says: never lighter than the approved sheet. The sheets set skin, not this package. `gradecheck` has nothing numeric to measure until the sheets exist.
3. **Fields the importer hasn't seen:** `claims_proposed`, `context_claims`, `continues_from`, `basis`, and on narration `assertion`, `evidence`, `original_speaker`. These carry meaning the studio needs — see §5. Accept them; don't strip them.

**Anything else the importer refuses:** report the exact field and reason before changing anything. If it's a genuine defect in the package, that becomes version 1.0.7, with evidence. If it's the contract lagging, fix the contract.

Then install:

```
node tools/import_graph.js <path> --install
npm run validate && node tools/regress.js
python3 contradictions.py <path>      # ships inside the package
```

---

## 5 · How to read the package

**The five files production uses most**

| File | Holds |
|---|---|
| `treatments/M1.json` … `M7.json` | Every shot and every narration unit, fully resolved. **Start here.** |
| `execution_graph.py` | The authored source for every shot's subjects, size, lens, source, link and basis |
| `narration_units.py` | The authored source for every line, in three languages, with its class and evidence |
| `render_policy.json` | Frame, negative prompt, identity method, acceptance criteria |
| `authority.json` | What is binding, what is a proposal, and which file wins when two disagree |

**Per shot — fields that matter**

| Field | Means | Does NOT mean |
|---|---|---|
| `entities` | Exactly who and what is in frame | Anyone merely mentioned |
| `source` | `generate`, `reuse` or `crop` | — |
| `reuse_of` | The same frame, same person, same state, earlier in this film | A similar frame |
| `crop_of` | A tighter frame cut from an equal-or-wider frame of the same moment | A way to get a different person or expression |
| `continues_from` | A frame from an earlier film — the continuous joins | — |
| `claims` | Accepted claims the **image itself** depicts | Context, or what's said over it |
| `context_claims` | Claims that frame the shot but that the image doesn't fully show | Evidence for the image |
| `claims_proposed` | Unaccepted claims the image depends on — **none remain in M1–M7** | — |
| `basis` | Source-supported, source-inferred, or artistic adaptation | Anything about quality |
| `image_prompt` | Built from the execution graph and the visibility notes. Faces withheld are written into it. | A design specification |
| `motion` / `motion_allowed` | The ambient life allowed on this shot. **05-06 is `NO MOTION` and must refuse.** | Camera movement |

**Per narration unit**

| Field | Means |
|---|---|
| `assertion` | `SOURCE_FACT`, `SOURCE_INFERRED`, `CHARACTER_SPEECH`, `NARRATOR_PARAPHRASE`, `INTERPRETATION`, or `ARTISTIC_BRIDGE` |
| `speaker` | Set only for `CHARACTER_SPEECH`. The line then carries an attribution marker in **every** language. |
| `original_speaker` | For a paraphrase: who actually said it |
| `evidence` | The claim or passage the line rests on |
| `shot` | The shot it plays over. Each language may time it differently; the meaning and speaker may not differ. |

---

## 6 · Binding rules and creative proposals

**Binding — the studio may not override these**

- **Gates.** Tāṭakā, Rāvaṇa and Mārīca may not be depicted. Ten further entities are memo-gated and may not be designed. None appears in Arc 7's frames.
- **Rāma** may be depicted under the approved design. No complexion may be presented as mandated by the source — in narration, captions, share copy or Ask.
- **Rights.** Restricted Sanskrit text — two or more consecutive words from the GRETIL digitisation, any line from Tulsīdās or another permission-dependent file — never enters a prompt, a caption, an export or a share card. Single words are vocabulary and may appear.
- **Attribution.** A character's statement is never rendered as narrator fact. Every attributed line keeps its marker in every language, including any caption the studio re-times.
- **Evidence.** Nothing is shown or said that rests on an unaccepted claim. If a new beat needs a fact, it needs an accepted claim first.
- **Faces withheld.** Rāma appears in M6 only as a bowed head. **M7/04 is his FIRST FACE REVEAL** — the first time his face is shown anywhere in the product. Kausalyā is only ever her hands.

**Binding within the arc — continuity**

- The king's last moment on the throne is M2/02. He rises at M3/05 and never returns to it.
- The sage is seated through M1–M4, rises at M5/03, and stands from then on.
- One axis per location: in the hall, the king frame-left looking right, the sage frame-right looking left. One permitted crossing, M5/14. One axis change, at the threshold, M7/09.
- The continuous joins open on the identical frame, and the room tone does not reseat.

**Creative proposals — the studio may change these**

Lens choices, shot lengths, hold lengths (8 s and 4 s), the share-cut landing (5 s), the grade values, grain, the music brief, narrator casting and the "one narrator per language" idea, rhythm, M7's afternoon light, and every performance note in the directing packs. They are the director's recommendations, not rules. Where the packs make a deliberate departure from the text — the sage's restraint at the promise, his cold anger in M5 — they say so and give the alternative.

---

## 7 · Production plan

**Render in film order, M1 → M7.** Frames are shared across films:

| Plate | First made | Reused or cropped in |
|---|---|---|
| **The still sage** | M2/03 | M2/04, 13 · M3/02, 04, 09, 15, 23 · M4/01, 04, 05, 06, 18 · M5/01, 02 — **14 shots, four films** |
| The sage's open hand | M2/09 | M2/10 · M3/03 |
| The king's shock | M2/18 | M3/01 |
| The silent king | M3/20 | M3/21 · M4/17 |
| The spent king | M5/16 | M6/01, 05 |
| The empty doorway | M6/22 | M7/01 |

Six plates cross films. Within films, the heaviest are the standing sage in M5 (M5/08 → 09, 10, 12, 13) and Vasiṣṭha in M6 (M6/02 → 04, 06, 08, 11). **Get the still sage right first** — it carries more of the arc than any other frame.

**89 frames to generate. 45 reuses and crops.** Every reuse and crop has been checked to be physically possible — the same person in the same state, or a tighter cut from an equal-or-wider frame.

**Per shot, in order:** generate the still from the approved references → check it against the acceptance criteria in `render_policy.json` → add motion only where `motion_allowed` → approve by a named person.

**The eye test for every frame:** is the cloth draped or sewn? Is there a dome, an arch or marble? Is anyone's skin lighter than their approved sheet? Does the ornament look like a temple relief or a jewellery shop?

---

## 8 · What the studio must supply

- **Approved references** for Daśaratha, Viśvāmitra, Vasiṣṭha, Rāma and Lakṣmaṇa, and for Kausalyā's hands. **Make them from the character briefs** — generated or commissioned, approved by a named person. Four design decisions come first; they're at the end of the briefs. Start with Viśvāmitra: the still sage carries fourteen shots.
- **One continuous room-tone take for the hall.** It runs unbroken through every interior from M2 to M7, across five joins.
- **Recordings, not library:** water poured over feet (M1/06) · **wood on sandstone** (M5/06), the most important sound in the arc · uncut cloth moving · bare feet on stone and on packed earth · the entry conch with a bell on its attack.
- **Narrators** for English, Hindi and Telugu. Audition line: *He said no.* / *उन्होंने ना कह दिया।* / *ఆయన కాదన్నాడు.* Reject anyone who performs it.
- **Font files** for Latin, Devanāgarī and Telugu. The typography proposal names SIL-licensed candidates and conjunct probes.
- **A generation environment with network access** to the image, motion and voice providers.

---

## 9 · Open decisions

Three, all creative, none blocking:

1. **The sage at the promise** (M1/14, M2/03). The text has him thrilled, his hair on end. The films play him restrained.
2. **The sage's anger** (M5). The text has him seized by wrath. The film plays it as control.
3. **M5, beat 05.** 1.0 s in the treatment; its sound direction calls for two seconds of silence. Recommended: 2.0 s.

Each directing pack gives the exact change if a decision is reversed.

**Product naming** — *PBL Ramayana* and *Kathaa worth following* — is a candidate, held in `branding.json`, and yours to change.

---

## 10 · Not in this handoff

- **M8, M9 and M10** are on the ledger with proposed claims and no treatment. They are not forensically audited. Don't render them.
- **Eleven proposed claims**, including two (CLM-0017, CLM-0018) that Dutt confirms but no film uses.
- **Every arc after Arc 7**, and the rest of the Rāmāyaṇa. The episode map covers all seven kāṇḍas as named beats, but only Bāla 18–21 has been checked against a text.
- **Sarga 17**, where the reception in M1 is narrated. The picture shows the reception as declared staging; the narration doesn't assert it.

**Forensic scope, exactly:** Bāla 18.1–20, 19.1–24, 20.1–9 and 21.1–6, films M2–M7. M1 against Dutt XVIII.

---

## 11 · Review and its limits

- **Claims** are AI-assisted passage checks, accepted editorially — for M2–M7 against the GRETIL Sanskrit with Dutt's 1891 English as comparison, for M1's promise against Dutt XVIII. They are **not** scholarly review.
- **Hindi and Telugu** are AI language review. **A native speaker of each should read every line** before release.
- **Rights** are a recorded basis, not legal advice. **Legal review is recommended** before commercial display — on Dutt's public-domain status outside India and the USA, and on the single-word boundary for Sanskrit.
- **Nothing here proves the films are good.** That needs a frame, a voice, and a stranger watching on a phone.

---

## 12 · Change control

- **v1.0.6 is frozen.** Never edit it.
- **Reopen it only for:** new source evidence · an actual production failure that exposes a real defect · an explicit editorial decision.
- **To report a defect:** the shot or line, what the package says, what's wrong, and the evidence. A real defect becomes 1.0.7 with a migration note. A preference becomes a change in the directing packs, not the package.
- **The directing packs** are living direction. Revise them freely — within source truth. Six stale creative notes in 1.0.6 that the packs already supersede are listed at the end of the packs — one of them changes an image prompt (M7/06); see the precedence rule in §3.
- **A production checkpoint is not a reason to reopen the source.** M1's checkpoint is visual only.

---

## 13 · Prompt for Claude Code

```
Read HANDOFF.md first, then pbl-ramayana-arc7-directing-packs.md.

The source package is pbl-source-state-v1.0.6-studio-handoff.zip.
It is frozen. Never edit its contents.

1. Dry-run the importer:
     node tools/import_graph.js <path-to-unzipped-v1.0.6>
   Report every refusal. Install nothing yet.

2. Three frictions are expected — CLM-0001's Dutt section locator,
   the single skin_policy lock, and new fields (claims_proposed,
   context_claims, continues_from, basis; narration assertion,
   evidence, original_speaker). If the importer refuses them,
   change the importer. Keep the fields.

3. Report anything else with the exact field and reason before
   changing anything.

4. Once installed, run validate, regress, and the package's own
   contradictions.py. All three must pass.

5. Render in film order, M1 to M7. Frames are shared across films —
   see HANDOFF.md §7. Use only the studio's approved references for
   every face, costume and ornament. Shot 05-06 must refuse motion.

6. M1 is a VISUAL PRODUCTION CHECKPOINT — nothing more.
   Render M1, then stop for a person to check:
     - identity against the approved character references
     - the world and the look
     - costume continuity across shots
     - generation quality
     - motion quality
   If those pass, continue with M2 through M7.
   Do NOT reopen the source or canon audit because production has
   reached a checkpoint. Reopen it only for new source evidence, a
   real defect a render exposes, or an explicit editorial decision.

7. Precedence: v1.0.6 wins on source truth — claims, locators,
   evidence, attribution, rights, gates, tradition, and sourced-vs-
   artistic classification. The directing packs win on performance,
   framing, sound, rhythm and other creative notes. The packs never
   override source truth.
```

---

*The source workspace supplies what is true. The studio supplies the experience. They stay separate, and connected by this handoff.*

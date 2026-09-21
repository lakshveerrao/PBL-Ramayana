# direction/

Living creative direction. The frozen source package in `data/` wins on **source
truth** — claims, locators, evidence, attribution, rights, gates, and the
sourced-versus-artistic classification of every shot and line. The directing packs win
on **creative direction** — performance, framing intent, sound, rhythm.

A pack may never override source truth. If one appears to — showing something
unsourced, dropping an attribution, moving a gate — the pack is wrong.

| file | what it is |
|---|---|
| `pbl-ramayana-arc7-directing-packs.md` | Creative direction for M1–M7 |
| `pbl-ramayana-arc7-character-briefs.md` | What each model sheet must be |
| `KIT-HANDOFF.md` | The kit's own handoff note |
| `overrides.json` | Corrections the packs make to the frozen package, applied in code |
| `design-decisions.json` | The four decisions settled before any sheet is generated |
| `sheet-briefs.json` | Per-character sheet specs, the briefs with the decisions applied |

## overrides.json

The package is frozen and must never be edited. Where a pack corrects a stale note in
it, the correction lives here and is applied by `lib/prompt.js` at assembly time — so
the package stays byte-identical and the correction is impossible to forget.

Every override must declare `class: "creative"`, `changes_truth: false`, and a reason.
One that declares `changes_truth: true` throws rather than applying.

Currently one: **M7/06**, whose shipped prompt read *"the edge of a sleeve"* while its
own negative list said *"no stitched garment"*. A model given both draws the sleeve.

`tools/validate.js` catches that class independently of the override — it fails any
prompt that asserts a word its own negatives forbid, and any prompt describing cloth
as stitched. Both are negation-aware, so *"No arch of later vocabulary"* passes and
*"the edge of a sleeve"* does not.


## design-decisions.json

The four decisions the briefs require before a single sheet is generated — every frame
made from a sheet inherits a later revision.

| | decided |
|---|---|
| **DD-1** Daśaratha's headdress | Relief-period royal turban with a crest ornament (Bharhut/Sanchi). Falls back to a low mukuṭa if candidates read as a later regional turban. |
| **DD-2** Rāma's complexion | Deep brown, from the *śyāma* tradition. **Ours, never the text's** — no caption, narration or share copy may state his colour. |
| **DD-3** Lakṣmaṇa | **Build and hair only. Same complexion range as Rāma.** The *śyāma/gaura* pairing is rejected. |
| **DD-4** Route | Generate, anchor-first. Commission as fallback if identity will not hold. |

**DD-3 reverses a recommendation in the brief**, which is why it is written down. The
pairing would sit Lakṣmaṇa lighter than his brother; build and hair give the same
legibility — including from behind, where seven of his shots need it — with none of
the risk. Two invariants enforce it, and both were proven by deliberately violating
the brief and watching validate refuse.

A complexion chosen from tradition is evidence class **S** — ours. A tradition informs
a staging choice; it is never promoted to Text.

## Making the sheets

```bash
node tools/make_sheets.js                      # the plan and the cost, nothing sent
node tools/make_sheets.js VISHVAMITRA --print  # the exact prompts
node tools/make_sheets.js VISHVAMITRA --run    # generate the anchor candidates
```

Anchor-first, per the briefs: ten front candidates, choose one, then the other three
views **conditioned on that anchor and never on each other** — a variation of a
variation is a cousin. 104 images across six characters, $2.60.

Viśvāmitra first: the still sage carries fourteen shots across four films.

The runner never approves anything. A named human approves through
`POST /api/sheets/:id/approve`, and only then does the consistency gate open.

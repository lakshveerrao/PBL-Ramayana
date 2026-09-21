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

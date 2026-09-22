# PBL Ramayana — Arc 7 · Production Orders

**For:** Claude Code, working in the studio repo.
**From:** the creative director, on the user's decisions.
**Status:** these orders are the operative production sequence for Arc 7. `HANDOFF.md` remains the reference for the package, its fields and its rules.

Work through the phases in order. **Every phase ends at a gate where you stop and report.** Do not start a phase until the user has said go on the one before it.

---

## 0 · Standing rules — they apply to everything below

1. **v1.0.6 is frozen.** Never edit it. Source truth — claims, locators, evidence, attribution, rights, gates, tradition, sourced-versus-artistic classification — comes from it and always wins.
2. **The directing packs and character briefs win on creative matters** — performance, framing, sound, rhythm, appearance. They never override source truth.
3. **Record what was actually sent, not what was assembled.** Every render record lists the exact prompt sent, the reference images actually sent, the endpoint, and the output. If something wasn't sent, the record says so.
4. **Estimate before you spend.** Every phase starts with a cost estimate at current pricing. Nothing is spent until the user says go.
5. **Show every result, including failures.** Never present only the best. Judge each against the briefs and say plainly what failed.
6. **Never name a TV serial, film or actor in any prompt.** Describe the traditional iconography in words. PBL's characters are its own.
7. **Skin is never lighter than the approved sheet** — in any generation, edit or grade.
8. **All cloth is draped. Nothing is stitched** — no sleeves, shirts, blouses or buttons, anywhere.
9. **Faces withheld stay withheld:** Rāma's face first appears at **M7/04** (his FIRST FACE REVEAL); in M6 he is a bowed head only. Kausalyā is only ever her hands.
10. **05-06 never moves.** Reuses and crops are held stills.
11. **Keys live in `.env` only.** Never print them, commit them, or ask for them in chat.

---

## 1 · Setup

**The user will:**
- put `OPENAI_API_KEY` in `.env` alongside `FAL_KEY` and `ELEVENLABS_API_KEY`;
- allow these domains in the environment's network settings: `api.openai.com`, `fal.run`, `queue.fal.run`, `api.elevenlabs.io`;
- start a new session;
- rotate the fal, ElevenLabs and Anthropic keys that were pasted into earlier chats.

**You:**
- run preflight. Every provider must show **reachable and key accepted** — a blocked host is never reported as ok;
- confirm `.env` is git-ignored and not staged.

**Gate 1 — report:** preflight results for all four providers.

---

## 2 · The provider plan

| Job | Provider | Rule |
|---|---|---|
| **Stills** | **OpenAI images** — the model family that made the Codex portraits | Reference-conditioned for every shot containing a person. One endpoint for all stills, so the look never shifts between cuts. |
| **Motion** | **fal, image-to-video** | Always starts from the approved still. Never text-to-video. |
| **Narration** | **ElevenLabs voices** | One narrator per language. |
| **Sound effects and ambience** | **ElevenLabs sound effects** | Room tone, foley, the conch. |
| **Music** | **Generated** — ElevenLabs music, or another generative provider if better | **Decided by the user: generated.** This resolves the open music decision. |
| **Grade, captions, transitions, assembly** | **The studio** | Already built. |

**Before building any provider, verify its current API. Don't assume.** In particular:

**OpenAI images**
- Confirm which model Codex used, and the current generation and edit endpoints, including how many reference images an edit accepts.
- **There is no negative-prompt field.** Fold the `render_policy.json` negatives into the prompt body as positive and negative instructions. Your payload invariant still holds: what's assembled is what's sent.
- **There is no seed.** Keep every output as the record of reference. `conditioned_on` lists the reference images actually sent.
- **Two-person shots** (11 of the 89 generated shots) send one reference per person in frame, from the same endpoint.
- **Its content rules are stricter than fal's.** Arc 7 should be fine. Record any refusal exactly — later arcs contain violence that may be refused.

**Music**
- Record the decision in `direction/`. **Change the studio contract** so it no longer refuses a music provider.

**Gate 2 — report:** each API as verified, anything that differs from this plan, and a cost estimate for the whole of Arc 7 by phase.

---

## 3 · Phase A — The characters

The Codex portraits in `Ramayana_Character_Portraits.zip` match the register the user wants — the recognisable mythological look. Install them as **references, not approved sheets**. Nothing is approved until the user approves it by name.

**Keep as they are:** Daśaratha (the image **without** the bow — he carries no bow in Arc 7), and Vasiṣṭha.

**Revise, conditioned on the Codex image for that character.** Same face, same costume — change only what's listed:

1. **Viśvāmitra** (ref: `01_Visvamitra_Head_Shoulders`) — seated cross-legged on a black antelope skin, spine straight. Composed and commanding: eyes at rest, brow relaxed. **Not scowling.** This is the still sage used in 14 shots. *Keep the scowling original as the reference for his anger in M5.*
2. **Rāma** (ref: `04_Rama_Head_Shoulders`) — add the boy's side-locks (*kākapakṣa*): two distinct locks hanging in front of the ears beside each cheek, the rest of the hair tied up. Plus one image **from behind**, walking: side-locks, bow on the shoulder, quiver.
3. **Lakṣmaṇa** (ref: `05_Laksmana_Head_Shoulders`) — calm and determined, **not scowling**. Side-locks tied lower and fuller than Rāma's. Plus one image **from behind**, walking. The two boys must be distinguishable from behind.
4. **Kausalyā** (ref: both hands images) — short, natural, unpolished nails. In the releasing image, the cloth she lets go of is **yellow silk — her son's**, not her own red.

**This is also the first conditioning test.** Say honestly whether identity held.

**Gate 3a — report:** every revision, identity verdicts, cost.

**Then build each sheet** from its anchor, conditioned on the anchor only — never on another generated view:
- three-quarter, profile, and an in-world frame (the hall: lattice light from frame-left, one brass lamp);
- the expression row each character needs — listed in `pbl-ramayana-arc7-character-briefs.md`;
- hands detail for everyone.

**Check against the briefs' acceptance test:** one person across all views; age reads at thumbnail size; Viśvāmitra and Vasiṣṭha distinct at a glance; Rāma and Lakṣmaṇa distinct from behind; cloth draped; skin not lightened.

**Gate 3b — the user approves each character by name.** Record in `sheets.json`: approver's name, date, the exact files approved. Only then does the consistency gate open for that character. **Also ask the user to confirm Rāma's complexion** against the decision of deep brown — the approved sheet becomes the standard.

---

## 4 · Phase B — The stills

**Render M1 first** — all its generated shots, conditioned on the approved sheets.
- Use the package's `image_prompt` for each shot, adapted for OpenAI (negatives folded in).
- Apply `direction/overrides.json` — including M7/06's *"the edge of her son's draped upper cloth"*, not *"sleeve"*.
- Honour every `IN FRAME` visibility note and every withheld face.

**Gate 4a — the M1 VISUAL CHECKPOINT.** Stop for the user to check:
1. identity against the approved references;
2. the world and the look;
3. costume continuity across shots;
4. generation quality;
5. whether any frame reads as another production or a generic poster.

This is a visual checkpoint only. **Do not reopen the source audit because production has reached it.**

**If it passes, render M2–M7 in film order.** Shared plates chain across films (`HANDOFF.md` §7) — the still sage from M2/03 carries 14 shots, so get it right before anything that reuses it.

**Gate 4b — report:** every still for M2–M7, flagged frames, cost.

---

## 5 · Phase C — Motion

**Choose the motion provider by test.** Take three approved M1 stills — one close-up, one wide, one with an action — and run them on two or three fal image-to-video models. The winner is the one whose **face holds through the motion** and whose cloth moves like cloth.

**Rewrite every motion instruction from the directing packs.** The package gives all 89 the same generic ambient line, including shots where the action *is* the point — as written, 01-04 "the king rises" would not rise.
- **Held moments:** subtle life only — breath, a lamp flame, cloth, dust.
- **Action beats:** the actual action — the rises (01-04, 03-05, 05-03), walking away (05-14), stepping forward (06-02), turning back (06-17), the crossings and the walking in M7, and any others the packs describe.

**Gate 5a — report:** the provider test, and **the full list of shots you've classified as action**, for the user to check before any motion is spent.

Then run motion for M1 → **Gate 5b:** the user checks M1 in motion → M2–M7.

**Always:** image-to-video from the approved still · 05-06 never moves · reuses and crops stay held.

---

## 6 · Phase D — Sound

**Narration**
- **Test Telugu first.** Generate the audition line in each language — *"He said no."* / *"उन्होंने ना कह दिया।"* / *"ఆయన కాదన్నాడు."* If ElevenLabs' Telugu isn't good enough, report it; Telugu may need another source.
- Offer the user three voices per language. Level, unhurried storytellers — reject any that perform the line.
- The quoted lines in M5 are **lowered**, not raised. No second voice for any character.

**Sound effects**
- **Room tone: one seamless loop of the hall**, used unchanged across every interior from M1 to M7. Five continuous joins depend on it never changing.
- **The staff strike (M5/06):** several candidates — wood on sandstone, dry, close, a one-second tail. The user chooses by ear.
- Foley: water poured over feet (M1/06), draped cloth moving, bare feet on stone and on packed earth (M7), the exterior at the M7 threshold.
- The entry signature: one conch phrase with a bell on its attack — before M1 only.

**Music** — follow `music.json` and the packs:
- a rudra-veena drone, sarangi and bansuri;
- the theme: four descending notes, resolving **once in the product**, under M6/13–14;
- **M1 and M5 have no music at all.** Nothing under the name *Rāvaṇa* in M4, nothing under the refusal in M3.

**Gate 6 — the user chooses** the three narrators and the staff strike, and hears the music cues. **Native Hindi and Telugu speakers** should hear the narration before release.

---

## 7 · Phase E — Assembly

- Grade to `grade.json`. **`gradecheck` can now measure skin** against the approved sheets — it must never pass a face lighter than its sheet.
- Captions per `typography.json`. When a narration unit splits across cards, every card stays inside its unit's shot, and **no card without its attribution marker stands alone across a cut.** Telugu places the marker last — check those splits.
- Transitions and joins per `transitions.json`. Every continuous join opens on the identical frame, and the room tone never reseats.
- Run `validate`, `regress`, the package's `contradictions.py`, `typecheck`, `joincheck` and `gradecheck`. All must pass.
- Assemble M1–M7. Each must match its length in `HANDOFF.md` §2, to the frame.

**Gate 7 — the user watches all seven films.**

---

## 8 · The decisions already made — don't reopen them

| Decision | Settled as |
|---|---|
| Visual register | The recognisable Indian mythological look — traditional iconography, never a copy of a production |
| Daśaratha | Golden mukuṭa, as in the approved Codex portrait |
| Rāma | Deep brown; FIRST FACE REVEAL at M7/04 |
| Lakṣmaṇa | Same skin range as Rāma; told apart by build and hair only |
| Viśvāmitra | Saffron, the jaṭā bun, rudrākṣa, kamaṇḍalu — composed as the still sage, fierce only in M5 |
| Stills | OpenAI images, reference-conditioned, one endpoint |
| Motion | fal image-to-video only |
| Voice, sound effects | ElevenLabs |
| Music | Generated |

**Still open, for the director:** whether the sage is played thrilled at the promise (the text) or restrained (as directed) in M1/M2, and whether his anger in M5 is cold (as directed) or hot (the text). Ask before rendering those shots only if the user hasn't said.

---

## 9 · How to report at every gate

- **What was done** — briefly.
- **What was spent** — against the estimate.
- **Every result**, with the failures named.
- **What needs the user's decision** — one list, nothing else.

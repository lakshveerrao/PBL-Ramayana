# What two rounds of ten actually established

Counted, not felt. Both rounds: Viśvāmitra anchors, `fal-ai/flux-pro/v1.1`, ten each,
$0.80 total. These are properties of prompt assembly, so they survive a change of brief
and should survive a change of endpoint — though the second has to be re-measured on
OpenAI images, where there is no negative prompt at all.

## 1 · Naming a thing in order to forbid it summons it

| | round 1 | round 2 |
|---|---|---|
| forehead marking | **10 of 10** | **4 of 10** |

Round 1 carried a whole sentence forbidding it by name — *"no red tilak, no forehead
stripes, no tripuṇḍra, no coloured paste"* — plus every term in the negative prompt.
Round 2 deleted the sentence and described the forehead positively as bare and clean.
Nothing else about markings changed.

The same failure, unfixed, in round 2: **saffron or orange cloth on 5 of 10** and a
**turban on 2 of 10**, both forbidden by name in the prompt body *and* in the negative.

**The rule: describe what IS there.** A prohibition puts the word in the prompt, and a
word in the prompt is a thing the model has been asked to think about.

## 2 · A prompt that contradicts itself gets split down the middle

Found twice, both caught by `validate` rather than by eye:

- The universal world line prescribed *"heavy kundala earrings, flat collars and
  torques, armlets, bangles"* while a renunciate's own brief said *"no other ornament at
  all."* Made conditional.
- The framing asked for *one warm light* while the front-view slot still said *even
  light*. Reconciled.
- The global portrait framing carried the word *portrait* into Kausalyā's plate, whose
  own never-list forbids one — she is hands only. Framing now skips a withheld face.

Every one of these is two instructions about the same thing in one prompt. The assembler
now refuses a declared replacement whose target has drifted out of the brief, so the
next one fails loudly instead of quietly not applying.

## 3 · The endpoint decides the register before the prompt does

`flux/dev` produced concept art on a prompt that produced a photograph on
`flux-pro/v1.1`. No prompt wording closed that gap. The corollary held in reverse:
asking for a *photographic reference plate* bought documentary along with photography —
ten portraits of poor modern ascetics — and only a change of framing to a *formal
portrait* fixed it.

## 4 · What the provider silently drops, nothing downstream can see

The negative prompt was assembled, validated, regression-tested and never sent, because
every check looked at the assembly and none at the payload. fal accepts unknown fields
and ignores them, so a wrong field name reads as success. OpenAI images has **no
negative-prompt field at all**, which is why `lib/openai.js` throws on one rather than
accepting it — the negatives belong in the prompt body now.

## 5 · Look at the bytes

One of round 1's ten came back a black frame — billed, and filed as a candidate beside
the other nine, because nothing looked. `tools/platecheck.js` now measures blankness and
face-band lightness on every set before anyone judges it.

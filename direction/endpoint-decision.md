# Which image endpoint, and why it was not a question about quality

Recorded 2026-09-21. Class `S` — our staging decision, not the text's and not the
package's. The package constrains the *method*; the endpoint is ours to pick.

## The question asked

"Is flux-pro good, or something else?"

## What the probes measured

Three paid probes, one variable each, seed `1037879020`, $0.08 approved:

| | endpoint | result |
|---|---|---|
| A | `fal-ai/flux/dev`, original prompt | concept art |
| B | `fal-ai/flux/dev`, photographic-plate prompt | closer, still painterly; subject smiling |
| C | `fal-ai/flux-pro/v1.1`, same prompt as B | plainly photographic, correct jaṭā — **but a modern sadhu**: saffron head wrap, red tilak, layered mālās, every one of them in the negative |

The model was the deciding variable. The prompt change alone did not cross from
illustration to photograph; the model change did.

## Why that did not settle it

`data/render_policy.json` says:

```json
"identity": {
  "method": "reference-conditioned; never text-only",
  "reference": "the approved model sheet for every principal in frame",
  "rule": "Every generation references the AUTHORED SHEET, never a previous frame."
}
```

`flux-pro/v1.1` is text-to-image. It has no field for a reference. It is not that it
conditions badly — there is nowhere to put the sheet. So the criterion is not which
model makes the best single photograph. It is which endpoint can hold one person across
four sheet views and then 134 shots, and there is no amount of prompt work that gives a
text-to-image endpoint that capability.

Probed the live API on 2026-09-21 by POSTing an empty body — a real endpoint answers 422
and names its required fields, a nonexistent one 404. Nothing generated, nothing billed.
22 endpoints exist; 12 take a reference. The registry is `lib/endpoints.js`.

Two shapes, and they are not interchangeable: `image_url` (one reference — the kontext
family, flux image-to-image) and `image_urls` (several — nano-banana/edit, seedream v4
edit, qwen-image-edit-plus). fal accepts unknown fields and ignores them, so sending
`image_url` to an endpoint that reads `image_urls` returns 200 and a text-only picture.
`buildReferencePayload()` refuses instead of guessing.

## What this found in the studio

`renderStill` was text-only, and wrote the sheet files into the render record under
`references` regardless. The record asserted a conditioning that had not happened — the
same defect as the negative prompt that was assembled for weeks and never sent, but
worse, because the record was the evidence.

Fixed: `conditioned_on` now records what was actually sent, `text_only` says when
nothing was, and `referencePlan()` refuses a person-bearing shot on a text-only endpoint
rather than generating one and recording it as conditioned.

## The decision

Two endpoints, because they are two different jobs.

**Anchors — 6 images, one per principal.** `fal-ai/flux-pro/v1.1` at $0.04. An anchor has
nothing to be conditioned on; it is the first authored image of a face. This is the job
the probes measured and flux-pro won it.

**Everything after — 18 further sheet views and 134 shots.** A reference-conditioned
endpoint. Candidates, in the order they should be tried:

1. `fal-ai/flux-pro/kontext/max` — one reference, strongest identity in the flux family,
   same family as the anchor so the photographic register should carry.
2. `fal-ai/nano-banana/edit` — several references at once. Two principals in one frame
   (Daśaratha and Viśvāmitra share most of arc 7) need this shape; kontext cannot.
3. `fal-ai/bytedance/seedream/v4/edit` — same multi-reference shape, different family.

Not chosen, and why: `redux` has no prompt field, so a shot cannot be directed;
`ip-adapter-face-id` keeps the face and discards the cloth, which is most of what the
material-world lock governs; `flux/dev/image-to-image` holds composition rather than
identity.

## What is still unverified, and must not be asserted

- **Whether these endpoints honour `negative_prompt`.** fal ignores unknown fields
  silently, so the 422 probe cannot tell an honoured field from a discarded one, and
  `fal.ai` is outside this environment's egress allowlist so the published schemas
  cannot be read from here. If kontext discards the negative, the 51-term material-world
  list stops guarding anything on the reference route and the guard has to move into the
  prompt body. **This has to be measured before the shot run, not assumed.**
- **Prices marked `estimated: true` in `lib/endpoints.js`** are pessimistic placeholders
  for the same reason. `endpointCost()` reports `known: false` rather than presenting a
  guess as a price.

## Cost of deciding the second endpoint

Four reference-conditioned generations from one approved anchor — one per candidate,
plus one repeat of the winner at a different angle to see whether identity survives a
turn. Roughly $0.20 at the estimated prices. Nothing runs until it is approved.

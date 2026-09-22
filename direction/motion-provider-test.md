# Motion provider test — M1

Gate 5a, step 1. Three stills, four endpoints, twelve clips, **$2.85** — the estimate to
the cent. Run 2026-09-22. `renders/motiontest.json` holds the machine record;
`assets/motiontest/` holds the clips.

The three stills ask different questions, because the arc contains all three:
**01-04** a body rising · **01-13** a held face · **01-02** a walk at distance.

The two questions that decide it, from the director: **does the face survive the motion,
and does cloth move like cloth.**

## Measured

Drift is the mean absolute luma difference from the still the clip started on, coarse
(54×96) on purpose — this measures drift, not detail. **High drift is not automatically
bad**: on 01-04 the king is *supposed* to move. On 01-13 he is not.

| clip | 01-13 held face (whole / upper third) | 01-04 the rise (upper third) | 01-02 the walk | out |
|---|---|---|---|---|
| **kling v2.5-turbo/pro** | **6.3 / 5.1** | 26.7 | 17.3 | **1080×1920** · 24 fps |
| kling v1.6 standard | 11.3 / 12.5 | 20.4 | 28.9 | 720×1280 · **30 fps** |
| minimax hailuo-02 | 10.5 / 7.4 | 13.6 | 4.4 | 768×1364 · 24 fps |
| wan v2.2-a14b | 25.1 / 23.6 | **61.9** | 19.2 | 720×1280 · 32 fps |

## Watched

**kling v2.5-turbo/pro — the winner.** On 01-04 he *rises*: taller in frame, head lifted,
the red uttarīya and the white drape moving and settling as he stands. Crown, ornament and
face hold through it. On 01-13 it is the same man in both frames with the smallest settle.
On 01-02 he walks with a real stride, staff planted, the seated ministers holding still
around him.

**kling v1.6 — holds identity, will not perform.** On 01-04 he leans rather than rises;
the beat does not happen. Face and costume hold well, and it is the only candidate that
returns 30 fps. Second, and the fallback if v2.5's cost or 24 fps becomes the problem.

**minimax hailuo-02 — drifts costume, and moves the camera.** On 01-04 the crown changes
shape and the uttarīya becomes a broad brocade band across the chest: a different garment.
On 01-13 it has pushed in — a tighter crop than the still. Every M1 shot is marked
`locked`; a provider that adds a push on its own is working against the film. On 01-02 it
barely moved at all (drift 4.4), so it under-performs as well.

**wan v2.2-a14b — fails identity.** On 01-04 the frame pushes to a torso close-up and the
face, crown and belt all become different objects; 61.9 upper-third drift is what that
looks like as a number. Cheapest, and not usable at any price on a film built on
reference-conditioned identity.

## Two things the test settled that were not the question

**01-02 walks AWAY from camera, and I had it backwards.** The approved still shows the
sage **from behind**, walking up the hall toward the dais — the camera stands at the
entrance he has just come through. So the director's provider-test line, *"the sage
walking away down the aisle"*, was right, and the reading in an earlier draft of
`m1-motion.md` — toward camera — was wrong. The pack's *"a door opening far off"* is the
camera's position, not the sage's heading. All four providers ignored the prompt and
followed the still, which is the conditioning working as it should.

**Frame rate is a real problem and it is not v2.5's alone.** The film is 30 fps. v2.5
returns 24, minimax 24, wan 32; only kling v1.6 returns 30. On a 1.8–2.2 s shot, naive
24→30 conversion duplicates every fourth frame and it shows. Before any of this reaches
a cut, the chosen endpoint has to be asked for 30 fps, or the clip retimed properly.

**And every clip is far too big a movement.** These were run at 5–6 s, the shortest any of
them will make, against shots of 1.8–2.2 s, and prompted for the beat rather than for the
graph's *"almost imperceptible life"*. Nothing here is a finished shot. The test answers
which provider can be trusted with a face and with cloth; the instruction that produces an
M1 shot is the next piece of work, and it is written for the endpoint that will read it.

## Not tested

Seven more endpoints exist and answered as authenticated (`lib/endpoints.js`). `veo3` was
left out deliberately: at an estimated $2.00 a clip it is an order of magnitude dearer
than the field, and the field produced a winner.

**Nothing here is approved.** A provider is chosen by a person watching the clips.

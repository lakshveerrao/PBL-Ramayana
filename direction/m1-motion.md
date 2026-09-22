# M1 — action list, checked against the treatment and the directing pack

Gate 5a. Built from the treatment's own `action`, `beat` and `motion_allowed` fields and
from the **M1 directing pack**, which wins on performance, framing intent, sound and
rhythm while the frozen package wins on source truth. Then set beside the director's list
of 2026-09-22.

## The finding that matters first

**The graph's `motion` field animates none of this.** All fourteen generate shots carry
the same sentence, near enough word for word:

> *almost imperceptible life: a lamp flame drifting, draped cloth settling. The camera
> does not move.*

01-04 is *the king rises* — the pack's own bolded **"The king moves"**, the first time we
see him move and the hinge of the film. Its motion instruction is the lamp-flame line. So
is 01-05's, where he steps off the dais. So is 01-02's, where the sage arrives. 01-06's
at least adds "water pouring".

Sent as they stand, every action beat in M1 would be missing and the film would be
fourteen drifting lamp flames. This is what `PRODUCTION_ORDERS` means by rewriting the 89
motion instructions: the beats are in the treatment and in the pack, and the motion field
was never written to carry them.

## Shot by shot

| shot | directing pack | treatment `action` | director's list | agree |
|---|---|---|---|---|
| 01-01 | the empty hall; lattice light across stone | wide, low, empty floor | subtle: light and dust | ✓ |
| 01-02 | **a door opening far off; the sage small in frame** | the sage entering at distance | ACTION: walks up the aisle | ✓ settled below |
| 01-03 | ministers' heads turning — **curiosity**; individuals, not extras | a stir that is not alarm | ACTION: heads turn toward the entrance | ✓ |
| 01-04 | **he rises — the first time we see him move** | Daśaratha stands | ACTION: the king rises | ✓ |
| 01-05 | he steps off the dais **to meet a guest** | a king does not do this | ACTION: descends, **arms opening** | ✓ see below |
| 01-06 | water poured over the sage's feet; *hands and feet only, no faces* | a vessel, hands, water poured | ACTION: water pours over the feet | ✓ nod cut |
| 01-07 | seated, facing; the empty throne behind; **the king asks** | *"Tell me what you want."* | ACTION: the king's asking gesture | ✓ |
| 01-08 | he does not answer yet | he does not answer yet | subtle | ✓ |
| 01-09 | the king, **generous, unthinking** | *"Whatever it is, I'll do it."* | ACTION: **his hand opens**, small | ours, accepted |
| 01-10 | Vasiṣṭha watching — **unreadable, NOT uneasy** | Vasiṣṭha among them, unreadable | subtle | ✓ + see below |
| 01-11 | **level, warm, unforced** | *"You have my word."* | ACTION: **hand lifts, palm open**, small | ours, accepted |
| 01-12 | the sage's hands open on his knees, **unchanged**. Hands only. | resting open, unchanged | subtle | ✓ |
| 01-13 | the king at ease, almost pleased | lighter for it | subtle | ✓ |
| 01-14 | the smallest intake of breath | the smallest intake of breath | subtle + **lips parting** | ✓ |
| 01-15 | R ← 13. Expectant, still warm | `motion_allowed: false` · **NO MOTION** | HELD STILL | ✓ |
| 01-16 | R ← 14. He has not spoken. Cut. **4 s, not 8** | `motion_allowed: false` · **NO MOTION** | HELD STILL (final hold) | ✓ |

Held still matches exactly: 01-15 and 01-16 are the only two shots the graph refuses
motion on, and the only two the director holds.

## What the pack settles

**01-02 walks AWAY from camera — and an earlier draft of this file had it backwards.**
The director's action list says *up the aisle*; the same message's provider-test brief
says *walking away down the aisle*. I read the pack's *"a door opening far off; the sage
small in frame"* as him arriving toward camera. The approved still settles it and the
brief was right: we see the sage **from behind**, walking up the hall toward the dais. The
camera stands at the entrance he has just come through, so *"a door opening far off"*
describes where the camera is, not where he is heading. All four motion providers ignored
my prompt and followed the still, which is the conditioning working as it should.

**01-07's asking gesture is not an addition.** The pack's action column says *the king
asks* outright. A gesture is a rendering of it.

**01-05's arms opening is very nearly not one either.** The pack says he steps off the
dais *to meet a guest*. Opening the arms is the physical statement that beat is about.
Declared as **S**, our staging, but well inside what the pack asks for.

**01-06: the nod is CUT.** Both the pack and the treatment put a nod there, and the
director cut it on 2026-09-22 for the reason the pack itself supplies two lines later:
*hands and feet only, no faces*. A nod cannot read without a face. The beat stays what it
is — a vessel, hands, water.

**01-09 and 01-11 stay, as small hand moves.** Accepted by the director on 2026-09-22.
They are the only true additions in the film — the pack gives both as expression only,
*generous, unthinking* and *level, warm, unforced*. They are **S**, ours, declared. Small
is the instruction: in a 32-second film whose register is stillness, these are the busiest
it gets, and 01-12 is deliberately the sage's hands **unchanged**. The contrast only reads
if the king's hands are the only ones moving.

## Two things the pack overrides in the graph

**01-10's expression.** The treatment's `expression` field reads *"the only flicker of
unease in the film"*. The pack strikes it: *"The treatment calls this 'the only flicker of
unease', which is foreshadowing, and M1 forbids foreshadowing. He is watching. That is
all."* This matters beyond performance now — the studio appends a shot's `expression` to
its image prompt, so the frozen field would put foreshadowing into the frame itself. An
override is recorded in `direction/overrides.json`.

**Two shot sizes.** The pack gives 01-05 and 01-07 as MS **50**mm where the treatment's
prompts say 85. The pack wins on framing intent; nothing has been re-rendered for it,
because M1's stills are approved and the difference is not visible in an approved frame.

## What the motion instructions must become

Not this file's to write until a provider is chosen — the instruction has to be written
for the endpoint that will read it. The shape is fixed now:

- the beat, from the pack's action column, in one plain sentence
- what does **not** move, stated: in every shot the camera (the pack marks all sixteen
  `locked`), and in most of them everything but one person
- the two the pack says must not drift: **the king's costume from 04 onward, and the
  sage's seated posture from 07**
- the ambient life the graph already names, last and smallest: lamp flame, cloth, dust

`motion_allowed: false` is never overridden. 01-15 and 01-16 stay frames.

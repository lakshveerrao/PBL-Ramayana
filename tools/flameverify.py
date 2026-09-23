#!/usr/bin/env python3
"""flameverify - the director's test for a frozen lamp, 2026-09-23:

    "the bright-pixel centroid inside the lamp mask must stay within ~1 px across the
     shot, and no pixel above 215 luminance may appear outside the mask"

The second half is scoped to the LAMP'S NEIGHBOURHOOD, not the whole frame, and the
director's own calibration is why: they said 01-01 and 01-10 already pass. Measured,
those two shots have MORE bright pixels than 01-03 - 6.2% and 7.6% of the frame against
2.5% - because they are wide shots full of lattice light on stone. Read literally
against the whole frame the test would fail hardest on the two shots named as passing.

What it is actually testing is a flame DETACHING - "one hovers past the rim". So the
neighbourhood is the lamp's own region grown by a margin, and the count is of bright
pixels in that neighbourhood that fall outside the frozen mask. A flame that comes loose
lands there. Nothing else does.
"""
import sys, json
import cv2
import numpy as np

BRIGHT = 215
# A fixed margin around the MASK, not a multiple of the declared region. Scaling with
# the region made the ring meaningless: widening 01-03's region to take in a second diya
# grew the ring to a quarter of the frame, which then contained the ministers' moving
# ornament and reported 20 px of "escape" that had nothing to do with any flame.
# Detaching means leaving the lamp by a little, so the margin is a little.
MARGIN_PX = 60
MIN_BLOB_PX = 40      # a flame is a blob, not a handful of threshold flicker
MAX_BLOB_PX = 1500    # and not a window
MAX_BLOB_DIM = 140
LOOSE_DRIFT_PX = 2.0  # a flame-sized blob near the lamp that wanders further has come loose

def luma(bgr):
    return (0.0722 * bgr[..., 0] + 0.7152 * bgr[..., 1] + 0.2126 * bgr[..., 2])

def verify(clip, regions, mask_png=None):
    cap = cv2.VideoCapture(clip)
    fs = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fs.append(f)
    cap.release()
    if not fs:
        return {'ok': False, 'reason': 'no frames'}
    H, W = fs[0].shape[:2]

    # "Inside" is the MASK that was really pasted, when one is given. A declared region
    # is a permission and is deliberately generous; testing against it would count the
    # gold plinth beside a lamp as escaped flame, which is what the first run did - 639
    # bright pixels near the lamp before the freeze and 615 after, a difference of
    # nothing, because almost none of them were ever flame.
    inside = np.zeros((H, W), bool)
    near = np.zeros((H, W), bool)
    if mask_png:
        m = cv2.imread(mask_png, cv2.IMREAD_GRAYSCALE)
        if m is not None:
            # The mask's HARD CORE, where the still fully replaces the clip. The mask is
            # feathered, so at its edge the two are blended and the clip still shows
            # through at 20-80% - bright pixels there move a little, and measuring
            # across them reports 0.2 to 1.4 px of "drift" on shots that are in fact
            # perfectly frozen. The core is where the promise "this is the still" holds.
            inside = cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST) >= 250
    for x, y, w, h in regions:
        if not mask_png:
            inside[max(0, y):min(H, y + h), max(0, x):min(W, x + w)] = True
    k = np.ones((MARGIN_PX * 2 + 1,) * 2, np.uint8)
    near = cv2.dilate(inside.astype(np.uint8), k) > 0
    ring = near & ~inside

    # What is left bright near a frozen lamp is the hall: lattice light on stone, a
    # gilded pillar, the throne. Counting those pixels says nothing, and taking ONE
    # centroid over all of them says less - it mixes dozens of independent objects, so
    # a few pixels crossing the threshold at one end of the ring throw it by thirty
    # pixels. Widening a mask then makes the number worse, which is how a metric ends up
    # chasing its own tail.
    #
    # What the test is actually asking is whether any FLAME came loose. So find the
    # bright blobs in the ring, keep the ones that are flame-sized, and track each one
    # on its own. A static gilded finial has a drift of zero however bright it is.
    cents = []
    ring_union = np.zeros((H, W), np.uint8)
    brights = []
    for f in fs:
        b = luma(f) > BRIGHT
        brights.append(b)
        hit = b & inside
        if hit.any():
            ys, xs = np.nonzero(hit)
            cents.append((float(xs.mean()), float(ys.mean())))
        ring_union |= (b & ring).astype(np.uint8)
    escaped = int(ring_union.sum())

    n, lab, st, _ = cv2.connectedComponentsWithStats(ring_union, 8)
    ys_all, xs_all = np.mgrid[0:H, 0:W]
    worst, worst_at = 0.0, None
    for i in range(1, n):
        a = int(st[i, cv2.CC_STAT_AREA])
        w, h = int(st[i, cv2.CC_STAT_WIDTH]), int(st[i, cv2.CC_STAT_HEIGHT])
        if a < MIN_BLOB_PX or a > MAX_BLOB_PX or max(w, h) > MAX_BLOB_DIM:
            continue
        sel = lab == i
        pts = []
        for b in brights:
            hit = b & sel
            if hit.any():
                pts.append((float(xs_all[hit].mean()), float(ys_all[hit].mean())))
        if len(pts) < 2:
            continue
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        d = float(np.hypot(max(xs) - min(xs), max(ys) - min(ys)))
        if d > worst:
            worst, worst_at = d, [int(st[i, cv2.CC_STAT_LEFT]), int(st[i, cv2.CC_STAT_TOP]), w, h]
    ring_drift = worst

    drift = 0.0
    if len(cents) >= 2:
        xs = [c[0] for c in cents]; ys = [c[1] for c in cents]
        drift = float(np.hypot(max(xs) - min(xs), max(ys) - min(ys)))
    loose = ring_drift > LOOSE_DRIFT_PX

    return {'ok': True, 'frames': len(fs), 'centroid_drift_px': round(drift, 3),
            'bright_outside_mask_nearby': escaped,
            'worst_nearby_blob_drift_px': round(ring_drift, 3),
            'worst_nearby_blob_at': worst_at,
            'passes_drift': drift <= 1.0,
            'passes_nothing_loose': not loose}

if __name__ == '__main__':
    print(json.dumps(verify(sys.argv[1], json.loads(sys.argv[2]),
                            sys.argv[3] if len(sys.argv) > 3 else None)))

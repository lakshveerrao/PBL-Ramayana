#!/usr/bin/env python3
"""warmcheck - the director's test, stated literally, over the whole frame.

    "no warm blob above 15 px moves more than 2 px anywhere
     except on a moving hand, arm or cloth"

The ring-around-the-mask test this replaces stopped meaning anything once masks got
large: the ring wraps the mask, so everything bright around a big mask joins into one
component and its centroid mixes a dozen independent objects. 01-05 reported a "30 px
mover" that was a 231x624 ring blob wrapped round the lamp.

So: no ring, no mask, no region. Find every warm blob in the finished clip, track each
one, and list the ones that move. On a properly frozen film the list should hold people
and cloth and nothing else - which is a judgement, so this reports and a person reads it.
"""
import sys, json
import cv2
import numpy as np

BRIGHT = 215
MIN_PX = 15           # the director's floor
MOVE_PX = 2.0         # and the director's tolerance
HUE_LO, HUE_HI = 5, 55

def warm_bright(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32) * 2
    v = hsv[..., 2]
    return ((v > BRIGHT) & (h >= HUE_LO) & (h <= HUE_HI)).astype(np.uint8)

def check(path):
    cap = cv2.VideoCapture(path)
    masks = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        masks.append(warm_bright(f))
    cap.release()
    if not masks:
        return {'ok': False, 'reason': 'no frames'}
    H, W = masks[0].shape
    union = np.zeros((H, W), np.uint8)
    for m in masks:
        union |= m
    n, lab, st, _ = cv2.connectedComponentsWithStats(union, 8)

    ys, xs = np.mgrid[0:H, 0:W]
    sx = np.zeros((len(masks), n)); sy = np.zeros((len(masks), n)); cnt = np.zeros((len(masks), n))
    for i, m in enumerate(masks):
        b = m.astype(bool)
        if not b.any():
            continue
        l = lab[b]
        cnt[i] = np.bincount(l, minlength=n)
        sx[i] = np.bincount(l, weights=xs[b], minlength=n)
        sy[i] = np.bincount(l, weights=ys[b], minlength=n)

    movers = []
    for i in range(1, n):
        if int(st[i, cv2.CC_STAT_AREA]) < MIN_PX:
            continue
        present = cnt[:, i] > 0
        if present.sum() < 2:
            continue
        cx = sx[present, i] / cnt[present, i]
        cy = sy[present, i] / cnt[present, i]
        d = float(np.hypot(cx.max() - cx.min(), cy.max() - cy.min()))
        if d <= MOVE_PX:
            continue
        movers.append({'drift_px': round(d, 2),
                       'x': int(st[i, cv2.CC_STAT_LEFT]), 'y': int(st[i, cv2.CC_STAT_TOP]),
                       'w': int(st[i, cv2.CC_STAT_WIDTH]), 'h': int(st[i, cv2.CC_STAT_HEIGHT]),
                       'area': int(st[i, cv2.CC_STAT_AREA])})
    movers.sort(key=lambda b: -b['drift_px'])
    return {'ok': True, 'frames': len(masks), 'blobs': int(n - 1), 'movers': movers}

if __name__ == '__main__':
    print(json.dumps({p: check(p) for p in sys.argv[1:]}))

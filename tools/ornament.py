#!/usr/bin/env python3
"""ornament - how much a rigid ornament deforms, frame by frame.

01-04's first clip floated the king's crown: it held its height while his head rose
under it, and its silhouette changed across the shot. A crown is a rigid object, and a
generative model that treats it as texture will reshape it. "Least movement" does not
catch that - a clip can be almost still and still breathe the crown.

So measure the crown. In the upper part of the frame, find the largest bright-gold blob
- which on these shots is the mukut, the brightest compact gold in the picture - and
report, per frame, its area and bounding box. The caller reads the wobble of those
numbers over a window: a rigid crown gives a flat line, a floating one does not.
"""
import sys, json
import cv2
import numpy as np

UPPER = 0.62          # of frame height; below this is necklace, belt, throne
V_MIN = 0.55          # gold catching light, not gold in shadow
HUE_LO, HUE_HI = 15, 55   # yellow-gold
S_MIN = 0.25

def gold_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32) * 2
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    return ((h >= HUE_LO) & (h <= HUE_HI) & (s >= S_MIN) & (v >= V_MIN)).astype(np.uint8)

def profile(path):
    cap = cv2.VideoCapture(path)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        H, W = f.shape[:2]
        m = gold_mask(f)
        m[int(H * UPPER):, :] = 0
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        if n <= 1:
            out.append(None)
            continue
        i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        out.append({'area': int(st[i, cv2.CC_STAT_AREA]),
                    'w': int(st[i, cv2.CC_STAT_WIDTH]), 'h': int(st[i, cv2.CC_STAT_HEIGHT]),
                    'x': int(st[i, cv2.CC_STAT_LEFT]), 'y': int(st[i, cv2.CC_STAT_TOP])})
    cap.release()

    # One number per frame: how far this frame's crown differs in SHAPE from the clip's
    # median crown. Position is deliberately left out - the crown is supposed to travel
    # with the head. Only its size and proportions are supposed to hold.
    seen = [o for o in out if o]
    if not seen:
        return [0.0] * len(out)
    med_a = float(np.median([o['area'] for o in seen]))
    med_w = float(np.median([o['w'] for o in seen]))
    med_h = float(np.median([o['h'] for o in seen]))
    prof = []
    for o in out:
        if not o:
            prof.append(2.0)   # the crown vanished entirely: the worst kind of deformation
            continue
        prof.append(abs(o['area'] - med_a) / max(1.0, med_a)
                    + abs(o['w'] - med_w) / max(1.0, med_w)
                    + abs(o['h'] - med_h) / max(1.0, med_h))
    return prof

if __name__ == '__main__':
    print(json.dumps([round(x, 5) for x in profile(sys.argv[1])]))

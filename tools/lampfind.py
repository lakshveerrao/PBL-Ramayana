#!/usr/bin/env python3
"""lampfind - propose every candidate flame in a still, and CROP each one for a person.

The director's rule, and it is right: a detector confuses gold ornament and lattice
light with flame, so a person decides. What a detector is good for is the tedious part -
finding every bright warm speck in a 1080x1920 frame without missing one at the edge of
the picture. So this proposes; it never decides.

Each proposal comes back as an enlarged crop with its own index and its position in
frame, tiled into a contact sheet. Accepting or rejecting is done by looking at that
sheet.

A flame in these frames is: a clipped or near-clipped core, warm, small, and with a
halo. The thresholds below are deliberately loose - a missed lamp is a flame that
drifts in the finished film, while a false proposal costs one glance.
"""
import sys, json, os
import cv2
import numpy as np

CORE_V = 235          # the core of a flame clips or nearly clips
MIN_AREA = 8
MAX_AREA = 2500
MAX_DIM = 150
HUE_LO, HUE_HI = 5, 55    # warm: orange through gold
PAD = 46              # context around each crop, in source pixels
SCALE = 3

def proposals(path):
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    H, W = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32) * 2
    v = hsv[..., 2]
    warm = (h >= HUE_LO) & (h <= HUE_HI)
    core = ((v >= CORE_V) & warm).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, cent = cv2.connectedComponentsWithStats(core, 8)
    out = []
    for i in range(1, n):
        a = int(st[i, cv2.CC_STAT_AREA])
        w, hh = int(st[i, cv2.CC_STAT_WIDTH]), int(st[i, cv2.CC_STAT_HEIGHT])
        if a < MIN_AREA or a > MAX_AREA or max(w, hh) > MAX_DIM:
            continue
        x, y = int(st[i, cv2.CC_STAT_LEFT]), int(st[i, cv2.CC_STAT_TOP])
        out.append({'i': len(out), 'x': x, 'y': y, 'w': w, 'h': hh, 'area': a,
                    'fx': round((x + w / 2) / W, 3), 'fy': round((y + hh / 2) / H, 3)})
    out.sort(key=lambda b: (b['fy'], b['fx']))
    for k, b in enumerate(out):
        b['i'] = k
    return bgr, out

def sheet(path, out_png, cols=6):
    bgr, props = proposals(path)
    H, W = bgr.shape[:2]
    cell = (PAD * 2) * SCALE
    rows = (len(props) + cols - 1) // cols
    canvas = np.zeros((max(1, rows) * (cell + 28), cols * cell, 3), np.uint8)
    for b in props:
        cx, cy = b['x'] + b['w'] // 2, b['y'] + b['h'] // 2
        x0, y0 = max(0, cx - PAD), max(0, cy - PAD)
        x1, y1 = min(W, x0 + PAD * 2), min(H, y0 + PAD * 2)
        crop = bgr[y0:y1, x0:x1]
        crop = cv2.resize(crop, (cell, cell), interpolation=cv2.INTER_NEAREST)
        r, c = b['i'] // cols, b['i'] % cols
        oy, ox = r * (cell + 28), c * cell
        canvas[oy:oy + cell, ox:ox + cell] = crop
        cv2.rectangle(canvas, (ox, oy), (ox + cell - 1, oy + cell - 1), (0, 200, 0), 1)
        cv2.putText(canvas, "%d (%.2f,%.2f)" % (b['i'], b['fx'], b['fy']),
                    (ox + 4, oy + cell + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)
    cv2.imwrite(out_png, canvas)
    return props

if __name__ == '__main__':
    still, out_png = sys.argv[1], sys.argv[2]
    print(json.dumps(sheet(still, out_png)))

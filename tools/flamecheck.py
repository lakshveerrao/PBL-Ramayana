#!/usr/bin/env python3
"""flamecheck - find bright things that MOVE when they should not.

The defect this exists for, found by the director in M1's motion on 2026-09-23: in
01-03 the diya at bottom-left has flames that slide along the rim and detach - one
hovers past the rim around 5.2 s. The lamp and the bowl are steady; only the fire
moves. Fainter signs of the same around the lamp at frame-left in 01-07 and 01-08.

A generative video model has no idea that a flame is attached to a wick. It treats it
as texture and lets it drift, and a held 2-second shot is exactly long enough to see it.

THE TEST, as the director set it:
  - the bright-pixel centroid inside a lamp mask stays within ~1 px across the shot
  - no pixel above 215 luminance appears outside the mask

So this finds the bright blobs, tracks each one's centroid frame to frame, and reports
the drift. It judges nothing about whether a blob is a flame - a face in a shaft of
lattice light is bright too - but a blob that is small, far from the subject and moving
is what a flame looks like when it comes loose.
"""
import sys, json
import cv2
import numpy as np

BRIGHT = 215          # the director's threshold, on luminance
MIN_BLOB = 12         # pixels, at full frame size - smaller than this is grain
DRIFT_OK = 1.0        # px, the director's tolerance

def frames(path, step=1):
    cap = cv2.VideoCapture(path)
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i % step == 0:
            yield i, f
        i += 1
    cap.release()

def luma(bgr):
    return (0.0722 * bgr[..., 0] + 0.7152 * bgr[..., 1] + 0.2126 * bgr[..., 2])

def analyse(path, mask_png=None):
    fs = list(frames(path))
    if not fs:
        return {'ok': False, 'reason': 'no frames'}
    H, W = fs[0][1].shape[:2]

    # Where is anything ever bright? Union over the whole clip, so a flame that wanders
    # is caught by the region it wanders THROUGH, not just where it starts.
    union = np.zeros((H, W), np.uint8)
    per_frame = []
    for _, f in fs:
        b = (luma(f) > BRIGHT).astype(np.uint8)
        per_frame.append(b)
        union |= b

    mask = None
    if mask_png:
        m = cv2.imread(mask_png, cv2.IMREAD_GRAYSCALE)
        if m is not None:
            mask = (cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST) > 127)

    n, labels, stats, cents = cv2.connectedComponentsWithStats(union, 8)
    blobs = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < MIN_BLOB:
            continue
        sel = labels == i
        track = []
        for b in per_frame:
            hit = b.astype(bool) & sel
            c = int(hit.sum())
            if c == 0:
                track.append(None)
                continue
            ys, xs = np.nonzero(hit)
            track.append((float(xs.mean()), float(ys.mean()), c))
        seen = [t for t in track if t]
        if len(seen) < 2:
            continue
        xs = [t[0] for t in seen]; ys = [t[1] for t in seen]
        drift = float(np.hypot(max(xs) - min(xs), max(ys) - min(ys)))
        counts = [t[2] for t in seen]
        blobs.append({
            'x': int(stats[i, cv2.CC_STAT_LEFT]), 'y': int(stats[i, cv2.CC_STAT_TOP]),
            'w': int(stats[i, cv2.CC_STAT_WIDTH]), 'h': int(stats[i, cv2.CC_STAT_HEIGHT]),
            'union_area': area, 'drift_px': round(drift, 2),
            'frames_present': len(seen), 'of': len(track),
            'count_min': min(counts), 'count_max': max(counts),
            'centre': [round(float(cents[i][0]), 1), round(float(cents[i][1]), 1)],
            'moves': drift > DRIFT_OK,
        })
    blobs.sort(key=lambda b: -b['drift_px'])

    outside = None
    if mask is not None:
        worst = 0
        for b in per_frame:
            worst = max(worst, int((b.astype(bool) & ~mask).sum()))
        outside = worst

    return {'ok': True, 'file': path, 'frames': len(fs), 'size': [W, H],
            'blobs': blobs, 'moving': sum(1 for b in blobs if b['moves']),
            'bright_outside_mask': outside}

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    mask = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--mask=')), None)
    print(json.dumps({p: analyse(p, mask) for p in args}))

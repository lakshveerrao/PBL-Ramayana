#!/usr/bin/env python3
"""cameracheck - does the camera move?

Every M1 shot is marked `locked` and every motion instruction says so in words, but a
generative video model will drift the frame anyway, and a slow slide is the hardest
defect to see one frame at a time: 01-03 and 01-06 both slid, and both read as fine
until four frames were set side by side.

Phase correlation between the first frame and each later one gives the global shift in
pixels. A locked camera gives a flat line near zero. It measures the WHOLE frame, so a
big subject moving across it registers a little - which is why the threshold is a few
pixels and not zero.
"""
import sys, json
import cv2
import numpy as np

def drift(path):
    cap = cv2.VideoCapture(path)
    fs = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fs.append(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32))
    cap.release()
    if len(fs) < 2:
        return {'ok': False, 'reason': 'too few frames'}
    win = cv2.createHanningWindow((fs[0].shape[1], fs[0].shape[0]), cv2.CV_32F)
    worst, at, trail = 0.0, 0, []
    for i in range(1, len(fs)):
        (dx, dy), _ = cv2.phaseCorrelate(fs[0], fs[i], win)
        d = float(np.hypot(dx, dy))
        trail.append(round(d, 2))
        if d > worst:
            worst, at = d, i
    return {'ok': True, 'frames': len(fs), 'max_drift_px': round(worst, 2), 'at_frame': at,
            'end_drift_px': trail[-1], 'trail': trail}

if __name__ == '__main__':
    print(json.dumps({p: drift(p) for p in sys.argv[1:]}))

#!/usr/bin/env python3
"""atmos_matte.py - the near/far split for a parallax shot.

GrabCut on a small proxy, from a rectangle read off the same 10% grid the protection
ellipses came from. It is NOT the skin protection and must never be used as one: it
covers most of the frame, lattice windows included, and masking the air by it puts the
light out entirely - which is exactly what happened on the first attempt at 01-13.

The feather is what makes this hold. The two planes are the same bitmap at slightly
different scales, so a hard edge would show as a doubled silhouette. At the
displacements in direction/m1-atmos.json - four to eleven percent - an 18 px feather
hides the seam. Push further and it will show.
"""
import cv2, numpy as np, sys

still, out = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = [float(v) for v in sys.argv[3:7]]
img = cv2.imread(still)
H, W = img.shape[:2]
sw, sh = 270, 480
sm = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)

mask = np.full((sh, sw), cv2.GC_PR_BGD, np.uint8)
mask[int(y0*sh):int(y1*sh), int(x0*sw):int(x1*sw)] = cv2.GC_PR_FGD
# A core the subject certainly occupies: the middle of the rect, lower half.
cw0, cw1 = x0 + (x1-x0)*0.18, x0 + (x1-x0)*0.82
mask[int((y0 + (y1-y0)*0.25)*sh):sh, int(cw0*sw):int(cw1*sw)] = cv2.GC_FGD
mask[0:max(1, int(0.04*sh)), :] = cv2.GC_BGD          # the ceiling is never the subject
if x1 < 0.99: mask[0:int(0.30*sh), int(min(0.995, x1+0.02)*sw):sw] = cv2.GC_BGD
if x0 > 0.01: mask[0:int(0.30*sh), 0:int(max(0.005, x0-0.02)*sw)] = cv2.GC_BGD

cv2.grabCut(sm, mask, None, np.zeros((1,65), np.float64), np.zeros((1,65), np.float64),
            6, cv2.GC_INIT_WITH_MASK)
fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,  np.ones((5,5), np.uint8))
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9,9), np.uint8))
fg = cv2.GaussianBlur(cv2.resize(fg, (W,H), interpolation=cv2.INTER_LINEAR), (0,0), 18)
cv2.imwrite(out, fg)
print("%s  coverage %.1f%%" % (out.split('/')[-1], 100*fg.mean()/255))

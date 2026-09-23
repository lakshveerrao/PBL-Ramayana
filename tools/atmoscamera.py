#!/usr/bin/env python3
"""atmoscamera - did the camera do what it was told?

cameracheck cannot answer this one. It phase-correlates the whole frame against the
first, which is exactly right for its job - catching a generative model sliding a frame
it was instructed to lock - and exactly wrong for an authored two-plane move. On 01-11,
a 6.0% foreground push against a 10.8% background, over a colonnade of repeating arches
and swags, it reported 375.97 px with spikes of 345, 234 and 351 interleaved with 12:
a periodic background at a second scale gives the correlation a second peak, and it
jumps a whole period. The picture is a clean, steady push. The tool is not wrong, it is
being asked a question it was not built for.

So measure the thing that was actually authored: the SUBJECT's scale. Brute-force the
scale that best aligns the last frame to the first over the subject region, and compare
it against the ratio the direction file asked for. This does not re-run the renderer's
own maths, so it is a check and not an echo.
"""
import cv2, numpy as np, sys, json, os

film = sys.argv[1] if len(sys.argv) > 1 else 'M1'
D = json.load(open('direction/%s-atmos.json' % film.lower()))['shots']
TOL = 0.004          # 0.4% of frame - below this the search's own step is the error

def read(path, n):
    cap = cv2.VideoCapture(path); cap.set(cv2.CAP_PROP_POS_FRAMES, n); ok, f = cap.read()
    return cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) if ok else None

def best_scale(a, b, mask, ax, ay, lo, hi):
    """The scale about (ax, ay) that best takes a onto b, inside mask."""
    best, bs = None, None
    for s in np.arange(lo, hi, 0.001):
        M = np.array([[s, 0, (1-s)*ax], [0, s, (1-s)*ay]], np.float32)
        w = cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_REPLICATE)
        e = float(np.abs(w - b)[mask].mean())
        if best is None or e < best: best, bs = e, s
    return bs, best

print('\nAUTHORED CAMERA %s   does the subject scale by what the direction asked for?\n' % film)
print('  shot     asked    measured    delta     region')
worst = 0.0
for sid in sorted(D):
    rp = os.path.join('renders', film, 'atmos', '%s.json' % sid)
    if not os.path.exists(rp): continue
    rec = json.load(open(rp)); sp = rec['spec']
    asked = sp['zoom_to'] / sp['zoom_from']
    clip = rec['clip']
    a, b = read(clip, 0), read(clip, rec['frames'] - 1)
    if a is None or b is None: continue
    H, W = a.shape
    if rec['source_kind'] == 'clip' or abs(asked - 1.0) < 1e-9:
        print('  %-7s  locked   %-10s  %-8s  -' % (sid, '-', '-')); continue
    # The subject: the protection map is the one region that is reliably the person.
    P = np.zeros((H, W), np.float32)
    for cx, cy, rx, ry in D[sid].get('protect', []):
        cv2.ellipse(P, (int(cx*W), int(cy*H)), (max(2,int(rx*W)), max(2,int(ry*H))), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(P, (0,0), 46) > 0.75
    if mask.sum() < 5000:
        print('  %-7s  %.3f    too little subject to measure' % (sid, asked)); continue
    ax, ay = sp['anchor'][0]*W, sp['anchor'][1]*H
    lo, hi = min(asked, 1.0) - 0.02, max(asked, 1.0) + 0.02
    s, _ = best_scale(a, b, mask, ax, ay, lo, hi)
    d = s - asked
    worst = max(worst, abs(d))
    print('  %-7s  %.3f    %.3f       %+.3f    %s  %s'
          % (sid, asked, s, d, 'subject', 'OFF' if abs(d) > TOL else ''))
print('\n  worst deviation from the authored move: %+.3f (%.1f%% of frame)\n' % (worst, worst*100))

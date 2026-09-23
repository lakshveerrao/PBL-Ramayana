#!/usr/bin/env python3
"""atmos.py - the atmosphere pass: air, one light, and a camera move, on an approved still.

Written after 21 paid clips across two providers established that every shot M1 can move
is crownless and every crowned shot failed on both - kling holds the camera and breaks
rigid objects, Seedance holds rigid objects and breaks the camera. So the crowned shots
are held stills, and this is what a held still is allowed to do instead: the air moves,
the light moves, and the camera moves. Nothing in the frame is regenerated, so the crown
cannot float and a flame cannot detach from its wick - there is no model to invent one.

Three things, in the order they matter:

  THE CAMERA. An eased push, authored per shot against its beat, that arrives and then
  holds. cameracheck.py reads it as drift, correctly - it is a moving frame. The
  difference from a generative slide is not the magnitude (this is larger than the
  13.8 px that got 01-08 demoted) but that it goes one direction and stops.

  THE AIR. Three octaves of drifting haze, raking bars out of the high lattice at
  frame-left - which is where every M1 shot declares its key - and motes inside the bars.
  Back-keyed shots carry more of it, because backlit air glows and frontlit air does not.

  THE SKIN. The air goes everywhere except skin, and the protection is TOTAL where it is
  confident - no air at all, not 92% of none. It was 0.92 first, and across the film that
  leaked +0.4 to +1.1 L* onto protected skin, which is nothing beside the +/-10 report
  band and is still the wrong answer: the thing shown to the director on 01-13 was skin
  that did not move, and shipping fourteen shots where it moves a little is not that.
  The feather does the blending instead, over about 150 px, so nothing is cut out.

  Protection SATURATES at 0.8, not at 1.0 - keep = 1 - 1.25*P. A 46 px Gaussian on an
  ellipse never quite reaches 1.0 near its rim, so a plain 1 - P left up to a tenth of
  the air landing wherever the map read 0.9, which measured +0.16 L* on the two shots
  carrying the most air. That is arithmetic, not noise, and the fix is arithmetic too:
  above 0.8 the air is simply zero.

  Protection is a list of ellipses placed BY EYE off a 10% coordinate grid, the same way
  the lamps were found, because Haar cannot do it: on 01-13 find_face() returned a 75 px
  box on the THRONE and find_eyes() then returned None. A detector that finds the
  furniture is not a detector for a crowned, bearded man in profile.

The grade lifts shadows warm and rolls highlights DOWN. It cannot raise skin, which is
the one thing gradecheck hard-fails on.
"""
import cv2, numpy as np, sys, math, json

W, H = 1080, 1920

def smoothstep(t): return t*t*(3.0-2.0*t)

class Air:
    """Haze, bars and motes. Built once per shot, sampled per frame."""
    def __init__(self, seed, keyed):
        r = np.random.default_rng(seed)
        self.F = [(r.random((12, 7)).astype(np.float32), 12, 7, (0.42, -0.24), 0.55),
                  (r.random((26,15)).astype(np.float32), 26,15, (0.78, -0.44), 0.30),
                  (r.random((52,30)).astype(np.float32), 52,30, (1.40, -0.80), 0.15)]
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.nx, self.ny = xx/W, yy/H
        A = math.radians(31.0)                       # the bars travel down and to the right
        self.perp = (-xx*math.sin(A) + yy*math.cos(A))/W
        self.reach = np.clip(1.0 - (self.nx*0.50 + self.ny*0.46), 0, 1)**1.15
        # Backlit air glows; frontlit air is nearly invisible. Every M1 shot keys from the
        # same high lattice at frame-left, so the only thing that varies is which side of
        # it the subject is standing on.
        self.gain = 1.00 if keyed else 1.55
        M = 260
        self.mp = np.stack([r.random(M), r.random(M)], 1)
        self.mv = np.stack([r.normal(0.0060,0.0026,M), r.normal(0.0042,0.0020,M)], 1)
        self.ms = r.random(M)*0.7 + 0.3

    def at(self, t):
        hz = np.zeros((H,W), np.float32)
        for f, cy, cx, (vx,vy), a in self.F:
            hz += a*cv2.remap(f, (self.nx*cx+vx*t).astype(np.float32),
                                 (self.ny*cy+vy*t).astype(np.float32),
                              cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
        hz = np.clip((hz-0.34)/0.50, 0, 1)
        bars = (0.5 + 0.5*np.cos(2*math.pi*(self.perp*4.3 + 0.010*t)))**3.0
        sh = bars*self.reach
        p = np.mod(self.mp + self.mv*t, 1.0)
        c = np.zeros((H,W), np.float32)
        px = (p[:,0]*W).astype(np.int32); py = (p[:,1]*H).astype(np.int32)
        ok = (px>2)&(px<W-3)&(py>2)&(py<H-3)
        np.add.at(c, (py[ok], px[ok]), self.ms[ok])
        mo = cv2.GaussianBlur(c, (0,0), 2.4)*4.0
        vol = sh*(0.30 + 0.70*hz)
        return (vol*74.0 + hz*self.reach*17.0 + mo*vol*120.0)*self.gain

WARM = np.array([0.58, 0.84, 1.00], np.float32)      # BGR

def protect_map(ellipses):
    """Skin, as ellipses in frame fractions: [cx, cy, rx, ry]."""
    P = np.zeros((H,W), np.float32)
    for cx, cy, rx, ry in ellipses:
        cv2.ellipse(P, (int(cx*W), int(cy*H)), (max(2,int(rx*W)), max(2,int(ry*H))), 0, 0, 360, 1.0, -1)
    return np.clip(cv2.GaussianBlur(P, (0,0), 46), 0, 1) if len(ellipses) else P

def grade(x, keep):
    """Warm into the shadows, highlights rolled DOWN, and the lift kept OFF skin.

    The lift was ungated first, and it raised protected skin on seven of fifteen shots -
    up to +0.47 L* on 01-02 and 01-12, the shots with the most skin in shadow. It is a
    shadow lift and shadowed skin is shadow, so of course it did. That is the one thing
    CLAUDE.md hard-fails: a grade op that raises skin against the ungraded frame. Nothing
    in the repo would have caught it either - gradecheck pushes the locked albedo through
    lib/grade.js analytically and this grade is baked into the clip long before that.

    So the lift rides the same protection map the air does, and skin gets only the
    highlight roll-off, which can lower a specular and can never raise anything."""
    x = x/255.0
    s = np.clip(1.0 - x.mean(axis=2, keepdims=True)*2.2, 0, 1)
    x = x + np.array([0.010, 0.018, 0.030], np.float32)*s*keep[..., None]
    x = np.where(x > 0.78, 0.78 + (x-0.78)*0.72, x)
    return np.clip(x, 0, 1)*255.0

def affine(im, z, ax, ay, dx=0.0, dy=0.0):
    M = np.array([[z, 0, (1-z)*ax + dx], [0, z, (1-z)*ay + dy]], np.float32)
    return cv2.warpAffine(im, M, (W,H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def ramp_warp(im, zf, zb, ax, ay, dx, dy, wmap, gx, gy):
    """A depth RAMP - scale varies smoothly with the depth weight, so the far end of a
    hall travels further than the near end. No matte, so no silhouette to come apart.
    Used where a cut-out is ill-defined: a wide of fifteen seated men has no foreground."""
    z = zf + (zb - zf)*wmap
    mx = ax + (gx - ax - dx)/z
    my = ay + (gy - ay - dy)/z
    return cv2.remap(im, mx.astype(np.float32), my.astype(np.float32),
                     cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def main():
    # --only N emits just that frame, and --no-air emits it without the air. Both exist
    # for the verifier: everything here is a pure function of the frame index - the haze
    # of t, the camera of the eased p - so any single frame can be made on its own, and
    # the same frame with and without the air is the only honest control for "did the
    # air land on skin".
    args = sys.argv[1:]
    only = None; want_air = True
    if '--only' in args:
        i = args.index('--only'); only = int(args[i+1]); del args[i:i+2]
    if '--no-air' in args:
        args.remove('--no-air'); want_air = False
    want_grade = True
    if '--no-grade' in args:
        args.remove('--no-grade'); want_grade = False
    spec = json.load(open(args[0]))
    N = int(spec['frames'])
    prot = protect_map(spec.get('protect', []))
    air = Air(spec.get('seed', 5), spec.get('lit', 'keyed') == 'keyed')
    z0, z1 = float(spec.get('zoom_from', 1.0)), float(spec.get('zoom_to', 1.0))
    ax, ay = [float(v) for v in spec.get('anchor', [0.5, 0.5])]
    ax, ay = ax*W, ay*H
    px, py = [float(v) for v in spec.get('pan', [0.0, 0.0])]
    # The background has its own from/to rather than an offset, so a shot that CONTINUES
    # another can pick both planes up exactly where the previous one left them. 01-15 is
    # 01-13's still again after a cut away to the sage; resuming the push instead of
    # snapping back is the difference between one shot resumed and a jump.
    b0 = float(spec.get('bg_from', z0)); b1 = float(spec.get('bg_to', z1))
    kind = spec.get('parallax_kind', 'none')
    hold = float(spec.get('hold', 0.82))             # fraction of the shot spent moving
    ease = spec.get('ease', 'inout')

    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    wmap = None
    if kind == 'ramp':
        wmap = np.clip(1.0 - (gy/H)/0.85, 0, 1)      # a hall recedes upward
        wmap = cv2.GaussianBlur(smoothstep(wmap), (0,0), 60)
    matte = None
    if kind == 'matte':
        m = cv2.imread(spec['matte'], 0)
        matte = (m.astype(np.float32)/255.0) if m is not None else None
        if matte is None: kind = 'none'

    cap = None
    still = None
    if spec.get('source_kind') == 'clip':
        cap = cv2.VideoCapture(spec['source'])
    else:
        still = cv2.imread(spec['source']).astype(np.float32)
        if still.shape[:2] != (H, W):
            still = cv2.resize(still, (W,H), interpolation=cv2.INTER_AREA)

    out = sys.stdout.buffer
    last = None
    frames = range(N) if only is None else [max(0, min(N-1, only))]
    if only is not None and cap is not None:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frames[0])
    for i in frames:
        t = i/30.0
        q = min(i/max(N*hold, 1.0), 1.0)
        p = smoothstep(q) if ease == 'inout' else q
        if cap is not None:
            ok, f = cap.read()
            if not ok:
                f = last                              # a clip one frame short holds, never black
            if f is None: raise SystemExit('clip %s gave no frames' % spec['source'])
            last = f
            base = f.astype(np.float32)
            if base.shape[:2] != (H, W):
                base = cv2.resize(base, (W,H), interpolation=cv2.INTER_AREA)
            keep = np.clip(1.0 - 1.25*prot, 0, 1)
        else:
            zf = z0 + (z1 - z0)*p
            zb = b0 + (b1 - b0)*p
            dx, dy = px*W*p, py*H*p
            if kind == 'matte':
                mv = np.clip(affine(matte, zf, ax, ay, dx, dy), 0, 1)[...,None]
                base = affine(still, zb, ax, ay, dx, dy)*(1.0-mv) + affine(still, zf, ax, ay, dx, dy)*mv
            elif kind == 'ramp':
                base = ramp_warp(still, zf, zb, ax, ay, dx, dy, wmap, gx, gy)
            else:
                base = affine(still, zf, ax, ay, dx, dy)
            keep = np.clip(1.0 - 1.25*np.clip(affine(prot, zf, ax, ay, dx, dy), 0, 1), 0, 1)
        frame = base
        if want_air:
            frame = base + (air.at(t)*keep)[...,None]*WARM
        if want_grade:
            frame = grade(frame, keep)
        out.write(np.ascontiguousarray(np.clip(frame, 0, 255).astype(np.uint8)))

if __name__ == '__main__':
    main()

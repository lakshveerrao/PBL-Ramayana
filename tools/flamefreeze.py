#!/usr/bin/env python3
"""flamefreeze - freeze a lamp, rather than re-render a shot.

A generative video model does not know a flame is attached to a wick. It treats fire as
texture and lets it drift: in M1/01-03 the diya at bottom-left has flames that slide
along the rim and detach, one hovering clear of the rim around 5.2 s, while the lamp and
the bowl beneath it stay put. The director found it on 2026-09-23.

Re-rendering is the expensive fix and an uncertain one - the same prompt gets a new roll
of the dice. Freezing is exact: the approved STILL is composited back over the clip,
masked to the lamp alone, with a soft edge. Everything the shot is actually about keeps
moving; the fire stops being animated at all, which is what the graph asked for in the
first place ("a lamp flame drifting" was never meant to mean a lamp flame travelling).

WHERE THE MASK COMES FROM - and the first attempt at it, which was wrong. Taking the
still's bright compact blobs as "the lamps" found 431 of them in 01-03: lattice light on
stone, gold highlights on ornament, the bright edge of a pillar. Bright and small is not
a lamp.

What IS a lamp, for this purpose, is a bright compact blob THAT MOVES while the shot
around it holds. That is not a proxy for the defect - it is the defect. So the mask is
built from the clip's own moving blobs, dilated and feathered, and the still is pasted
back over exactly the things that are wrongly in motion. A lamp that already sits still
needs no freezing and gets none.

WHAT IT WILL NOT TOUCH. A blob bigger than MAX_AREA or wider than MAX_DIM is a window, a
shaft of lattice light or a person in one; freezing that would freeze the shot. And if
the mask ever covers more than MAX_MASK_FRACTION of the frame, the tool refuses rather
than quietly pasting a still over a performance.
"""
import sys, json, subprocess, tempfile, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2
import numpy as np

BRIGHT = 215
# Measured on 01-03's diya, the shot the director found the defect in. Its three loose
# flames read peak luminance 255 - a flame core clips white - areas 580 to 976 px, and
# centroid drifts of 7.6 to 10.9 px. Everything that is bright and moving but is NOT a
# flame in that shot - lattice light shifting on stone, gold ornament catching a
# highlight - peaks lower or drifts less. These thresholds keep all three diya flames
# and drop 73 of the 84 moving blobs.
MAX_AREA = 1500       # px at 1080x1920 - a lamp flame, not a window
MAX_DIM = 140
MIN_AREA = 12
PEAK_L = 250          # a flame core clips; a warm highlight on stone does not
MIN_DRIFT = 5.0       # px. Below this is shimmer, not a flame coming loose.
SURROUND_STILL = 3.0  # mean abs frame-to-frame change, 0-255, of the ring around a blob
CHANGED_L = 24        # luminance difference from the still that counts as 'it moved'
GROW = 18             # px, to cover the lamp body and its immediate glow
FEATHER = 9           # px of soft edge - odd, for the Gaussian

def luma(bgr):
    return (0.0722 * bgr[..., 0] + 0.7152 * bgr[..., 1] + 0.2126 * bgr[..., 2])

MAX_MASK_FRACTION = 0.02   # of the frame. Past this it is not a lamp, it is the shot.

def moving_lamps(clip):
    """The bright compact blobs in a clip whose centroid wanders. Shares its arithmetic
    with tools/flamecheck.py, which is also what verifies the result - one definition of
    "moves" for the fix and for the test."""
    from flamecheck import analyse, DRIFT_OK
    r = analyse(clip)
    if not r.get('ok'):
        return None, []
    cap = cv2.VideoCapture(clip)
    fs = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fs.append(f)
    cap.release()
    peak = np.stack([luma(f) for f in fs]).max(axis=0)
    out = []
    for b in r['blobs']:
        if b['drift_px'] < MIN_DRIFT:
            continue
        if not (MIN_AREA <= b['union_area'] <= MAX_AREA) or max(b['w'], b['h']) > MAX_DIM:
            continue
        pk = float(peak[b['y']:b['y'] + b['h'], b['x']:b['x'] + b['w']].max())
        if pk < PEAK_L:
            continue
        # THE TEST THAT SEPARATES A FLAME FROM A GOLD NECKLACE, and it is the
        # director's own description of the defect: "the lamp and bowl are steady; only
        # the fire moves". Brightness and drift alone kept eleven blobs in 01-03, and
        # seven of them were ornament on ministers who are TURNING THEIR HEADS - that
        # gold is supposed to move, and freezing it would freeze the men wearing it.
        #
        # So compare the blob's drift with the motion of the ring around it. A loose
        # flame wanders while its lamp holds. A highlight on a moving man travels with
        # the man, and the ring travels with him too.
        ring = surround_motion(fs, b)
        if ring > SURROUND_STILL:
            continue
        b = dict(b, peak_L=round(pk, 1), surround_motion=round(ring, 2))
        out.append(b)
    return r, out

def surround_motion(fs, b, grow=2.0):
    """Mean absolute frame-to-frame change in the ring around a blob, excluding the blob."""
    H, W = fs[0].shape[:2]
    cx, cy = b['x'] + b['w'] / 2, b['y'] + b['h'] / 2
    rw, rh = b['w'] * grow, b['h'] * grow
    x0, x1 = max(0, int(cx - rw)), min(W, int(cx + rw))
    y0, y1 = max(0, int(cy - rh)), min(H, int(cy + rh))
    inner = (slice(max(0, b['y'] - 3), min(H, b['y'] + b['h'] + 3)),
             slice(max(0, b['x'] - 3), min(W, b['x'] + b['w'] + 3)))
    ring = np.ones((H, W), bool)
    ring[:] = False
    ring[y0:y1, x0:x1] = True
    ring[inner] = False
    if ring.sum() < 50:
        return 0.0
    prev = None
    tot, n = 0.0, 0
    for f in fs:
        g = luma(f)
        if prev is not None:
            tot += float(np.abs(g[ring] - prev[ring]).mean()); n += 1
        prev = g
    return tot / max(1, n)

def _fit_still(path, W, H):
    """The stills are 1152x2048; the clips are the frame size. Cover and centre-crop,
    exactly as tools/install_stills.js did, so the pixels line up with the clip's."""
    b = cv2.imread(path, cv2.IMREAD_COLOR)
    if b.shape[:2] == (H, W):
        return b
    sh, sw = b.shape[:2]
    sc = max(W / sw, H / sh)
    b = cv2.resize(b, (int(round(sw * sc)), int(round(sh * sc))), interpolation=cv2.INTER_LANCZOS4)
    y0 = (b.shape[0] - H) // 2; x0 = (b.shape[1] - W) // 2
    return b[y0:y0 + H, x0:x0 + W]

def changed_bright_mask(clip, still_bgr):
    """The lamps, found without a single coordinate being guessed.

    A flame is BRIGHT and it CHANGED. Nothing else in these shots is both: a person who
    moves is not above the bright threshold, and the architecture that is above it -
    lattice light on stone, a gilded pillar - is far too big to be a lamp and is capped
    out by area. So the mask is the bright pixels that differ between the approved still
    and the clip, clustered, size-capped, grown and feathered.

    This replaced two worse ideas. Taking the still's bright compact blobs found 431
    "lamps" in 01-03. Taking the clip's bright moving blobs kept gold ornament on
    ministers who were turning their heads, and adding "the surround must be still" only
    got it down to a minister's turban. Both then needed hand-placed boxes, and a box
    placed by eye off a scaled screenshot put 01-07's mask on the king's crown.
    """
    cap = cv2.VideoCapture(clip)
    H, W = still_bgr.shape[:2]
    sl = luma(still_bgr)
    changed = np.zeros((H, W), np.uint8)
    bright = np.zeros((H, W), np.uint8)
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fl = luma(f)
        b = (fl > BRIGHT) | (sl > BRIGHT)
        d = np.abs(fl - sl) > CHANGED_L
        changed |= (b & d).astype(np.uint8)
        bright |= (fl > BRIGHT).astype(np.uint8)
    cap.release()

    n, lab, st, _ = cv2.connectedComponentsWithStats(changed, 8)
    seed = np.zeros((H, W), np.uint8)
    kept = []
    for i in range(1, n):
        a = int(st[i, cv2.CC_STAT_AREA])
        w, h = int(st[i, cv2.CC_STAT_WIDTH]), int(st[i, cv2.CC_STAT_HEIGHT])
        if a < MIN_AREA or a > MAX_AREA or max(w, h) > MAX_DIM:
            continue
        seed[lab == i] = 255
        kept.append({'x': int(st[i, cv2.CC_STAT_LEFT]), 'y': int(st[i, cv2.CC_STAT_TOP]),
                     'w': w, 'h': h, 'area': a})
    if not seed.any():
        return None, []
    hard = cv2.dilate(seed, np.ones((GROW * 2 + 1,) * 2, np.uint8))
    return cv2.GaussianBlur(hard, (FEATHER * 2 + 1,) * 2, 0).astype(np.float32) / 255.0, kept

def lamp_mask(shape, blobs, clip_bright_union, regions=None):
    """The mask, from the clip's own bright pixels - but only those inside a DECLARED
    lamp region.

    The detector alone is not enough to decide what a lamp is, and the failure is
    instructive: brightness and drift kept eleven blobs in 01-03, seven of them gold
    ornament on ministers who are turning their heads. Adding "the surround must be
    still" - the director's own description, "the lamp and bowl are steady; only the
    fire moves" - cut it to seven, and three were still a minister's turban and
    shoulder. A heuristic that freezes a man's face to stop a flame wandering has done
    more damage than the flame.

    So the detector PROPOSES and direction/m1-flame-freeze.json DISPOSES. Each region is
    a box a person looked at, recorded with the drift that justified it. What gets
    frozen inside the box is still decided by the pixels - the bright blobs there, grown
    and feathered - so the box is a permission, not a brush.
    """
    H, W = shape
    n, lab, st, _ = cv2.connectedComponentsWithStats(clip_bright_union, 8)
    seed = np.zeros((H, W), np.uint8)
    wanted = {(b['x'], b['y'], b['w'], b['h']) for b in blobs}
    for i in range(1, n):
        x, y = int(st[i, cv2.CC_STAT_LEFT]), int(st[i, cv2.CC_STAT_TOP])
        w, h = int(st[i, cv2.CC_STAT_WIDTH]), int(st[i, cv2.CC_STAT_HEIGHT])
        if regions is not None:
            cx, cy = x + w / 2, y + h / 2
            if not any(r[0] <= cx <= r[0] + r[2] and r[1] <= cy <= r[1] + r[3] for r in regions):
                continue
            if not (MIN_AREA <= int(st[i, cv2.CC_STAT_AREA]) <= MAX_AREA) or max(w, h) > MAX_DIM:
                continue
        elif (x, y, w, h) not in wanted:
            continue
        seed[lab == i] = 255
    if not seed.any():
        return None
    hard = cv2.dilate(seed, np.ones((GROW * 2 + 1,) * 2, np.uint8))
    return cv2.GaussianBlur(hard, (FEATHER * 2 + 1,) * 2, 0).astype(np.float32) / 255.0

def bright_union(path):
    cap = cv2.VideoCapture(path)
    acc = None
    while True:
        ok, f = cap.read()
        if not ok:
            break
        b = (luma(f) > BRIGHT).astype(np.uint8)
        acc = b if acc is None else np.maximum(acc, b)
    cap.release()
    return acc

def freeze(clip, still, out, fps=30, regions=None):
    cap = cv2.VideoCapture(clip)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    still_bgr = _fit_still(still, W, H)

    blobs = []
    if regions is None:
        m, blobs = changed_bright_mask(clip, still_bgr)
        if m is None:
            return {'ok': True, 'frozen': False, 'reason': 'nothing bright changed between the still and the clip - nothing to freeze'}
    else:
        m = lamp_mask((H, W), blobs, bright_union(clip), regions)
    if m is None:
        return {'ok': False, 'reason': 'the moving blobs could not be matched back to the clip'}
    frac = float((m > 0.5).mean())
    if frac > MAX_MASK_FRACTION:
        return {'ok': False, 'frozen': False,
                'reason': f'the mask would cover {frac * 100:.1f}% of the frame, over the {MAX_MASK_FRACTION * 100:.0f}% ceiling - that is not a lamp, it is the shot',
                'mask_fraction': round(frac, 5), 'blobs': len(blobs)}
    m3 = np.dstack([m] * 3)

    cap = cv2.VideoCapture(clip)
    tmp = tempfile.mkdtemp()
    raw = os.path.join(tmp, 'f.rgb')
    with open(raw, 'wb') as fh:
        n = 0
        while True:
            ok, f = cap.read()
            if not ok:
                break
            blended = (f.astype(np.float32) * (1 - m3) + still_bgr.astype(np.float32) * m3)
            fh.write(np.clip(blended, 0, 255).astype(np.uint8)[..., ::-1].tobytes())
            n += 1
    cap.release()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo',
                    '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', raw,
                    '-frames:v', str(n), '-c:v', 'libx264', '-crf', '14',
                    '-pix_fmt', 'yuv420p', '-y', out], check=True)
    os.remove(raw); os.rmdir(tmp)
    # The mask travels with the clip. tools/flameverify.py tests against the actual
    # frozen area, not the box that permitted it - a box is a permission and can be
    # generous; the mask is what was really pasted.
    mask_png = os.path.splitext(out)[0] + '.mask.png'
    cv2.imwrite(mask_png, (m * 255).astype(np.uint8))
    return {'ok': True, 'frozen': True, 'frames': n,
            'lamps_frozen': [{'x': b['x'], 'y': b['y'], 'w': b['w'], 'h': b['h'],
                              'drift_px': b['drift_px'], 'area': b['union_area']} for b in blobs],
            'mask_px': int((m > 0.5).sum()), 'mask_fraction': round(frac, 5),
            'mask_png': mask_png, 'grow_px': GROW, 'feather_px': FEATHER}

def preview(clip, out, regions=None, still=None):
    """Draw the mask over the clip's first frame, so the choice can be looked at."""
    blobs = []
    cap = cv2.VideoCapture(clip); ok, f = cap.read(); cap.release()
    H, W = f.shape[:2]
    if regions is None:
        m, blobs = changed_bright_mask(clip, _fit_still(still, W, H))
    else:
        m = lamp_mask((H, W), blobs, bright_union(clip), regions)
    if m is not None:
        tint = np.zeros_like(f); tint[..., 2] = 255
        f = np.clip(f.astype(np.float32) * (1 - m[..., None] * 0.55) + tint * (m[..., None] * 0.55), 0, 255).astype(np.uint8)
    for b in blobs:
        cv2.rectangle(f, (b['x'] - 4, b['y'] - 4), (b['x'] + b['w'] + 4, b['y'] + b['h'] + 4), (0, 255, 255), 2)
    for r in (regions or []):
        cv2.rectangle(f, (r[0], r[1]), (r[0] + r[2], r[1] + r[3]), (0, 255, 0), 2)
    cv2.imwrite(out, f)
    return {'blobs': len(blobs), 'mask_fraction': round(float((m > 0.5).mean()), 5) if m is not None else 0}

if __name__ == '__main__':
    regions = None
    ra = next((a for a in sys.argv[1:] if a.startswith('--regions=')), None)
    if ra:
        regions = json.loads(ra.split('=', 1)[1])
        sys.argv = [a for a in sys.argv if not a.startswith('--regions=')]
    if sys.argv[1] == '--preview':
        print(json.dumps(preview(sys.argv[2], sys.argv[3], regions, sys.argv[4] if len(sys.argv) > 4 else None)))
    else:
        clip, still, out = sys.argv[1], sys.argv[2], sys.argv[3]
        print(json.dumps(freeze(clip, still, out, regions=regions)))

#!/usr/bin/env python3
"""cheek.py - the median cheek colour of a face, from an image or a video frame.

The director settled the skin question by hand on 2026-09-22: the king's cheek reads
57.4 on his sheet, 58.0 in 01-13 and 57.5 in 01-11. No lightening. What the earlier
check reported as faces +12 to +22 above their sheets was two different measurements
being compared - every skin-ish pixel in a studio portrait against every skin-ish pixel
in a lit film frame, where warm sandstone, gold and lamp light all pass a skin-hue test.

So: the SAME REGION from both. One implementation, used for the sheet and for the
frame, because "compare like with like" is a promise a second implementation would
quietly break.

Finding the face is a detector's job, not a heuristic's. Two attempts at inferring a
head from skin geometry failed in different ways and both are worth remembering: the
topmost quarter of the skin MASS lands in the torso on a full-length portrait, because
a bare chest holds more skin than a face (it measured Dasaratha's chest shadow at
L* 24.4); and walking down by row WIDTH to find the shoulders is too brittle to find a
head at all in four sheets out of six. Haar finds the face.
"""
import sys, json
import cv2
import numpy as np

def _cascade(name):
    return cv2.CascadeClassifier(cv2.data.haarcascades + name)

def find_face(bgr):
    """The largest face in the frame. Frontal first, then profile, then profile on a
    mirrored frame - a right-facing profile is a left-facing one seen backwards."""
    gray = cv2.equalizeHist(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
    for name, flip in (('haarcascade_frontalface_default.xml', False),
                       ('haarcascade_profileface.xml', False),
                       ('haarcascade_profileface.xml', True)):
        g = cv2.flip(gray, 1) if flip else gray
        faces = _cascade(name).detectMultiScale(g, scaleFactor=1.08, minNeighbors=6,
                                                minSize=(max(24, gray.shape[0] // 40),) * 2)
        if len(faces):
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            if flip:
                x = gray.shape[1] - x - w
            return int(x), int(y), int(w), int(h)
    return None

# THE CHEEK IS PLACED FROM THE EYES, not from the face box.
#
# Haar's face box is not reliable in its vertical placement on these men: on Dasaratha
# the crown pulls the box down so far that the "cheek" band landed on his gold necklace
# and bare chest, reading L* 68 against the 57.4 the director measured by hand. On
# Visvamitra and Vasistha the same fixed fractions landed on the brow and the eye
# sockets. A box that wanders cannot anchor a patch of skin.
#
# Eyes can. The interocular distance d is the one measurement on a face that a beard, a
# crown and a turn of the head do not change, and the cheek is a fixed offset from it:
# below the eye, inside the jaw, above the beard. So the cheek is a disc under each eye,
# and every image is measured at the same place on the same face.
CHEEK_DROP = 0.85      # centres, in interocular distances below the eye line
CHEEK_OUT = 0.18       # and outward, away from the nose - straight down is nose, not cheek
CHEEK_RADIUS = 0.22    # the disc

def find_eyes(bgr, face):
    """The two eyes inside a face box, as centres, or None."""
    x, y, w, h = face
    gray = cv2.equalizeHist(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
    # Search a region GROWN AROUND the box, not the box's upper 60%. Haar puts the box
    # too low on a crowned, bearded man - on Dasaratha it covered beard and chest, so
    # the eyes were above it and a search inside it found nothing at all. Growing up by
    # half a box height and out by a quarter of its width finds them wherever the box
    # actually landed, and the pairing test below throws away anything that is not a
    # pair of eyes.
    gy0, gy1 = max(0, int(y - h * 0.55)), min(gray.shape[0], int(y + h * 0.75))
    gx0, gx1 = max(0, int(x - w * 0.25)), min(gray.shape[1], int(x + w * 1.25))
    roi = gray[gy0:gy1, gx0:gx1]
    if roi.size == 0:
        return None
    eyes = _cascade('haarcascade_eye.xml').detectMultiScale(roi, scaleFactor=1.05, minNeighbors=8,
                                minSize=(max(8, w // 14), max(8, w // 14)))
    if len(eyes) < 2:
        return None
    eyes = sorted(eyes, key=lambda e: -e[2] * e[3])[:6]
    cent = sorted([(gx0 + ex + ew / 2, gy0 + ey + eh / 2) for ex, ey, ew, eh in eyes])
    # Among the pairs that could be eyes - far enough apart, level with each other -
    # take the one sitting nearest where eyes belong: about 45% down the face box. The
    # widest pair is the wrong tiebreak. On Visvamitra it chose two shapes on the brow
    # and put both cheek discs on his forehead, which still returned a plausible-looking
    # number, and a plausible-looking number in the wrong place is the failure mode this
    # whole exercise exists to stop.
    want_y = y + h * 0.45
    best = None
    for i in range(len(cent)):
        for j in range(i + 1, len(cent)):
            (ax, ay), (bx, by) = cent[i], cent[j]
            d = bx - ax
            if d < w * 0.15 or d > w * 0.75:
                continue
            if abs(ay - by) > d * 0.35:
                continue
            err = abs((ay + by) / 2 - want_y) / max(1.0, h)
            if best is None or err < best[3]:
                best = ((ax, ay), (bx, by), d, err)
    return best[:3] if best else None

def is_skin(bgr_patch):
    """The same skin test used everywhere in this repo: hue 5-40, saturation 0.15-0.55,
    R > G >= B, and no bright floor - a tool that excludes dark pixels to find skin is a
    colourist tool."""
    hsv = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0].astype(np.float32) * 2, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
    b, g, r = bgr_patch[..., 0].astype(int), bgr_patch[..., 1].astype(int), bgr_patch[..., 2].astype(int)
    return (h >= 5) & (h <= 40) & (s >= 0.15) & (s <= 0.55) & (v <= 0.92) & (r > g) & (g >= b)

def lstar(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    return 903.3 * Y if Y <= 0.008856 else 116 * np.cbrt(Y) - 16

def cheek(path):
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        return {'ok': False, 'reason': f'could not read {path}'}
    full = bgr
    fullH, fullW = full.shape[:2]
    scale = 1.0
    if max(fullH, fullW) > 2200:              # big enough that a small face still has pixels to detect on
        scale = 2200 / max(fullH, fullW)
        bgr = cv2.resize(full, (int(fullW * scale), int(fullH * scale)), interpolation=cv2.INTER_AREA)
    H, W = bgr.shape[:2]
    box = find_face(bgr)
    if box is None:
        return {'ok': False, 'reason': 'no face found'}
    x, y, w, h = box
    eyes = find_eyes(bgr, box)
    if eyes is None:
        return {'ok': False, 'reason': 'face found but not both eyes - the cheek cannot be placed', 'face': [x, y, w, h]}
    (lx, ly), (rx, ry), d = eyes

    # Detection ran on a frame scaled down for speed; MEASURE on the original. On
    # Visvamitra's full-length sheet the detected interocular distance is 26 px, which
    # is 242 pixels of cheek to take a median over - and the same face at full size is
    # several thousand. The geometry is scale-free, so only the sampling moves.
    bgr = full
    yy, xx = np.mgrid[0:fullH, 0:fullW]
    k = 1.0 / scale
    lx, ly, rx, ry, d = lx * k, ly * k, rx * k, ry * k, d * k
    H, W = fullH, fullW

    band = np.zeros((H, W), bool)
    boxes = []
    mid = (lx + rx) / 2
    for (ex, ey) in ((lx, ly), (rx, ry)):
        out = -1 if ex < mid else 1          # away from the nose, whichever side this eye is
        ccx, ccy = ex + out * d * CHEEK_OUT, ey + d * CHEEK_DROP
        band |= ((xx - ccx) ** 2 + (yy - ccy) ** 2) <= (d * CHEEK_RADIUS) ** 2
        boxes.append([int(ccx - d * CHEEK_RADIUS), int(ccy - d * CHEEK_RADIUS),
                      int(2 * d * CHEEK_RADIUS), int(2 * d * CHEEK_RADIUS)])
    band &= is_skin(bgr)
    n = int(band.sum())
    if n < 50:
        return {'ok': False, 'reason': f'only {n} skin pixels in the cheek discs', 'face': [x, y, w, h]}
    px = bgr[band]                            # BGR
    med = np.median(px, axis=0)
    rgb = [int(med[2]), int(med[1]), int(med[0])]
    return {'ok': True, 'rgb': rgb, 'hex': '#%02X%02X%02X' % tuple(rgb), 'L': round(float(lstar(rgb)), 2),
            'pixels': n, 'face': [int(x / scale), int(y / scale), int(w / scale), int(h / scale)], 'face_fraction': round(h / (fullH * scale), 4),
            'eyes': [[round(lx, 1), round(ly, 1)], [round(rx, 1), round(ry, 1)]], 'interocular': round(d, 1),
            'cheek_boxes': boxes}

if __name__ == '__main__':
    print(json.dumps({p: cheek(p) for p in sys.argv[1:]}))

def draw(path, out):
    """Write a copy with the detected face box and the cheek band drawn on it, so a
    number can be looked at instead of trusted."""
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    r = cheek(path)
    if r.get('face'):
        x, y, w, h = r['face']
        cv2.rectangle(bgr, (x, y), (x + w, y + h), (0, 255, 255), 2)
    for cb in r.get('cheek_boxes', []):
        cx, cy, cw, ch = cb
        cv2.rectangle(bgr, (cx, cy), (cx + cw, cy + ch), (0, 0, 255), 2)
    if r.get('ok'):
        cv2.putText(bgr, f"L* {r['L']}", (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    cv2.imwrite(out, bgr)

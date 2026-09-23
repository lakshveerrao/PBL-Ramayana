#!/usr/bin/env python3
"""atmoscheck - draw where the air is allowed to go, on the frame it will go onto.

The measurement cannot find skin the author missed. A detector that over-reads warm
sandstone and gold as skin would flag half the room, and one that under-reads leaves a
bare shoulder lit by a raking bar - which is exactly what happened on 01-16, where the
face, chest and near arm were all protected and the FAR shoulder was not.

So this draws it and a person looks. Green is protected. Anything skin-coloured that is
not green is skin the air will land on.
"""
import cv2, numpy as np, sys, json

film = sys.argv[1]; out = sys.argv[2]
D = json.load(open('direction/%s-atmos.json' % film.lower()))['shots']
res = json.load(open(sys.argv[3]))            # {shot: still path}
tiles = []
for sid, path in res.items():
    d = D.get(sid)
    if not d: continue
    img = cv2.imread(path)
    if img is None: continue
    H, W = img.shape[:2]
    P = np.zeros((H, W), np.float32)
    for cx, cy, rx, ry in d.get('protect', []):
        cv2.ellipse(P, (int(cx*W), int(cy*H)), (max(2,int(rx*W)), max(2,int(ry*H))), 0, 0, 360, 1.0, -1)
    P = np.clip(cv2.GaussianBlur(P, (0,0), 46), 0, 1)[..., None]
    o = img.astype(np.float32)*(1 - P*0.5) + np.array([0,255,0], np.float32)*P*0.5
    o = cv2.resize(o.astype(np.uint8), (250, 444))
    cv2.putText(o, sid, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,0), 4)
    cv2.putText(o, sid, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,255), 1)
    tiles.append(o)
rows = [np.hstack(tiles[i:i+5]) for i in range(0, len(tiles), 5)]
w = max(r.shape[1] for r in rows)
rows = [np.pad(r, ((0,0),(0,w-r.shape[1]),(0,0))) for r in rows]
cv2.imwrite(out, np.vstack(rows))
print("%d shots -> %s" % (len(tiles), out))

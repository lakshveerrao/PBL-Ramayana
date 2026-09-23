#!/usr/bin/env python3
"""atmosverify - did the air land on skin?

The only honest control for an atmosphere pass is the SAME frame without the air: same
camera, same grade, same everything. atmos.py can make one, because every layer in it is
a pure function of the frame index. So for three frames of every shot this renders both,
and measures the brightening inside the protected core against the brightening out in
the open.

What it is checking is not "is the air visible" - it should be, that is the point - but
that none of it reaches skin. A protected core that brightens on average is the failure,
and the film-wide rule is the one gradecheck already holds: nothing may RAISE skin.

It cannot find skin the author forgot to protect. Nothing can; a skin detector that reads
warm sandstone and gold as skin flags half the room, and one tight enough not to leaves a
bare shoulder in a raking bar. That is what atmoscheck.py draws for a person to look at.
"""
import cv2, numpy as np, sys, json, subprocess, os

film = sys.argv[1] if len(sys.argv) > 1 else 'M1'
D = json.load(open('direction/%s-atmos.json' % film.lower()))['shots']
recdir = os.path.join('renders', film, 'atmos')
FAIL_SKIN = 0.10         # confident skin, mean dL* - above this the air is lighting a face
# Three zones, because one number hid the answer. The first pass gated on "protection
# above 0.6", which is mostly the FEATHER - the ring where the air is arriving, by
# design - so it read +0.4 to +1.1 across the film and called ten shots failures without
# saying whether any of it was on a face. Confident skin is above 0.9. Between them is
# the transition, which is reported and not gated, because air arriving at the edge of a
# shoulder is the effect, not a defect.

def lab_l(bgr):
    return cv2.cvtColor(np.clip(bgr,0,255).astype(np.uint8), cv2.COLOR_BGR2LAB)[...,0].astype(np.float32)*100/255

def render(spec_file, n, air, gr=True):
    a = ['python3','tools/atmos.py',spec_file,'--only',str(n)] + ([] if air else ['--no-air']) + ([] if gr else ['--no-grade'])
    r = subprocess.run(a, capture_output=True)
    if r.returncode != 0:
        raise SystemExit('atmos.py failed on %s frame %d:\n%s' % (spec_file, n, r.stderr.decode()[-800:]))
    return np.frombuffer(r.stdout[-1080*1920*3:], np.uint8).reshape(1920,1080,3).astype(np.float32)

rows, bad = [], []
for sid in sorted(D):
    rp = os.path.join(recdir, '%s.json' % sid)
    if not os.path.exists(rp):
        rows.append((sid, None)); continue
    rec = json.load(open(rp))
    spec_file = os.path.join('out','_work',film,'atmos','%s.json' % sid)
    if not os.path.exists(spec_file):
        spec_file = '/tmp/_atmos_%s.json' % sid
        json.dump(rec['spec'], open(spec_file,'w'))
    N = rec['frames']
    H, W = 1920, 1080
    P = np.zeros((H,W), np.float32)
    for cx,cy,rx,ry in D[sid].get('protect', []):
        cv2.ellipse(P,(int(cx*W),int(cy*H)),(max(2,int(rx*W)),max(2,int(ry*H))),0,0,360,1.0,-1)
    P = np.clip(cv2.GaussianBlur(P,(0,0),46),0,1)
    core_m, core_x, edge_m, open_m, grade_m = [], [], [], [], []
    for n in (0, N//2, N-1):
        noair  = lab_l(render(spec_file, n, False))
        dl     = lab_l(render(spec_file, n, True)) - noair
        # The pass carries its own grade, and gradecheck cannot see it: that tool pushes
        # the locked albedo through lib/grade.js analytically, and this grade is baked
        # into the clip before it ever gets there. So measure it here, against the same
        # frame ungraded - otherwise nothing in the repo measures it at all.
        dg     = noair - lab_l(render(spec_file, n, False, gr=False))
        # the protection travels with the camera, so measure it where it ends up
        z = rec['spec']['zoom_from'] + (rec['spec']['zoom_to']-rec['spec']['zoom_from'])*(n/max(N*rec['spec'].get('hold',0.82),1))
        z = min(z, rec['spec']['zoom_to'])
        ax, ay = rec['spec']['anchor'][0]*W, rec['spec']['anchor'][1]*H
        M = np.array([[z,0,(1-z)*ax],[0,z,(1-z)*ay]], np.float32)
        Pw = cv2.warpAffine(P, M, (W,H), borderMode=cv2.BORDER_REPLICATE) if rec['source_kind']=='still' else P
        skin, edge, opn = Pw > 0.9, (Pw > 0.6) & (Pw <= 0.9), Pw < 0.1
        if skin.any():
            core_m.append(float(dl[skin].mean())); core_x.append(float(np.percentile(dl[skin],99)))
        if edge.any(): edge_m.append(float(dl[edge].mean()))
        if opn.any(): open_m.append(float(dl[opn].mean()))
        if skin.any(): grade_m.append(float(dg[skin].mean()))
    r = (sid, max(core_m) if core_m else 0.0, max(core_x) if core_x else 0.0,
         float(np.mean(edge_m)) if edge_m else 0.0,
         float(np.mean(open_m)) if open_m else 0.0,
         max(grade_m) if grade_m else 0.0, rec['spec']['parallax_kind'], rec['spec']['lit'])
    rows.append((sid, r))
    if r[1] > FAIL_SKIN or r[5] > FAIL_SKIN: bad.append(sid)

print('\nATMOSPHERE VERIFY %s   neither the air NOR the grade may brighten skin (mean dL* <= %+.2f)\n' % (film, FAIL_SKIN))
print('  shot     air>skin    air>edge    air>open    GRADE>skin   parallax  lit')
for sid, r in rows:
    if r is None: print('  %-7s  not rendered' % sid); continue
    print('  %-7s  %+8.2f   %+9.2f   %+9.2f   %+10.2f   %-8s  %s  %s'
          % (sid, r[1], r[3], r[4], r[5], r[6], r[7],
             'FAIL' if (r[1] > FAIL_SKIN or r[5] > FAIL_SKIN) else ''))
print('\n  %s\n' % ('FAILED on ' + ', '.join(bad) if bad else 'all shots pass - the air is in the room and not on anyone'))
sys.exit(1 if bad else 0)

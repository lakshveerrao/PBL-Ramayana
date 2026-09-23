import cv2, numpy as np, sys, math
# atmos.py <still> <protect> <mode:plain|atmos|parallax> <frames> <matte>  -> raw bgr24 on stdout
still, protp, mode, N, mattep = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
W, H = 1080, 1920
img = cv2.imread(still).astype(np.float32)
prot = cv2.imread(protp, 0).astype(np.float32)/255.0      # 1 = skin, keep the air off it
matte = cv2.imread(mattep, 0).astype(np.float32)/255.0    # 1 = near plane, for parallax only

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
nx, ny = xx/W, yy/H
def smoothstep(t): return t*t*(3.0-2.0*t)

def field(cy, cx, seed): return np.random.default_rng(seed).random((cy, cx)).astype(np.float32)
F = [ (field(12, 7, 11), 12, 7, ( 0.42,-0.24), 0.55),
      (field(26,15, 22), 26,15, ( 0.78,-0.44), 0.30),
      (field(52,30, 33), 52,30, ( 1.40,-0.80), 0.15) ]
def haze_at(t):
    o = np.zeros((H,W), np.float32)
    for f, cy, cx, (vx,vy), a in F:
        o += a*cv2.remap(f, (nx*cx+vx*t).astype(np.float32), (ny*cy+vy*t).astype(np.float32),
                         cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
    return np.clip((o-0.34)/0.50, 0, 1)

# raking bars out of the high lattice at frame-left, travelling down and right
A = math.radians(31.0)
perp = (-xx*math.sin(A) + yy*math.cos(A))/W
reach = np.clip(1.0 - (nx*0.50 + ny*0.46), 0, 1)**1.15     # fades as the light crosses the room
def shaft_at(t):
    bars = 0.5 + 0.5*np.cos(2*math.pi*(perp*4.3 + 0.010*t))
    return (bars**3.0)*reach

rng = np.random.default_rng(5); M = 260
mp = np.stack([rng.random(M)*1.0, rng.random(M)*1.0],1)
mv = np.stack([rng.normal(0.0060,0.0026,M), rng.normal(0.0042,0.0020,M)],1)
msz = rng.random(M)*0.7+0.3
def motes_at(t):
    p = np.mod(mp + mv*t, 1.0)
    c = np.zeros((H,W), np.float32)
    px = (p[:,0]*W).astype(np.int32); py = (p[:,1]*H).astype(np.int32)
    ok = (px>2)&(px<W-3)&(py>2)&(py<H-3)
    np.add.at(c,(py[ok],px[ok]),msz[ok])
    return cv2.GaussianBlur(c,(0,0),2.4)*4.0

ANCH = (0.36*W, 0.33*H)
def zoom(im, z):
    Mx = np.array([[z,0,(1-z)*ANCH[0]],[0,z,(1-z)*ANCH[1]]], np.float32)
    return cv2.warpAffine(im, Mx, (W,H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def grade(x):
    x = x/255.0
    s = np.clip(1.0 - x.mean(axis=2,keepdims=True)*2.2, 0, 1)
    x = x + np.array([0.010,0.018,0.030], np.float32)*s          # warm lift, shadows only
    x = np.where(x > 0.78, 0.78 + (x-0.78)*0.72, x)              # highlights DOWN, never up
    return np.clip(x,0,1)*255.0

warm = np.array([0.58,0.84,1.00], np.float32)                    # BGR

def snyder(x):
    """A 300-leaning grade: bleach bypass, crushed blacks, ochre highlights, low sat."""
    x = x/255.0
    L = (x*np.array([0.0722,0.7152,0.2126],np.float32)).sum(2, keepdims=True)
    x = L*(1.0-0.30) + x*0.30                                     # desaturate
    x = np.where(L < 0.5, 2*x*L, 1.0 - 2*(1.0-x)*(1.0-L))         # bleach bypass overlay
    x = np.clip((x - 0.085)/0.915, 0, 1)**1.28                    # crush the blacks
    h = np.clip((L - 0.42)/0.58, 0, 1)
    x = x + h*np.array([-0.045, 0.020, 0.085], np.float32)        # ochre into the highlights
    return np.clip(x,0,1)*255.0
out = sys.stdout.buffer
for i in range(N):
    t = i/30.0
    p = smoothstep(min(i/(N*0.82), 1.0))                         # the ramp: move, then settle
    if mode == 'snyder':
        zf = 1.0 + 0.052*p
        base = zoom(img, zf)
        keep = np.clip(1.0 - 0.92*np.clip(zoom(prot, zf),0,1), 0, 1)
        hz, sh, mo = haze_at(t), shaft_at(t), motes_at(t)
        vol = sh*(0.30 + 0.70*hz)
        air = (vol*74.0 + hz*reach*17.0 + mo*vol*120.0)*keep
        out.write(np.ascontiguousarray(np.clip(snyder(base + air[...,None]*warm),0,255).astype(np.uint8))); continue
    if mode == 'plain':
        out.write(np.ascontiguousarray(img.astype(np.uint8))); continue
    zf = 1.0 + 0.052*p
    if mode == 'parallax':
        zb = 1.0 + 0.094*p
        mv_ = np.clip(zoom(matte, zf),0,1)[...,None]
        base = zoom(img, zb)*(1.0-mv_) + zoom(img, zf)*mv_
    else:
        base = zoom(img, zf)
    keep = np.clip(1.0 - 0.92*np.clip(zoom(prot, zf),0,1), 0, 1) # the air goes everywhere but skin
    hz, sh, mo = haze_at(t), shaft_at(t), motes_at(t)
    vol = sh*(0.30 + 0.70*hz)
    air = (vol*74.0 + hz*reach*17.0 + mo*vol*120.0)*keep
    out.write(np.ascontiguousarray(np.clip(grade(base + air[...,None]*warm),0,255).astype(np.uint8)))

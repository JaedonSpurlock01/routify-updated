#!/usr/bin/env python3
"""Builds every Routify master logo SVG from geometry. Run: python3 brand/source/build.py"""
import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "logo")

INK, MINT, RED = "#0D0D0D", "#E1FAF2", "#FF5454"

def f(x):
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def rounded_poly(pts, radii):
    """Closed polygon with a circular fillet of radii[i] at vertex i (clockwise on screen)."""
    n, segs = len(pts), []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        v1 = (p0[0] - p1[0], p0[1] - p1[1]); v2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        u1 = (v1[0] / l1, v1[1] / l1); u2 = (v2[0] / l2, v2[1] / l2)
        ang = math.acos(max(-1, min(1, u1[0] * u2[0] + u1[1] * u2[1])))
        t = radii[i] / math.tan(ang / 2)
        a = (p1[0] + u1[0] * t, p1[1] + u1[1] * t); b = (p1[0] + u2[0] * t, p1[1] + u2[1] * t)
        sweep = 1 if u1[0] * u2[1] - u1[1] * u2[0] < 0 else 0
        segs.append((a, b, radii[i], sweep))
    d = f"M{f(segs[0][1][0])} {f(segs[0][1][1])}"
    for i in list(range(1, n)) + [0]:
        a, b, r, sw = segs[i]
        d += f"L{f(a[0])} {f(a[1])}A{f(r)} {f(r)} 0 0 {sw} {f(b[0])} {f(b[1])}"
    return d + "Z"

def circle(cx, cy, r, ccw=False):
    s = 0 if ccw else 1
    return f"M{f(cx - r)} {f(cy)}A{f(r)} {f(r)} 0 1 {s} {f(cx + r)} {f(cy)}A{f(r)} {f(r)} 0 1 {s} {f(cx - r)} {f(cy)}Z"

# ── Symbol: three city blocks; the streets between them are the route ─────────
# 256 grid, tile 24..232. Route centreline: down x=152 to y=104, 45° to (112,144), down x=112.
# Cross street: y=144 from the left edge to the route. Destination node in the right block.
DOT = (196, 66)

def blocks(street=22, outer=44, inner=6, dot_r=17):
    lo, hi, h = 24, 232, street / 2
    xv, yb, xb, yh = 152, 104, 112, 144
    up, dn = xv + yb - h * math.sqrt(2), xv + yb + h * math.sqrt(2)   # x+y of the diagonal street's edges
    tl = [(lo, lo), (xv - h, lo), (xv - h, up - (xv - h)), (up - (yh - h), yh - h), (lo, yh - h)]
    bl = [(lo, yh + h), (xb - h, yh + h), (xb - h, hi), (lo, hi)]
    rr = [(xv + h, lo), (hi, lo), (hi, hi), (xb + h, hi), (xb + h, dn - (xb + h)), (xv + h, dn - (xv + h))]
    d = (rounded_poly(tl, [outer, inner, inner, inner, inner])
         + rounded_poly(bl, [inner, inner, inner, outer])
         + rounded_poly(rr, [inner, outer, outer, inner, inner, inner])
         + circle(*DOT, dot_r, ccw=True))
    return d, dot_r

def symbol_body(ink, dot=None, **kw):
    d, r = blocks(**kw)
    body = f'<path fill="{ink}" fill-rule="evenodd" d="{d}"/>'
    if dot:
        body += f'<circle fill="{dot}" cx="{DOT[0]}" cy="{DOT[1]}" r="{r}"/>'
    return body

# ── Wordmark: monoline lowercase built from round-capped road lines (outlined) ─
S = 20  # stroke weight

def capsule(x1, y1, x2, y2, w=S):
    dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy); nx, ny = -dy / L * w / 2, dx / L * w / 2
    pts = [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)]
    area = sum(pts[i][0] * pts[(i + 1) % 4][1] - pts[(i + 1) % 4][0] * pts[i][1] for i in range(4))
    if area < 0: pts.reverse()
    d = "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"
    return d + circle(x1, y1, w / 2) + circle(x2, y2, w / 2)

def arc(cx, cy, r, a0, a1, w=S):
    """Band along a circle from angle a0 to a1 (degrees, screen coords, a0 < a1) with round ends."""
    R, ri = r + w / 2, r - w / 2
    p = lambda rad, a: (cx + rad * math.cos(math.radians(a)), cy + rad * math.sin(math.radians(a)))
    large = 1 if a1 - a0 > 180 else 0
    o0, o1, i1, i0 = p(R, a0), p(R, a1), p(ri, a1), p(ri, a0)
    d = (f"M{f(o0[0])} {f(o0[1])}A{f(R)} {f(R)} 0 {large} 1 {f(o1[0])} {f(o1[1])}"
         f"L{f(i1[0])} {f(i1[1])}A{f(ri)} {f(ri)} 0 {large} 0 {f(i0[0])} {f(i0[1])}Z")
    e0, e1 = p(r, a0), p(r, a1)
    return d + circle(*e0, w / 2) + circle(*e1, w / 2)

def ring(cx, cy, r, w=S):
    return circle(cx, cy, r + w / 2) + circle(cx, cy, r - w / 2, ccw=True)

WM_W = 616                     # wordmark box 616×256; baseline 176, x-height 88, descender to 240
TITTLE = (396, 56, 14)

def wordmark_d():
    d = ""
    x = 20;  d += capsule(x, 166, x, 98) + arc(x + 34, 132, 34, 180, 270) + capsule(x + 34, 98, x + 46, 98)      # r
    d += ring(128, 132, 35)                                                                                      # o
    x = 208; d += capsule(x, 98, x, 132) + arc(x + 34, 132, 34, 0, 180) + capsule(x + 68, 98, x + 68, 166)      # u
    x = 320; d += (capsule(x, 62, x, 140) + arc(x + 26, 140, 26, 90, 180) + capsule(x + 26, 166, x + 34, 166)
                   + capsule(x - 18, 98, x + 30, 98))                                                            # t
    x = 396; d += capsule(x, 98, x, 166)                                                                          # i
    x = 454; d += (capsule(x, 166, x, 76) + arc(x + 30, 76, 30, 180, 270) + capsule(x + 30, 46, x + 38, 46)
                   + capsule(x - 16, 98, x + 30, 98))                                                            # f
    x = 528; d += (capsule(x, 98, x, 132) + arc(x + 34, 132, 34, 0, 180) + capsule(x + 68, 98, x + 68, 196)
                   + arc(x + 34, 196, 34, 0, 90) + capsule(x + 34, 230, x + 20, 230))                           # y
    return d

def wordmark_body(ink, dot):
    return (f'<path fill="{ink}" d="{wordmark_d()}"/>'
            f'<circle fill="{dot}" cx="{TITTLE[0]}" cy="{TITTLE[1]}" r="{TITTLE[2]}"/>')

# ── Files ─────────────────────────────────────────────────────────────────────
def svg(body, title, w=256, h=256, vb=None):
    vb = vb or f"0 0 {w} {h}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" '
            f'aria-labelledby="title"><title id="title">{title}</title>{body}</svg>\n')

def save(name, s):
    open(os.path.join(OUT, name), "w").write(s)

def horizontal(sym, wm):
    # Symbol 0.7 scale: tile spans y 36..182 (cap of f to baseline), 40-unit gap to the wordmark.
    k = 0.7; ty = 36 - 24 * k; tx = -24 * k
    wx = 232 * k + tx + 44 - 10
    w = round(wx + WM_W)
    body = f'<g transform="translate({f(tx)} {f(ty)}) scale({k})">{sym}</g><g transform="translate({f(wx)} 0)">{wm}</g>'
    return body, w

def stacked(sym, wm):
    # Symbol 208 tall on top, wordmark at 0.62 scale centred below.
    k = 0.62; W = 400; sx = (W - 208) / 2 - 24
    wm_w = (WM_W - 10) * k; wx = (W - wm_w) / 2 - 10 * k
    body = (f'<g transform="translate({f(sx)} 0)">{sym}</g>'
            f'<g transform="translate({f(wx)} {f(232 - 36 * k + 28)}) scale({k})">{wm}</g>')
    return body, W, round(232 + 28 + (240 - 36) * k + 24)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    T = "Routify logo"
    sets = {
        "":          dict(sym=symbol_body(INK, RED), wm=wordmark_body(INK, RED)),
        "-reversed": dict(sym=symbol_body(MINT, RED, street=24), wm=wordmark_body(MINT, RED)),
        "-black":    dict(sym=symbol_body(INK), wm=wordmark_body(INK, INK)),
        "-white":    dict(sym=symbol_body("#FFFFFF", street=24), wm=wordmark_body("#FFFFFF", "#FFFFFF")),
    }
    for suf, s in sets.items():
        save(f"routify-symbol{suf}.svg", svg(s["sym"], T))
        save(f"routify-wordmark{suf}.svg", svg(s["wm"], T, w=WM_W, h=256))
        b, w = horizontal(s["sym"], s["wm"]); save(f"routify-horizontal{suf}.svg", svg(b, T, w=w, h=256))
        b, w, h = stacked(s["sym"], s["wm"]); save(f"routify-stacked{suf}.svg", svg(b, T, w=w, h=h))
    # Small-size cut for ≤32 px: wider streets, bigger node, softer corners.
    small = dict(street=32, outer=48, inner=8, dot_r=22)
    save("routify-symbol-small.svg", svg(symbol_body(INK, RED, **small), T))
    save("routify-symbol-small-black.svg", svg(symbol_body(INK, **small), T))
    save("routify-symbol-small-reversed.svg", svg(symbol_body(MINT, RED, **small), T))
    print("wrote", len(os.listdir(OUT)), "files to", os.path.normpath(OUT))

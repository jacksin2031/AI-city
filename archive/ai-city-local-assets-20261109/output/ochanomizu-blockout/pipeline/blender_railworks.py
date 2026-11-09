"""Railway works along the JR corridor:
  * overhead-line portal gantries spanning all parallel at-grade JR tracks (every ~45 m, 推定 spacing)
  * stone retaining wall with arched niches where the track shelf drops to the Kanda river
    (Wikimedia photo "Ochanomizu Station Metro-Chuo Line crossing from Hijiri Bridge": stone wall with a row of
    arched recesses below the JR tracks). Niche size / rhythm read from the photo (推定).
"""
import bmesh, math
from mathutils import Vector


def _resample(pts, step):
    out = [Vector(pts[0])]
    acc = 0.0
    for i in range(1, len(pts)):
        a, b = Vector(pts[i - 1]), Vector(pts[i])
        seg = (b - a); L = seg.xy.length
        t = step - acc
        while t <= L:
            out.append(a + seg * (t / L)); t += step
        acc = (acc + L) % step
    return out


def _near_poly(x, y, ring, pad):
    ins = False; n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: ins = not ins
        ex, ey = x2 - x1, y2 - y1; L2 = ex * ex + ey * ey or 1e-9
        t = max(0.0, min(1.0, ((x - x1) * ex + (y - y1) * ey) / L2))
        if math.dist((x, y), (x1 + ex * t, y1 + ey * t)) < pad: return True
    return ins


def build(D, tz, new_obj, mat, srgb, box_seg, pillar, water_z):
    plats = [p for p in D.get("platforms", []) if not p["underground"]]
    jr = [r for r in D["rails"] if r["cls"] == "rail" and not r["tunnel"] and not r["bridge"] and len(r["pts"]) > 1]
    allp = [Vector(p) for r in jr for p in r["pts"]]

    # ---------------- gantries
    bm = bmesh.new(); spots = []
    GANTRIES = False          # overhead-line gantries removed at the user's request (2026-11-01)
    for r in (sorted(jr, key=lambda r: -len(r["pts"])) if GANTRIES else []):
        sm = _resample(r["pts"], 45.0)
        for i in range(1, len(sm)):
            c = sm[i]; d = (sm[i] - sm[i - 1]); d.z = 0
            if d.length < 1e-3: continue
            d.normalize(); n = Vector((-d.y, d.x, 0))
            if any((c.xy - s).length < 30 for s in spots): continue
            near = [p for p in allp if abs((p - c).dot(d)) < 4 and abs((p - c).dot(n)) < 22 and abs(p.z - c.z) < 2.5]
            offs = [(p - c).dot(n) for p in near]
            if not offs: continue
            lo, hi = min(offs) - 2.6, max(offs) + 2.6
            zr = max(p.z for p in near)
            spots.append(c.xy.copy())
            for o in (lo, hi):
                q = c + n * o
                pillar(bm, q.x, q.y, min(zr, tz(q.x, q.y)) - 0.5, zr + 7.6, 0.45, 0.45, math.atan2(d.y, d.x), 0)
            a = c + n * lo; b = c + n * hi
            a.z = b.z = zr + 7.0
            box_seg(bm, a, b, 0.35, 0.6, 0)                    # cross beam (lattice look via material)
            for o in offs:                                     # droppers over each track
                q = c + n * o; q.z = zr + 6.2
                box_seg(bm, q, q + d * 0.01, 0.08, 0.8, 0)
    new_obj("Rail_OverheadGantries", bm, "05_Rail_JR", [mat("WB_Mast", srgb("#8F9192"))])

    # ---------------- stone retaining wall with arched niches
    bm = bmesh.new()
    for r in jr:
        sm = _resample(r["pts"], 2.5)
        for i in range(1, len(sm)):
            a, b = sm[i - 1], sm[i]
            d = (b - a); d.z = 0
            if d.length < 1e-3: continue
            d.normalize(); n = Vector((-d.y, d.x, 0))
            m = (a + b) / 2
            for sgn in (-1, 1):
                probe = m + n * sgn * 7.0
                drop = m.z - tz(probe.x, probe.y)
                inner = m + n * sgn * 2.0                       # another track right beside -> not an edge
                if drop < 4.5 or any((p.xy - (m + n * sgn * 4.0).xy).length < 1.6 for p in allp): continue
                q_ = m + n * sgn * 3.3
                if any(_near_poly(q_.x, q_.y, pf["poly"], 1.5) for pf in plats): continue   # platform side: no wall
                # 3 m thick (1.8-4.8 m off the track): the 2 m terrain grid's slope transition stays inside it
                w0 = a + n * sgn * 3.3; w1 = b + n * sgn * 3.3
                zb = max(water_z + 1.0, min(tz((w0 + n * sgn * 3).x, (w0 + n * sgn * 3).y), m.z - 3.0) - 0.5)
                top = m.z - 0.35
                w0.z = w1.z = zb
                box_seg(bm, w0, w1, 3.0, top - zb, 0, z0=zb)            # wall body (stone)
                q0 = w0.copy(); q1 = w1.copy(); q0.z = q1.z = top
                box_seg(bm, q0 + n * sgn * 1.4, q1 + n * sgn * 1.4, 0.4, 0.3, 2)   # coping on the river edge
                # arched niche every 5 m: dark recess panel just proud of the wall face
                s_idx = int(((m - sm[0]).xy.length) / 2.5)
                if s_idx % 2 == 0 and top - zb > 3.5:
                    face = m + n * sgn * (3.3 + 1.52)
                    nh = min(4.2, (top - zb) - 1.2); z0 = zb + 0.6
                    rad = 0.9
                    p0 = face - d * rad; p1 = face + d * rad
                    p0.z = p1.z = z0
                    box_seg(bm, p0, p1, 0.04, nh - rad, 1, z0=z0)
                    for j in range(6):                          # semicircular head
                        t0 = math.pi * j / 6; t1 = math.pi * (j + 1) / 6
                        h0 = z0 + nh - rad + rad * math.sin(t0); h1 = z0 + nh - rad + rad * math.sin(t1)
                        e0 = face - d * (rad * math.cos(t0)); e1 = face - d * (rad * math.cos(t1))
                        e0.z = z0 + nh - rad; e1.z = e0.z
                        box_seg(bm, e0, e1, 0.04, (h0 + h1) / 2 - e0.z, 1, z0=e0.z)
    new_obj("Rail_StoneWall_Niches", bm, "02_RetainingWalls",
            [mat("WB_Wall", srgb("#9C978E")), mat("WB_NicheDark", srgb("#4E4A44")), mat("WB_Kerb", srgb("#B9B4AA"))])
    return len(spots)

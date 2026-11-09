"""Animated-ready vehicles: three common Japanese car types and the three train types seen at 御茶ノ水.

Trains (colours from the operators' line colours, dimensions from public specs, details simplified / 推定):
  E233系0番台  中央線快速   stainless + orange vermilion band, 20 m x 2.95 m, 10 cars, single-arm pantographs
  E231系       中央・総武緩行線 stainless + canary-yellow band, 20 m x 2.95 m, 10 cars
  2000系       丸ノ内線      red body, white belt with silver sine wave, 18 m x 2.78 m, 6 cars, third rail (no pantograph)
Cars (generic shapes of the most common types on Tokyo streets, no badges or plate text):
  taxi    Japan-taxi type tall hatch, 濃藍 (deep indigo), roof lamp      4.40 x 1.70 x 1.75 m
  kei     kei tall wagon, pearl white, yellow (kei) plates              3.40 x 1.48 x 1.79 m
  minivan large minivan, black, chrome grille                          4.95 x 1.85 x 1.95 m

Animation rig: every path is a 3D POLY curve (13_Vehicle_Paths). Every car body / train car has a Follow Path
constraint (fixed position, follow curve). Its offset is driven by the custom property "s" (metres along the
path) of one controller empty per vehicle, so animating "s" moves the whole train. Japan drives on the left.
"""
import bpy, bmesh, math, json, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

import vehicle_paths as VP

TRAIN_GAP = 0.6            # coupler gap between cars (m)


# ------------------------------------------------------------------ geometry helpers (origin = rail top / road, +X forward)
def _faces(bm, vs, mi):
    try: bm.faces.new(vs).material_index = mi
    except ValueError: pass


def prism_x(bm, prof, x0, x1, mi, cap_mi=None):
    """extrude a (y, z) cross-section along X"""
    a = [bm.verts.new((x0, y, z)) for y, z in prof]; b = [bm.verts.new((x1, y, z)) for y, z in prof]
    n = len(prof)
    for i in range(n): _faces(bm, [a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]], mi)
    _faces(bm, a[::-1], mi if cap_mi is None else cap_mi); _faces(bm, b, mi if cap_mi is None else cap_mi)


def prism_y(bm, prof, y0, y1, mi):
    """extrude an (x, z) side profile across Y"""
    a = [bm.verts.new((x, y0, z)) for x, z in prof]; b = [bm.verts.new((x, y1, z)) for x, z in prof]
    n = len(prof)
    for i in range(n): _faces(bm, [a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]], mi)
    _faces(bm, a[::-1], mi); _faces(bm, b, mi)


def box(bm, x0, x1, y0, y1, z0, z1, mi):
    prism_x(bm, [(y0, z0), (y1, z0), (y1, z1), (y0, z1)], x0, x1, mi)


def cyl_y(bm, cx, cz, r, y0, y1, mi, n=12):
    prism_y(bm, [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)], y0, y1, mi)


def bar(bm, p0, p1, t, mi):
    """square bar of thickness t between two 3D points"""
    p0, p1 = Vector(p0), Vector(p1); d = (p1 - p0).normalized()
    u = d.cross(Vector((0, 0, 1))) if abs(d.z) < 0.95 else d.cross(Vector((1, 0, 0)))
    u.normalize(); v = d.cross(u).normalized()
    ring = [(u * sx + v * sy) * t / 2 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    a = [bm.verts.new(p0 + o) for o in ring]; b = [bm.verts.new(p1 + o) for o in ring]
    for i in range(4): _faces(bm, [a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]], mi)
    _faces(bm, a[::-1], mi); _faces(bm, b, mi)


def strip_xz(bm, xs, zc, half, y, mi):
    """thin wavy strip on a car side (normal ±Y): centre z = zc(x)"""
    top = [bm.verts.new((x, y, zc(x) + half)) for x in xs]; bot = [bm.verts.new((x, y, zc(x) - half)) for x in xs]
    for i in range(len(xs) - 1):
        f = [bot[i], bot[i + 1], top[i + 1], top[i]]
        _faces(bm, f if y > 0 else f[::-1], mi)


def to_mesh(name, bm, mats, mirror=False):
    if mirror:
        for v in bm.verts: v.co.x = -v.co.x
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = False
    return me


# ------------------------------------------------------------------ materials
def materials(mat, srgb):
    def m(name, hexc, rough=0.5, metal=0.0, emit=None):
        mm = mat(name, srgb(hexc), rough=rough, metal=metal)
        if emit:
            p = next(n for n in mm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            for key in ("Emission Color", "Emission"):
                if key in p.inputs: p.inputs[key].default_value = (*srgb(emit[0]), 1); break
            if "Emission Strength" in p.inputs: p.inputs["Emission Strength"].default_value = emit[1]
        return mm
    return {
        "stainless": m("VH_Stainless", "#C4C9CE", 0.32, 0.75), "door": m("VH_StainlessDoor", "#B3B8BD", 0.38, 0.7),
        "orange": m("VH_JR_ChuoOrange", "#F15A22", 0.45), "yellow": m("VH_JR_SobuYellow", "#FFD400", 0.45),
        "red": m("VH_Metro_MarunouchiRed", "#E3242B", 0.4, 0.1), "white": m("VH_White", "#F3F2EE", 0.45),
        "silver": m("VH_Silver", "#C9CCCF", 0.25, 0.85), "glass": m("VH_Glass", "#1B2128", 0.08, 0.3),
        "black": m("VH_Black", "#1C1D20", 0.6), "under": m("VH_Underfloor", "#3E4246", 0.7),
        "roof": m("VH_Roof", "#8C9196", 0.6, 0.2), "rubber": m("VH_Tyre", "#17181A", 0.9),
        "head": m("VH_Headlight", "#FFF6E0", 0.2, 0.0, ("#FFF2D6", 6.0)), "tail": m("VH_Taillight", "#B3121B", 0.3, 0.0, ("#FF2A22", 2.0)),
        "taxi": m("VH_Taxi_DeepIndigo", "#1F2C47", 0.28, 0.45), "kei": m("VH_Kei_PearlWhite", "#F1F0EB", 0.3, 0.15),
        "van": m("VH_Minivan_Black", "#111215", 0.22, 0.55), "chrome": m("VH_Chrome", "#C8CCD0", 0.15, 1.0),
        "plate_w": m("VH_Plate_White", "#EEEDE6", 0.5), "plate_y": m("VH_Plate_KeiYellow", "#F0CF3A", 0.5),
        "lamp": m("VH_TaxiRoofLamp", "#F4EFE1", 0.4, 0.0, ("#FFF0C8", 1.5)),
    }


# ------------------------------------------------------------------ trains
TRAINS = {
    # line, length, width, body, band(s), doors (centres from the car middle), windscreen front colour, nose rake
    "E233_chuo_rapid": dict(L=20.0, W=2.95, cars=10, body="stainless", door="door", band="orange",
                            bands=[(1.62, 1.86), (3.08, 3.18)], doors=(-7.12, -2.37, 2.37, 7.12), door_w=1.3,
                            rake=0.55, front_band=(1.45, 1.98), panto=(1, 3, 6, 8), roof_top=3.62),
    "E231_sobu_local": dict(L=20.0, W=2.95, cars=10, body="stainless", door="door", band="yellow",
                            bands=[(1.66, 1.88)], doors=(-7.12, -2.37, 2.37, 7.12), door_w=1.3,
                            rake=0.25, front_band=(1.50, 1.95), panto=(1, 4, 7), roof_top=3.62),
    "2000_marunouchi": dict(L=18.0, W=2.78, cars=6, body="red", door="red", band="white",
                            bands=[(1.70, 1.86)], doors=(-5.9, 0.0, 5.9), door_w=1.3,
                            rake=0.75, front_band=None, panto=(), roof_top=3.50, sine=True),
}
FLOOR = 1.0


def train_car(name, S, M, kind):
    """kind: 'cab' (driving end at +X), 'mid', 'mid_panto'"""
    bm = bmesh.new()
    L, W, top = S["L"], S["W"], S["roof_top"]
    h = W / 2
    mats = ["body", "door", "band", "glass", "black", "under", "roof", "head", "tail", "silver", "rubber"]
    I = {k: i for i, k in enumerate(mats)}
    sec = [(-h, FLOOR), (h, FLOOR), (h, top - 0.3), (h - 0.28, top - 0.08), (h - 0.9, top), (-h + 0.9, top),
           (-h + 0.28, top - 0.08), (-h, top - 0.3)]
    x0 = -L / 2 + 0.05
    x1 = L / 2 - 0.05 if kind != "cab" else L / 2 - 1.2
    prism_x(bm, sec, x0, x1, I["body"])
    if kind == "cab":                                   # nose: raked front (side profile), windscreen, headlights
        xa, xf = x1, L / 2
        r = S["rake"]
        prof = [(xa, FLOOR - 0.15), (xf, FLOOR - 0.15), (xf, 2.0), (xf - r, top - 0.12), (xa, top)]
        prism_y(bm, prof, -h + 0.02, h - 0.02, I["body"])
        fx = lambda z: xf if z <= 2.0 else xf - r * (z - 2.0) / (top - 0.12 - 2.0)
        z0, z1 = 2.08, top - 0.32
        ws = [(fx(z0) - 0.2, z0), (fx(z0) + 0.03, z0), (fx(z1) + 0.03, z1), (fx(z1) - 0.2, z1)]
        prism_y(bm, ws, -h + 0.18, h - 0.18, I["glass"])
        if S["front_band"]:
            fb0, fb1 = S["front_band"]
            box(bm, xf - 0.05, xf + 0.035, -h + 0.04, h - 0.04, fb0, fb1, I["band"])
        else:                                           # 2000系: dark lower mask around the lights
            box(bm, xf - 0.05, xf + 0.03, -h + 0.25, h - 0.25, 1.45, 1.95, I["black"])
        for s in (-1, 1):
            yc = s * (h - 0.42)
            box(bm, xf + 0.03, xf + 0.06, yc - 0.2, yc + 0.2, 1.58, 1.78, I["head"])
            box(bm, xf + 0.03, xf + 0.06, yc - 0.32 * s - 0.06, yc - 0.32 * s + 0.06, 1.58, 1.78, I["tail"])
        box(bm, xf - 0.9, xf + 0.1, -1.15, 1.15, 0.38, FLOOR - 0.1, I["black"])       # skirt / snowplough
        box(bm, xf - 0.3, xf + 0.25, -0.18, 0.18, 0.75, 0.95, I["under"])            # coupler
        for s in (-1, 1):                                                                # cab side window
            box(bm, xa - 0.9, xa + 0.2, s * h, s * (h + 0.02), 1.95, 2.85, I["glass"])
    # gangway bellows at inner ends
    for xe, se in ((x0, -1), (x1, 1)) if kind != "cab" else ((x0, -1),):
        box(bm, xe - (0.12 if se < 0 else 0), xe + (0.12 if se > 0 else 0), -0.62, 0.62, FLOOR + 0.1, 3.05, I["black"])
    # sides: doors, windows, bands
    dw = S["door_w"]; doors = S["doors"]
    edges = [x0 + 0.5] + [v for c in doors for v in (c - dw / 2, c + dw / 2)] + [(x1 - 0.5) if kind != "cab" else (x1 - 1.2)]
    bays = [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]
    for s in (-1, 1):
        y0, y1 = s * h, s * (h + 0.015)
        ya, yb = min(y0, y1), max(y0, y1)
        for c in doors:
            box(bm, c - dw / 2, c + dw / 2, ya, yb, FLOOR + 0.05, 3.0, I["door"])
            for k in (-1, 1):                                             # two leaves, each with a window
                xc = c + k * dw / 4
                box(bm, xc - dw / 4 + 0.12, xc + dw / 4 - 0.12, min(s * (h + 0.015), s * (h + 0.03)), max(s * (h + 0.015), s * (h + 0.03)), 1.98, 2.78, I["glass"])
        yw0, yw1 = sorted((s * h, s * (h + 0.025)))
        for a, b in bays:
            if b - a < 1.0: continue
            n = max(1, round((b - a - 0.4) / 1.6))                       # window panes between doors
            pw = (b - a - 0.4) / n
            for k in range(n):
                box(bm, a + 0.2 + k * pw + 0.07, a + 0.2 + (k + 1) * pw - 0.07, yw0, yw1, 1.98, 2.86, I["glass"])
        yb0, yb1 = sorted((s * h, s * (h + 0.03)))
        for z0, z1 in S["bands"]:
            for a, b in bays:
                if b - a > 0.2: box(bm, a - 0.4, b + 0.4, yb0, yb1, z0, z1, I["band"])
        if S.get("sine"):                                                 # 2000系 silver sine wave on the white belt
            xs = [x0 + 0.3 + 0.2 * k for k in range(int((x1 - x0 - 0.6) / 0.2) + 1)]
            strip_xz(bm, xs, lambda x: 1.78 + 0.045 * math.sin(2 * math.pi * x / 2.4), 0.018, s * (h + 0.035), I["silver"])
    # underfloor, bogies, wheels
    box(bm, -L / 2 + 4.6, L / 2 - 4.6, -h + 0.4, h - 0.4, 0.42, FLOOR, I["under"])
    for bx in (-L / 2 + 3.4, L / 2 - 3.4):
        box(bm, bx - 1.35, bx + 1.35, -0.95, 0.95, 0.30, 0.86, I["black"])
        for ax in (-1.05, 1.05):
            for s in (-1, 1):
                cyl_y(bm, bx + ax, 0.43, 0.43, s * 0.98, s * 1.08, I["rubber"], n=12)
    # roof: AC units, pantographs
    for ac in ((-L / 4, L / 4) if L > 19 else (0.0,)):
        box(bm, ac - 1.5, ac + 1.5, -1.0, 1.0, top - 0.05, top + 0.36, I["roof"])
    if kind == "mid_panto":
        c = L / 2 - 4.2; zt = top
        box(bm, c - 0.7, c + 0.7, -0.75, 0.75, zt, zt + 0.12, I["roof"])
        bar(bm, (c - 0.55, 0, zt + 0.15), (c + 0.55, 0, zt + 0.72), 0.07, I["black"])
        bar(bm, (c + 0.55, 0, zt + 0.72), (c - 0.45, 0, zt + 1.25), 0.05, I["black"])
        bar(bm, (c - 0.45, -0.85, zt + 1.27), (c - 0.45, 0.85, zt + 1.27), 0.07, I["silver"])
    return to_mesh(name, bm, [M[S["body"]], M[S["door"]], M[S["band"]], M["glass"], M["black"], M["under"], M["roof"],
                             M["head"], M["tail"], M["silver"], M["rubber"]])


def train_meshes(key, M):
    S = TRAINS[key]
    out = {"cab": train_car(key + "_cab", S, M, "cab"), "mid": train_car(key + "_mid", S, M, "mid")}
    out["mid_panto"] = train_car(key + "_mid_panto", S, M, "mid_panto") if S["panto"] else out["mid"]
    # rear driving car = cab mirrored (driving end at -X)
    bm = bmesh.new(); bm.from_mesh(out["cab"])
    out["cab_rear"] = to_mesh(key + "_cab_rear", bm, list(out["cab"].materials), mirror=True)
    return out


# ------------------------------------------------------------------ cars
CARS = {
    "taxi": dict(L=4.40, W=1.695, r=0.29, ax=(1.40, -1.35), body="taxi", plate="plate_w", lamp=True,
                 lower=[(-2.20, 0.30), (2.20, 0.30), (2.20, 0.82), (1.80, 0.99), (0.95, 1.06), (-2.16, 1.06), (-2.20, 0.95)],
                 cabin=[(-2.13, 1.06), (0.95, 1.06), (0.25, 1.70), (-2.03, 1.72)], roof=(-2.06, 0.28, 1.70, 1.75)),
    "kei": dict(L=3.395, W=1.475, r=0.28, ax=(1.28, -1.24), body="kei", plate="plate_y", lamp=False,
                lower=[(-1.70, 0.28), (1.70, 0.28), (1.70, 0.80), (1.42, 0.98), (1.05, 1.04), (-1.70, 1.04)],
                cabin=[(-1.68, 1.04), (1.05, 1.04), (0.72, 1.74), (-1.66, 1.76)], roof=(-1.69, 0.74, 1.74, 1.79)),
    "minivan": dict(L=4.95, W=1.85, r=0.36, ax=(1.55, -1.45), body="van", plate="plate_w", lamp=False, grille=True,
                    lower=[(-2.47, 0.32), (2.47, 0.32), (2.47, 0.96), (2.10, 1.10), (1.35, 1.19), (-2.45, 1.19), (-2.47, 1.05)],
                    cabin=[(-2.42, 1.19), (1.35, 1.19), (0.55, 1.88), (-2.35, 1.90)], roof=(-2.39, 0.58, 1.88, 1.95)),
}


def car_mesh(key, M):
    S = CARS[key]; bm = bmesh.new()
    mats = [M[S["body"]], M["glass"], M["rubber"], M["head"], M["tail"], M[S["plate"]], M["chrome"], M["lamp"], M["black"]]
    h = S["W"] / 2; L = S["L"]
    prism_y(bm, S["lower"], -h, h, 0)
    prism_y(bm, S["cabin"], -h + 0.07, h - 0.07, 1)
    rx0, rx1, rz0, rz1 = S["roof"]
    box(bm, rx0, rx1, -h + 0.05, h - 0.05, rz0, rz1, 0)
    cab = S["cabin"]; xb = (cab[0][0] + cab[1][0]) / 2 - 0.1                 # B-pillar
    box(bm, xb - 0.07, xb + 0.07, -h + 0.06, h - 0.06, cab[0][1], rz0 + 0.01, 0)
    box(bm, cab[0][0] + 0.0, cab[0][0] + 0.12, -h + 0.06, h - 0.06, cab[0][1], rz0 + 0.01, 0)   # rear pillar
    for xa in S["ax"]:
        for s in (-1, 1):
            cyl_y(bm, xa, S["r"], S["r"], s * (h - 0.24), s * (h + 0.01), 2, n=12)
    for s in (-1, 1):
        box(bm, L / 2 - 0.02, L / 2 + 0.02, s * (h - 0.42) - 0.18, s * (h - 0.42) + 0.18, S["lower"][2][1] - 0.18, S["lower"][2][1] - 0.04, 3)
        box(bm, -L / 2 - 0.02, -L / 2 + 0.02, s * (h - 0.18) - 0.12, s * (h - 0.18) + 0.12, S["lower"][2][1] - 0.15, S["lower"][2][1] + 0.05, 4)
    for xe in (L / 2, -L / 2):                                         # blank number plates (no text)
        box(bm, xe - 0.015, xe + 0.015, -0.17, 0.17, 0.45, 0.62, 5)
    box(bm, L / 2 - 0.05, L / 2 + 0.03, -h + 0.05, h - 0.05, 0.30, 0.46, 8)          # bumper lip
    if S.get("grille"): box(bm, L / 2 - 0.02, L / 2 + 0.03, -0.62, 0.62, 0.55, 0.93, 6)
    if S.get("lamp"):                                                   # taxi roof lamp (andon), plain
        box(bm, -0.55, -0.15, -0.14, 0.14, rz1, rz1 + 0.17, 7)
    return to_mesh("Car_" + key, bm, mats)


# ------------------------------------------------------------------ paths
def _resample(pts, step):
    out = [list(pts[0])]
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a[:2], b[:2]); n = max(1, int(L / step))
        for k in range(1, n + 1):
            f = k / n
            q = [a[i] + (b[i] - a[i]) * f for i in range(3)] + ([b[3] if f > 0.5 else a[3]] if len(a) > 3 else [])
            out.append(q)
    return out


def _smooth_z(pts, k=2):
    zs = [p[2] for p in pts]
    for i in range(len(pts)):
        w = zs[max(0, i - k): i + k + 1]; pts[i][2] = sum(w) / len(w)
    return pts


def rail_z(pts, tz):
    """same rule as blender_build: at-grade track (and near-surface tunnel) lifted ≤1.5 m to clear the DEM; rail head +0.18"""
    out = []
    for p in pts:
        x, y, z, code = p[0], p[1], p[2], p[3]
        if code == 0 or (code == 2 and z > tz(x, y) - 2.5):
            z = min(z + 1.5, max(z, tz(x, y) + 0.35))
        out.append([x, y, z + 0.18 + 0.02])
    return out


def road_z(pts, tz, bvh):
    out = []
    for p in pts:
        x, y = p[0], p[1]
        z0 = max(p[2], tz(x, y))
        hit = bvh.ray_cast(Vector((x, y, z0 + 4.0)), Vector((0, 0, -1)), 12.0) if bvh else (None,)
        out.append([x, y, (hit[0].z if hit[0] is not None else z0 + 0.16) + 0.01])
    return _smooth_z(out, 1)


def length3(pts):
    return sum((Vector(a) - Vector(b)).length for a, b in zip(pts, pts[1:]))


def nearest_s(pts, xy):
    best, acc, s_best = 1e18, 0.0, 0.0
    for a, b in zip(pts, pts[1:]):
        seg = (Vector(b) - Vector(a)).length
        d = math.dist(a[:2], xy)
        if d < best: best, s_best = d, acc
        acc += seg
    return s_best


def make_curve(name, pts, col):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.twist_mode = "Z_UP"
    cu.use_path = True; cu.path_duration = 1000
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1.0)
    ob = bpy.data.objects.new(name, cu); col.objects.link(ob)
    return ob


def rig(ob, curve, ctrl, k, L3):
    """Follow Path driven by ctrl['s'] (metres): offset = (s - k) / path length"""
    c = ob.constraints.new("FOLLOW_PATH")
    c.target = curve; c.use_curve_follow = True; c.use_fixed_location = True
    c.forward_axis = "FORWARD_X"; c.up_axis = "UP_Z"
    c.offset_factor = min(max((ctrl["s"] - k) / L3, 0.0), 1.0)
    fc = c.driver_add("offset_factor"); d = fc.driver; d.type = "SCRIPTED"
    v = d.variables.new(); v.name = "s"; v.type = "SINGLE_PROP"
    v.targets[0].id = ctrl; v.targets[0].data_path = '["s"]'
    d.expression = "(s - %.3f) / %.3f" % (k, L3)


def controller(name, col, path_ob, s, L3, kind, model, speed):
    e = bpy.data.objects.new(name, None); e.empty_display_type = "ARROWS"; e.empty_display_size = 2.0
    col.objects.link(e)
    e["s"] = float(s); e["path"] = path_ob.name; e["path_length_m"] = round(L3, 3)
    e["kind"] = kind; e["model"] = model; e["speed_kmh"] = speed
    ui = e.id_properties_ui("s"); ui.update(min=0.0, max=L3, soft_min=0.0, soft_max=L3, description="distance along the path (m)")
    e.location = path_ob.data.splines[0].points[0].co.xyz
    return e


# ------------------------------------------------------------------ build
def build(D, tz, sc, mat, srgb, out_json=None):
    for n in ("13_Vehicle_Paths", "14_Vehicles"):
        old = bpy.data.collections.get(n)
        if old:
            for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(old)
    cp = bpy.data.collections.new("13_Vehicle_Paths"); sc.collection.children.link(cp)
    cv = bpy.data.collections.new("14_Vehicles"); sc.collection.children.link(cv)
    ctr = bpy.data.collections.new("14_Vehicle_Controllers"); cv.children.link(ctr)
    M = materials(mat, srgb)

    roads_ob = bpy.data.objects.get("Roads")
    bvh = None
    if roads_ob:
        me = roads_ob.data
        bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    record = {"paths": [], "vehicles": [], "note": "s = metres along path; Japan drives on the left; 推定 shapes"}

    # ---- trains
    rails = VP.rail_paths(D)
    picks = {"rapid": "E233_chuo_rapid", "local": "E231_sobu_local", "marunouchi": "2000_marunouchi"}
    # where to show each train (centre of the train, scene xy): visible stretches near 御茶ノ水 (推定 positions)
    targets = {("rapid", 0): (165, -88), ("rapid", 1): (-125, -2), ("local", 0): (245, -106), ("local", 1): (-5, -32),
               ("marunouchi", 0): (70, -22), ("marunouchi", 1): (-60, 95)}
    seen = {}
    meshes = {}
    for rp in rails:
        fam = rp["fam"]
        if fam not in picks: continue
        idx = seen.get(fam, 0)
        if idx >= 2: continue
        seen[fam] = idx + 1
        key = picks[fam]; S = TRAINS[key]
        if key not in meshes: meshes[key] = train_meshes(key, M)
        pts = rail_z(_resample(rp["pts"], 3.0), tz)
        pname = "Path_Rail_%s_%d" % (fam, idx)
        pob = make_curve(pname, pts, cp)
        L3 = length3(pts)
        pitch = S["L"] + TRAIN_GAP; total = S["cars"] * pitch - TRAIN_GAP
        s_head = min(max(nearest_s(pts, targets[(fam, idx)]) + total / 2, total), L3)
        ctrl = controller("Train_%s_%d" % (key, idx), ctr, pob, s_head, L3, "train", key, 40.0 if fam != "marunouchi" else 35.0)
        for i in range(S["cars"]):
            kind = "cab" if i == 0 else "cab_rear" if i == S["cars"] - 1 else ("mid_panto" if i in S["panto"] else "mid")
            ob = bpy.data.objects.new("Train_%s_%d_car%02d" % (key, idx, i + 1), meshes[key][kind])
            cv.objects.link(ob); ob.parent = None
            rig(ob, pob, ctrl, S["L"] / 2 + i * pitch, L3)
        record["paths"].append(dict(name=pname, kind="rail", line=fam, length=round(L3, 2), osm_ways=rp["ways"],
                                    pts=[[round(v, 2) for v in p] for p in pts]))
        record["vehicles"].append(dict(controller=ctrl.name, model=key, path=pname, s=round(s_head, 2), cars=S["cars"],
                                       car_length=S["L"], gap=TRAIN_GAP))

    # ---- cars (left-hand traffic lanes)
    lanes = VP.road_paths(D)
    order = ["taxi", "kei", "minivan"]
    car_me = {k: car_mesh(k, M) for k in order}
    n = 0
    for li, lp in enumerate(lanes[:16]):
        pts = road_z(_resample(lp["pts"], 2.0), tz, bvh)
        pname = "Path_Road_%02d_%s" % (li, lp["fam"] or "unnamed")
        pob = make_curve(pname, pts, cp)
        L3 = length3(pts)
        record["paths"].append(dict(name=pname, kind="road", road=lp["fam"], length=round(L3, 2),
                                    pts=[[round(v, 2) for v in p] for p in pts]))
        count = 2 if L3 > 400 else 1
        for j in range(count):
            key = order[n % 3]; n += 1
            s = L3 * (0.28 + 0.45 * j) + (li * 17.0) % 40
            ctrl = controller("Car_%s_%02d" % (key, n), ctr, pob, s, L3, "car", key, 30.0)
            ob = bpy.data.objects.new("Car_%s_%02d_body" % (key, n), car_me[key]); cv.objects.link(ob)
            rig(ob, pob, ctrl, 0.0, L3)
            record["vehicles"].append(dict(controller=ctrl.name, model=key, path=pname, s=round(s, 2)))
    cp.hide_render = True
    ctr.hide_render = True
    if out_json:
        json.dump(record, open(out_json, "w", encoding="utf8"), ensure_ascii=False)
    return {"train_paths": sum(seen.values()), "road_paths": min(16, len(lanes)), "vehicles": len(record["vehicles"]),
            "objects": len(cv.all_objects)}

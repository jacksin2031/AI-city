"""Blender: build the Ochanomizu white-box from out/scene.json into a dedicated scene, one collection per game layer."""
import bpy, bmesh, json, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else SCRATCH  # noqa: F821
SCENE_JSON = os.path.join(ROOT, "..", "out", "scene.json")
D = json.load(open(SCENE_JSON, encoding="utf8"))
META = D["meta"]
WATER_Z = META["water_z"]
BASE_Z = -12.0

# ---------------------------------------------------------------- scene + collections
sc = bpy.data.scenes.get("Ochanomizu") or bpy.data.scenes.new("Ochanomizu")
bpy.context.window.scene = sc
for o in list(sc.collection.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in list(sc.collection.children_recursive):
    bpy.data.collections.remove(c)

LAYERS = ["00_Terrain", "01_Water", "02_RetainingWalls", "03_Roads", "04_Bridges", "05_Rail_JR", "06_Rail_Metro",
          "07_Platforms", "08_Buildings", "09_Landmarks", "10_Vegetation", "11_Underground", "12_Walkable_Nav"]
COL = {}
for name in LAYERS:
    c = bpy.data.collections.new(name); sc.collection.children.link(c); COL[name] = c

# ---------------------------------------------------------------- materials
def mat(name, rgb, rough=0.85, metal=0.0, alpha=1.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*rgb, 1)
    return m

def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

M = {
    "ground": mat("WB_Ground", srgb("#DCD8CF")), "water": mat("WB_Water", srgb("#8FB0BF"), rough=0.15),
    "green": mat("WB_Green", srgb("#C2B27A")), "plaza": mat("WB_Plaza", srgb("#E6DFD0")), "wall": mat("WB_Wall", srgb("#B9B2A6")),
    "bed": mat("WB_RiverBed", srgb("#7F8C8C")), "base": mat("WB_Section", srgb("#9C8C78")),
    # three-colour circulation: carriageway = charcoal, pedestrian = pale yellow, railway = brick red
    "road_major": mat("WB_RoadMajor", srgb("#4F545A")), "road": mat("WB_Road", srgb("#4F545A")), "foot": mat("WB_Footway", srgb("#EED68C")),
    "steps": mat("WB_Steps", srgb("#E0BF68")), "bridge": mat("WB_Bridge", srgb("#D2CEC6")), "ballast": mat("WB_Ballast", srgb("#B5483B")),
    "rail": mat("WB_Rail", srgb("#D9D6D0"), rough=0.35, metal=0.3), "platform": mat("WB_Platform", srgb("#E0DBD0")),
    "canopy": mat("WB_Canopy", srgb("#EDEBE6")), "bldg": mat("WB_Building", srgb("#F2F1EC")), "landmark": mat("WB_Landmark", srgb("#F6F1E6")),
    "tree": mat("WB_Tree", srgb("#93AE86")), "trunk": mat("WB_Trunk", srgb("#9A8B7A")),
    "metro": mat("UG_Metro", srgb("#E8705A")), "metro_deep": mat("UG_MetroDeep", srgb("#5A9BD5")), "ug_walk": mat("UG_Passage", srgb("#F2C14E")),
    "portal": mat("WB_Portal", srgb("#A8A296")), "nav": mat("NAV_Walkable", srgb("#4FC27A")),
}

def elevation_tint(m, stops):
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = stops[0][0]; mr.inputs["From Max"].default_value = stops[-1][0]
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    el = ramp.color_ramp.elements
    while len(el) < len(stops): el.new(0.5)
    for e, (zv, col) in zip(el, stops):
        e.position = (zv - stops[0][0]) / (stops[-1][0] - stops[0][0]); e.color = (*col, 1)
    nt.links.new(geo.outputs["Position"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])

elevation_tint(M["ground"], [(0.0, srgb("#B5BFC0")), (9.0, srgb("#D6D3CA")), (19.0, srgb("#EEE8DA"))])
elevation_tint(M["wall"], [(0.0, srgb("#9EA3A0")), (19.0, srgb("#C4BCAE"))])

def new_obj(name, bm, col, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    COL[col].objects.link(ob)
    return ob

# ---------------------------------------------------------------- terrain heightfield + diorama section
T = META["terrain"]
nx, ny, step = T["nx"], T["ny"], T["step"]
Z = list(D["terrain_z"]); CL = D["terrain_cls"]
Z0 = list(Z)

def _tz0(x, y):
    fi = (x - T["x0"]) / step; fj = (y - T["y0"]) / step
    i = min(max(int(fi), 0), nx - 2); j = min(max(int(fj), 0), ny - 2); u, v = fi - i, fj - j
    g = lambda ii, jj: Z0[jj * nx + ii]
    return (1 - u) * (1 - v) * g(i, j) + u * (1 - v) * g(i + 1, j) + (1 - u) * v * g(i, j + 1) + u * v * g(i + 1, j + 1)

def _bed(pts, half, zof):
    """level the terrain under a road / track corridor so it stays CLEAR below the surface (no clipping)"""
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a[:2], b[:2]); k = max(1, int(L / 1.0))
        for t in range(k + 1):
            f = t / k
            x = a[0] + (b[0] - a[0]) * f; y = a[1] + (b[1] - a[1]) * f
            zs = zof(a[2] + (b[2] - a[2]) * f, x, y)
            r = half + 1.2
            for jj in range(max(0, int((y - r - T["y0"]) / step)), min(ny, int((y + r - T["y0"]) / step) + 2)):
                for ii in range(max(0, int((x - r - T["x0"]) / step)), min(nx, int((x + r - T["x0"]) / step) + 2)):
                    gx_, gy_ = T["x0"] + ii * step, T["y0"] + jj * step
                    if (gx_ - x) ** 2 + (gy_ - y) ** 2 <= r * r:
                        k_ = jj * nx + ii
                        Z[k_] = min(Z[k_], zs)

for r in D["rails"]:                                 # ballast bed: rails sit >= DEM + 0.35 (see rail lift below)
    if r["bridge"] or (r["tunnel"] and r["cls"] == "subway"): continue   # JR covered section is levelled too
    _bed(r["pts"], 2.4, lambda z, x, y: min(z + 1.5, max(z, _tz0(x, y) + 0.35)) - 0.75)
# JR shelf faces toward the river: cut the terrain back to a clean vertical face behind the stone wall
# (blender_railworks builds the wall 2.4 m off the track); otherwise the 2 m DEM grid shows as teeth through it
_jr_all = [p for r in D["rails"] if r["cls"] == "rail" and not r["tunnel"] for p in r["pts"]]
def _on_platform(x, y, pad=1.5):
    """inside (or within pad of) an above-ground platform: no river-side wall / carve there"""
    for pf in D["platforms"]:
        if pf["underground"]: continue
        ring = pf["poly"]; ins = False; n_ = len(ring)
        for i in range(n_):
            x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n_]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: ins = not ins
            ex, ey = x2 - x1, y2 - y1; L2 = ex * ex + ey * ey or 1e-9
            t = max(0.0, min(1.0, ((x - x1) * ex + (y - y1) * ey) / L2))
            if math.dist((x, y), (x1 + ex * t, y1 + ey * t)) < pad: return True
        if ins: return True
    return False
for r in D["rails"]:
    if r["cls"] != "rail" or r["tunnel"] or r["bridge"] or len(r["pts"]) < 2: continue
    p_ = r["pts"]
    for i in range(1, len(p_)):
        a_, b_ = p_[i - 1], p_[i]
        dx, dy = b_[0] - a_[0], b_[1] - a_[1]; L_ = math.hypot(dx, dy)
        if L_ < 1e-3: continue
        nx_, ny_ = -dy / L_, dx / L_
        mx, my, mz = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2, (a_[2] + b_[2]) / 2
        for sg in (-1, 1):
            if mz - _tz0(mx + nx_ * sg * 7, my + ny_ * sg * 7) < 4.5: continue
            if any(math.dist((q[0], q[1]), (mx + nx_ * sg * 4, my + ny_ * sg * 4)) < 1.6 for q in _jr_all): continue
            if _on_platform(mx + nx_ * sg * 3.3, my + ny_ * sg * 3.3): continue
            toe = max(WATER_Z + 1.0, min(_tz0(mx + nx_ * sg * 9, my + ny_ * sg * 9), mz - 3.0) - 0.5)
            seg = [[a_[0] + nx_ * sg * 5.7, a_[1] + ny_ * sg * 5.7, toe], [b_[0] + nx_ * sg * 5.7, b_[1] + ny_ * sg * 5.7, toe]]
            _bed(seg, 2.6, lambda z, x, y: z)                 # band 2.6..10.2 m off the track (wall at 2.0-2.8 m) -> wall toe level

for r in D["roads"]:                                 # road bed: carriageway + generated sidewalks
    if r.get("bridge") or r.get("tunnel") or len(r["pts"]) < 2: continue
    half = max(r.get("width", 6.0), 4.0) / 2 + 1.0
    _bed(r["pts"], half, lambda z, x, y: max(z, _tz0(x, y) + 0.06) - 0.12)
CLS_MAT = {0: 0, 1: 6, 2: 1, 3: 2, 4: 3}   # ground, green, plaza, wall, ..., bed
bm = bmesh.new()
verts = [bm.verts.new((T["x0"] + i * step, T["y0"] + j * step, Z[j * nx + i])) for j in range(ny) for i in range(nx)]
for j in range(ny - 1):
    for i in range(nx - 1):
        a, b, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i
        f = bm.faces.new((verts[a], verts[b], verts[c], verts[d]))
        cs = [CL[a], CL[b], CL[c], CL[d]]
        k = 4 if 4 in cs else max(set(cs), key=cs.count)
        f.material_index = CLS_MAT[k]
# section skirt
edge = [j * nx + i for i in range(nx) for j in (0,)] + [j * nx + nx - 1 for j in range(ny)] + \
       [(ny - 1) * nx + i for i in reversed(range(nx))] + [j * nx for j in reversed(range(ny))]
ring = []
for idx in edge:
    if not ring or ring[-1] != idx: ring.append(idx)
for a, b in zip(ring, ring[1:] + ring[:1]):
    va, vb = verts[a], verts[b]
    if a == b: continue
    lo_a = bm.verts.new((va.co.x, va.co.y, BASE_Z)); lo_b = bm.verts.new((vb.co.x, vb.co.y, BASE_Z))
    try:
        f = bm.faces.new((va, lo_a, lo_b, vb)); f.material_index = 5
    except ValueError:
        pass
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
ob = new_obj("Terrain_DEM5A", bm, "00_Terrain", [M["ground"], M["green"], M["plaza"], M["wall"], M["water"], M["base"], M["bed"]])
for p in ob.data.polygons: p.use_smooth = True

# ---------------------------------------------------------------- water
bm = bmesh.new()
for ringp in D["water"]:
    vs = [bm.verts.new((x, y, WATER_Z)) for x, y in ringp]
    try: bm.faces.new(vs)
    except ValueError: pass
bmesh.ops.triangulate(bm, faces=bm.faces)
new_obj("KandaRiver_Water", bm, "01_Water", [M["water"]])

# ---------------------------------------------------------------- helpers: ribbons, boxes
REVET = D.get("revetments", [])
def offsets(pts):
    """per-vertex left normal (2D) with miter"""
    n = len(pts); out = []
    for i in range(n):
        p0 = Vector(pts[max(i - 1, 0)][:2]); p1 = Vector(pts[min(i + 1, n - 1)][:2])
        d = (p1 - p0); d = d.normalized() if d.length > 1e-6 else Vector((1, 0))
        out.append(Vector((-d.y, d.x)))
    return out

def ribbon(bm, pts, w, dz=0.0, mi=0, thick=0.0, side_mi=None, walls=0.0, wall_w=0.4):
    clean = [pts[0]]                       # near-duplicate points fold the strip (overlapping faces render black)
    for p in pts[1:]:
        if math.dist(p[:2], clean[-1][:2]) > 0.3: clean.append(p)
    pts = clean
    if len(pts) < 2: return
    nrm = offsets(pts)
    L, R, Lb, Rb = [], [], [], []
    for p, nv in zip(pts, nrm):
        c = Vector((p[0], p[1], p[2] + dz))
        L.append(bm.verts.new(c + Vector((nv.x, nv.y, 0)) * w / 2)); R.append(bm.verts.new(c - Vector((nv.x, nv.y, 0)) * w / 2))
        if thick:
            Lb.append(bm.verts.new(L[-1].co - Vector((0, 0, thick)))); Rb.append(bm.verts.new(R[-1].co - Vector((0, 0, thick))))
    uvl = bm.loops.layers.uv.verify()
    dist = [0.0]
    for i in range(1, len(pts)): dist.append(dist[-1] + math.dist(pts[i - 1][:2], pts[i][:2]))
    for i in range(len(pts) - 1):
        f = bm.faces.new((L[i], R[i], R[i + 1], L[i + 1])); f.material_index = mi
        for lp, uv in zip(f.loops, ((w / 2, dist[i]), (-w / 2, dist[i]), (-w / 2, dist[i + 1]), (w / 2, dist[i + 1]))):
            lp[uvl].uv = uv
        if thick:
            for a, b, c_, d in ((L[i], L[i + 1], Lb[i + 1], Lb[i]), (R[i + 1], R[i], Rb[i], Rb[i + 1]), (Lb[i], Lb[i + 1], Rb[i + 1], Rb[i])):
                f = bm.faces.new((a, b, c_, d)); f.material_index = side_mi if side_mi is not None else mi
    if thick:
        for a, b, c_, d in ((L[0], Lb[0], Rb[0], R[0]), (R[-1], Rb[-1], Lb[-1], L[-1])):
            f = bm.faces.new((a, b, c_, d)); f.material_index = side_mi if side_mi is not None else mi
    if walls:  # parapets / girders along both edges
        for sgn in (1, -1):
            for i in range(len(pts) - 1):
                p0, p1 = Vector(pts[i]), Vector(pts[i + 1])
                n0, n1 = nrm[i], nrm[i + 1]
                o0 = Vector((n0.x, n0.y, 0)) * sgn * (w / 2 - wall_w / 2); o1 = Vector((n1.x, n1.y, 0)) * sgn * (w / 2 - wall_w / 2)
                box_seg(bm, p0 + o0 + Vector((0, 0, dz)), p1 + o1 + Vector((0, 0, dz)), wall_w, walls, side_mi if side_mi is not None else mi)

def box_seg(bm, a, b, w, h, mi, z0=None):
    d = (b - a); d.z = 0
    if d.length < 1e-4: return
    n = Vector((-d.y, d.x, 0)).normalized() * w / 2
    za0 = a.z if z0 is None else z0; zb0 = b.z if z0 is None else z0
    bot = [Vector((a.x, a.y, za0)) + n, Vector((a.x, a.y, za0)) - n, Vector((b.x, b.y, zb0)) - n, Vector((b.x, b.y, zb0)) + n]
    top = [Vector((a.x, a.y, a.z + h)) + n, Vector((a.x, a.y, a.z + h)) - n, Vector((b.x, b.y, b.z + h)) - n, Vector((b.x, b.y, b.z + h)) + n]
    vb = [bm.verts.new(v) for v in bot]; vt = [bm.verts.new(v) for v in top]
    for f in ([vb[3], vb[2], vb[1], vb[0]], vt, [vb[0], vb[1], vt[1], vt[0]], [vb[1], vb[2], vt[2], vt[1]], [vb[2], vb[3], vt[3], vt[2]], [vb[3], vb[0], vt[0], vt[3]]):
        bm.faces.new(f).material_index = mi

def pillar(bm, x, y, z0, z1, sx, sy, ang, mi):
    c, s = math.cos(ang), math.sin(ang)
    corners = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
    pts = [(x + u * c - v * s, y + u * s + v * c) for u, v in corners]
    vb = [bm.verts.new((px, py, z0)) for px, py in pts]; vt = [bm.verts.new((px, py, z1)) for px, py in pts]
    for f in ([vb[3], vb[2], vb[1], vb[0]], vt, *[[vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i]] for i in range(4)]):
        bm.faces.new(f).material_index = mi

# terrain sampler (bilinear on the grid) for piers
def tz(x, y):
    fi = (x - T["x0"]) / step; fj = (y - T["y0"]) / step
    i = min(max(int(fi), 0), nx - 2); j = min(max(int(fj), 0), ny - 2)
    u, v = fi - i, fj - j
    g = lambda ii, jj: Z[jj * nx + ii]
    return (1 - u) * (1 - v) * g(i, j) + u * (1 - v) * g(i + 1, j) + (1 - u) * v * g(i, j + 1) + u * v * g(i + 1, j + 1)

# ---------------------------------------------------------------- roads
MAJOR = {"trunk", "primary", "secondary"}
FOOT = {"footway", "path", "cycleway", "pedestrian"}
bm_r = bmesh.new(); bm_b = bmesh.new(); bm_nav = bmesh.new(); bm_ob = bmesh.new()
CARRIAGEWAY = 6.0     # one lane each way (two cars side by side), game simplification
FOOT_W = 4.0          # pedestrian ways drawn wider than real for character movement
SIDE_EXTRA = 1.0      # former road width beyond the carriageway becomes sidewalk, +1 m

def shifted(pts, off):
    nrm = offsets(pts)
    return [[p[0] + nv.x * off, p[1] + nv.y * off, p[2]] for p, nv in zip(pts, nrm)]

LANE = 3.25           # one lane
_ob_pts = [p for r in D["roads"] if r.get("name") == "御茶ノ水橋" and r["bridge"] for p in r["pts"]]
def part_of_ochanomizubashi(r):
    """sidewalk bridges mapped beside 御茶ノ水橋 (parallel, within 10 m) belong to the same green structure"""
    if r.get("name") == "御茶ノ水橋": return True
    if not (_ob_pts and r["bridge"] and len(r["pts"]) > 1): return False
    a, b = r["pts"][0], r["pts"][-1]
    m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    if min(math.dist(m, p[:2]) for p in _ob_pts) > 15: return False
    o0, o1 = _ob_pts[0], _ob_pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]; ex, ey = o1[0] - o0[0], o1[1] - o0[1]
    c = abs(dx * ex + dy * ey) / ((math.hypot(dx, dy) * math.hypot(ex, ey)) or 1)
    return c > 0.95

# bridge ends: at-grade roads ramp to deck height over RAMP metres so decks and streets join
RAMP = 20.0
_bridge_ends = []
for _r in D["roads"]:
    if _r["bridge"] and len(_r["pts"]) > 1:
        _bridge_ends += [_r["pts"][0], _r["pts"][-1]]

def ramp_to_bridges(pts):
    pts = [list(p) for p in pts]
    for end_i in (0, -1):
        e = pts[end_i]
        b = min(_bridge_ends, key=lambda q: math.dist(q[:2], e[:2]), default=None)
        if b is None or math.dist(b[:2], e[:2]) > 2.5: continue
        seq = pts if end_i == 0 else pts[::-1]
        d = 0.0
        for i, p in enumerate(seq):
            if i: d += math.dist(seq[i - 1][:2], p[:2])
            if d > RAMP: break
            t = d / RAMP; t = t * t * (3 - 2 * t)                     # smoothstep
            p[2] = b[2] * (1 - t) + p[2] * t
    return pts

def extend_ends(pts, ext):
    if len(pts) < 2 or ext <= 0: return pts
    out = [list(p) for p in pts]
    for a_i, b_i in ((0, 1), (-1, -2)):
        a, b = out[a_i], out[b_i]
        dx, dy = a[0] - b[0], a[1] - b[1]; L = math.hypot(dx, dy) or 1
        q = [a[0] + dx / L * ext, a[1] + dy / L * ext, a[2]]
        if a_i == 0: out.insert(0, q)
        else: out.append(q)
    return out

def path_len(pts):
    return sum(math.dist(pts[i][:2], pts[i + 1][:2]) for i in range(len(pts) - 1))

bm_kerb = bmesh.new(); bm_zeb = bmesh.new(); bm_lamp = bmesh.new()
_VEH_CLS = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"}
_junctions = [p for r in D["roads"] if r["cls"] in _VEH_CLS and not r.get("tunnel") for p in (r["pts"][0], r["pts"][-1])]
_jgrid = {}
for p in _junctions: _jgrid.setdefault((int(p[0] // 10), int(p[1] // 10)), []).append(p)
def near_junction(x, y, rad=7.0):
    gx_, gy_ = int(x // 10), int(y // 10)
    return any(math.dist((x, y), q[:2]) < rad for i in (-1, 0, 1) for j in (-1, 0, 1) for q in _jgrid.get((gx_ + i, gy_ + j), []))

def runs_away_from_junctions(pts):
    """split a polyline into runs that stay clear of junctions (kerbs stop at intersections)"""
    out, cur = [], []
    for p in pts:
        if near_junction(p[0], p[1]):
            if len(cur) > 1: out.append(cur)
            cur = []
        else: cur.append(p)
    if len(cur) > 1: out.append(cur)
    return out

_lamp_pos = []
STREET_LAMPS = False          # removed at the user's request (2026-11-01)
def kerbs_and_lamps(pts, offsets_, base_z, lamp_sides):
    for off in offsets_:
        sp = shifted(pts, off)
        for run in runs_away_from_junctions(sp):
            ribbon(bm_kerb, run, 0.22, base_z + 0.17, mi=0, thick=0.2)      # granite kerb, 15 cm upstand
    for off in (lamp_sides if STREET_LAMPS else ()):                         # street lamps every ~30 m (推定)
        sp = shifted(pts, off)
        acc = 15.0
        for i in range(1, len(sp)):
            acc += math.dist(sp[i - 1][:2], sp[i][:2])
            if acc < 30: continue
            x, y, z = sp[i]
            if near_junction(x, y, 5.0) or any(math.dist((x, y), q) < 12 for q in _lamp_pos): continue
            acc = 0.0; _lamp_pos.append((x, y))
            d = Vector((sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1], 0)).normalized()
            inward = Vector((-d.y, d.x, 0)) * (-1 if off > 0 else 1)
            zb = max(z, tz(x, y)) + base_z
            pillar(bm_lamp, x, y, zb, zb + 7.0, 0.18, 0.18, 0.0, 0)
            a0 = Vector((x, y, zb + 6.9)); a1 = a0 + inward * 1.6
            box_seg(bm_lamp, a0, a1, 0.12, 0.12, 0)
            h_ = a1 + inward * 0.25
            box_seg(bm_lamp, a1, h_ + inward * 0.3, 0.32, 0.18, 1)

_road_z_pts = []
for r in D["roads"]:
    pts = r["pts"]; w = r["width"]; c = r["cls"]
    if r.get("footway") == "crossing" and D.get("road_areas"):
        continue                                      # zebra stripes come from road_areas (clipped to the carriageway)
    if r.get("footway") == "crossing" and not r["bridge"] and len(r["pts"]) > 1:
        # zebra crossing: white bars across the carriageway part only (middle <=7 m of the crossing way)
        L_ = path_len(r["pts"]); a, b_ = r["pts"][0], r["pts"][-1]
        d = Vector((b_[0] - a[0], b_[1] - a[1], 0))
        if d.length > 0.5:
            d.normalize(); mid = Vector(((a[0] + b_[0]) / 2, (a[1] + b_[1]) / 2, 0)); half = min(L_, 7.0) / 2
            zz = max((a[2] + b_[2]) / 2, tz(mid.x, mid.y)) + 0.25
            t_ = -half
            while t_ + 0.45 <= half:
                p0 = mid + d * t_; p1 = mid + d * (t_ + 0.45)
                ribbon(bm_zeb, [[p0.x, p0.y, zz], [p1.x, p1.y, zz]], 3.0, 0.0, mi=0)
                t_ += 0.9
        continue
    if r.get("footway") == "sidewalk":
        continue                                      # sidewalks are generated from road widths (continuous)
    if (c in FOOT or c == "path") and not r["bridge"] and path_len(pts) < 12:
        continue                                      # isolated stubs read as broken fragments
    if not r["bridge"]:
        pts = ramp_to_bridges(pts)
        ext = min(w / 2 + 1.0, 4.0) if c not in FOOT and c != "steps" else (1.5 if c != "steps" else 0.0)
        pts = extend_ends(pts, ext)
        pts = [[p[0], p[1], max(p[2], tz(p[0], p[1]) + 0.06)] for p in pts]   # never under the smoothed terrain
        r = dict(r, pts=pts)
        if D.get("road_areas"):              # at-grade surfaces come from the merged network below
            _road_z_pts.extend(pts)
            continue
    if r["bridge"] and r.get("name") != "御茶ノ水橋" and part_of_ochanomizubashi(r):
        continue                                      # its sidewalks are part of the 御茶ノ水橋 deck below
    if r.get("footway") in ("crossing", "traffic_island"):
        continue                                      # crossings would paint footway across the carriageway
    jit = (r["id"] % 13) * 0.002                      # break coplanar overlaps (black in Cycles)
    foot = c in FOOT or c == "steps"
    if r["bridge"]:
        thick = 1.6 if not foot else 0.8
        deck_w = max(w, FOOT_W) if foot else w
        if part_of_ochanomizubashi(r):    # 御茶ノ水橋: deck drawn as one green structure below (outer railings only)
            pass
        else:
            ribbon(bm_b, pts, deck_w, 0.05 + jit, mi=0, thick=thick, side_mi=0, walls=1.1, wall_w=0.35)
        base = 0.09
    else:
        base = 0.10
    # z order: footway (base+0.01..0.04) always below carriageway (base+0.08)
    if foot:
        fw = max(w, FOOT_W) if not r["bridge"] else max(w, FOOT_W) - 0.8
        ribbon(bm_r, pts, fw, base + 0.01 + jit, mi=3 if c == "steps" else 2)
        ribbon(bm_nav, pts, fw, base + 0.12, mi=0)
        continue
    ps = r.get("pair_side")
    if ps:                                            # half of a dual carriageway: one lane, moved to the median
        shift = max(0.0, min(r["pair_sep"] / 2 - LANE / 2 + 0.6, 12.0))   # +0.6: lanes overlap, no seam
        lane_pts = shifted(pts, ps * shift)
        ribbon(bm_r, lane_pts, LANE, base + 0.08 + jit, mi=1)          # one-way lane: no centre line
        ribbon(bm_nav, lane_pts, LANE, base + 0.12, mi=0)
        out_edge = LANE / 2 - shift                   # lane outer edge, measured outward from the centreline
        side = w / 2 + SIDE_EXTRA - out_edge
        if r["bridge"]: side = min(side, w / 2 - 0.4 - out_edge)
        if side > 0.6:
            sp = shifted(pts, -ps * (out_edge + side / 2))
            ribbon(bm_r, sp, side, base + 0.02 + jit, mi=2)
            ribbon(bm_nav, sp, side, base + 0.12, mi=0)
            if not r["bridge"]:
                kerbs_and_lamps(pts, (-ps * (out_edge + 0.11),), base, (-ps * (out_edge + 0.6),))
        continue
    cw = min(w, CARRIAGEWAY)
    ribbon(bm_r, pts, cw, base + 0.08 + jit, mi=0)
    ribbon(bm_nav, pts, cw, base + 0.12, mi=0)
    side = (w - cw) / 2 + (SIDE_EXTRA if w > cw else 0.0)
    if r["bridge"]: side = min(side, (w - cw) / 2 - 0.4)
    if side > 0.6:                                    # sidewalks from the leftover road width
        for sgn in (1, -1):
            sp = shifted(pts, sgn * (cw / 2 + side / 2))
            ribbon(bm_r, sp, side, base + 0.02 + jit, mi=2)
            ribbon(bm_nav, sp, side, base + 0.12, mi=0)
        if not r["bridge"]:
            kerbs_and_lamps(pts, (cw / 2 + 0.11, -(cw / 2 + 0.11)), base, (cw / 2 + 0.6, -(cw / 2 + 0.6)) if w >= 9 else ())
# ---- merged at-grade road network: seamless carriageway + sidewalk surfaces draped on the (ramped) road levels
RA = D.get("road_areas")
if RA and _road_z_pts:
    from mathutils import kdtree as _kd
    from mathutils.geometry import tessellate_polygon
    _kt = _kd.KDTree(len(_road_z_pts))
    for i_, p in enumerate(_road_z_pts): _kt.insert((p[0], p[1], 0.0), i_)
    _kt.balance()
    def road_z(x, y):
        hits = _kt.find_n((x, y, 0.0), 3)
        zs = [_road_z_pts[i_][2] for _, i_, d_ in hits if d_ < 12]
        return max(max(zs) if zs else tz(x, y), tz(x, y) + 0.06)
    uvl_ = bm_r.loops.layers.uv.verify()
    for key, mi_, dz_ in (("car", 1, 0.10), ("walk", 2, 0.12)):
        for rings in RA[key]:
            rings3 = [[(x, y, 0.0) for x, y in ring] for ring in rings]
            tris = tessellate_polygon(rings3)
            flat = [v for ring in rings for v in ring]
            vs = [bm_r.verts.new((x, y, road_z(x, y) + dz_)) for x, y in flat]
            for t_ in tris:
                try:
                    f_ = bm_r.faces.new((vs[t_[0]], vs[t_[1]], vs[t_[2]]))
                except ValueError:
                    continue
                f_.material_index = mi_
                if f_.normal.z < 0: f_.normal_flip()
                for lp in f_.loops: lp[uvl_].uv = (lp.vert.co.x, lp.vert.co.y)
            # walkable nav mirrors the same surfaces
            vn = [bm_nav.verts.new((x, y, road_z(x, y) + dz_ + 0.05)) for x, y in flat]
            for t_ in tris:
                try: bm_nav.faces.new((vn[t_[0]], vn[t_[1]], vn[t_[2]]))
                except ValueError: pass
    for line in RA["kerbs"]:                              # kerbs only where carriageway meets sidewalk
        kp = [[x, y, road_z(x, y)] for x, y in line]
        ribbon(bm_kerb, kp, 0.22, 0.27, mi=0, thick=0.2)
    for rings in RA.get("zebra", []):                     # zebra stripes, carriageway only
        ring = rings[0]
        vz = [bm_zeb.verts.new((x, y, road_z(x, y) + 0.13)) for x, y in ring]
        try:
            f_ = bm_zeb.faces.new(vz)
            if f_.normal.z < 0: f_.normal_flip()
        except ValueError: pass
    for a_, b_ in RA["dashes"]:                           # dashed centre lines on two-way main roads
        ribbon(bm_zeb, [[a_[0], a_[1], road_z(*a_) + 0.125], [b_[0], b_[1], road_z(*b_) + 0.125]], 0.15, 0.0, mi=0)
new_obj("Roads", bm_r, "03_Roads", [M["road_major"], M["road"], M["foot"], M["steps"]])
new_obj("Road_Kerbs", bm_kerb, "03_Roads", [mat("WB_Kerb", srgb("#B9B4AA"))])
new_obj("Road_ZebraCrossings", bm_zeb, "03_Roads", [mat("WB_RoadPaint", srgb("#ECE9E1"))])
new_obj("Street_Lamps", bm_lamp, "03_Roads", [mat("WB_LampPole", srgb("#4E5154")), mat("WB_LampHead", srgb("#D8D6CF"))])

# Hijiribashi: concrete barrel arch (span 36.3 m, deck width 22 m — 土木資料) with arched spandrel openings
# over each haunch, as in Wikimedia photos "Hijiribashi -01" / "Marunouchi Line above Kanda River 001".
# Rise, opening count and pier rhythm are read from the photos (推定).
hb = [r for r in D["roads"] if r.get("name") == "聖橋" and r["bridge"]]
water_rings = D["water"]
def in_water(x, y):
    for ringp in water_rings:
        inside = False; n = len(ringp)
        for i in range(n):
            x1, y1 = ringp[i]; x2, y2 = ringp[(i + 1) % n]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: inside = not inside
        if inside: return True
    return False
if hb:
    allp = [p for r in hb for p in r["pts"]]
    cx = sum(p[0] for p in allp) / len(allp); cy = sum(p[1] for p in allp) / len(allp)
    a0, a1 = Vector(hb[0]["pts"][0]), Vector(hb[0]["pts"][-1])
    axis = (a1 - a0); axis.z = 0; axis.normalize()
    perp = Vector((-axis.y, axis.x, 0)); ang = math.atan2(axis.y, axis.x)
    C = Vector((cx, cy, 0))
    sv = [((Vector(p) - C).dot(axis), p) for p in allp]
    wet = [s_ for s_, p in sv if in_water(p[0], p[1])]
    mid = (min(wet) + max(wet)) / 2 if wet else 0.0
    # deck level along the axis (linear fit through the solved deck points)
    ss = [s_ for s_, _ in sv]; zz = [p[2] for _, p in sv]
    ms, mz = sum(ss) / len(ss), sum(zz) / len(zz)
    k_ = sum((s_ - ms) * (z_ - mz) for s_, z_ in zip(ss, zz)) / max(sum((s_ - ms) ** 2 for s_ in ss), 1e-6)
    deck_at = lambda s_: mz + k_ * (s_ - ms)
    span, W, TH = 36.3, 22.0, 1.4
    spring = WATER_Z + 1.2
    crown = deck_at(mid) - 1.6 - 0.9
    f = lambda s_: spring + (crown - spring) * (1 - (2 * s_ / span) ** 2)     # intrados (parabolic)
    under = lambda s_: deck_at(mid + s_) - 1.6                              # deck soffit
    P = lambda s_, off: C + axis * (mid + s_) + perp * off
    # barrel vault
    N = 30
    for k in range(N):
        s0 = -span / 2 + span * k / N; s1 = -span / 2 + span * (k + 1) / N
        p0 = P(s0, 0); p0.z = f(s0); p1 = P(s1, 0); p1.z = f(s1)
        box_seg(bm_b, p0, p1, W - 1.0, TH, 0)
    # spandrel walls on both faces: piers + small semicircular arches where the haunch is tall
    PIER, OPEN = 1.4, 3.4
    for side in (-1, 1):
        off = side * (W / 2 - 0.9)
        s_ = -span / 2 + 0.2
        while s_ < span / 2 - 0.2:
            s_end = min(s_ + PIER + OPEN, span / 2)
            sm = s_ + PIER / 2
            ext = f(sm) + TH
            h = under(sm) - ext
            if h > 0.3:   # pier
                q = P(sm, off); pillar(bm_b, q.x, q.y, ext - 0.2, under(sm), PIER, 1.2, ang, 0)
            o0, o1 = s_ + PIER, min(s_ + PIER + OPEN, span / 2 - 0.2)
            om = (o0 + o1) / 2
            gap = under(om) - (f(om) + TH)
            if o1 - o0 > 0.5 and gap > 0.3:
                r = (o1 - o0) / 2
                if gap > r + 1.2:            # arched opening: semicircle + infill above
                    zc = under(om) - 0.5 - r
                    M_ = 8
                    for j in range(M_):
                        t0 = math.pi * j / M_; t1 = math.pi * (j + 1) / M_
                        q0 = P(om - r * math.cos(t0), off); q0.z = zc + r * math.sin(t0)
                        q1 = P(om - r * math.cos(t1), off); q1.z = zc + r * math.sin(t1)
                        box_seg(bm_b, q0, q1, 1.2, 0.45, 0)
                    q0 = P(o0, off); q1 = P(o1, off); q0.z = q1.z = zc + r * 0.7
                    box_seg(bm_b, q0, q1, 1.2, under(om) - (zc + r * 0.7), 0)
                else:                        # near the crown: solid spandrel
                    q0 = P(o0, off); q1 = P(o1, off)
                    q0.z = f(o0) + TH - 0.2; q1.z = f(o1) + TH - 0.2
                    box_seg(bm_b, q0, q1, 1.2, max(gap, 0.2) + 0.2, 0)
            s_ = s_end
    # abutments on both banks, full deck width
    for sgn in (-1, 1):
        s_ = sgn * (span / 2 + 2.0); q = P(s_, 0)
        pillar(bm_b, q.x, q.y, spring - 2.5, under(s_), 4.0, W, ang, 0)


# 御茶ノ水橋: green steel girder bridge with curved haunches at the piers (user photo, 2026-10-31):
# side span over the JR tracks, main span over the river, single pier row between tracks and river,
# cluster of columns on the north bank. Girder depth / haunch radius / column count read from the photo (推定).
obw = [r for r in D["roads"] if r.get("name") == "御茶ノ水橋" and r["bridge"]]
if obw:
    rp = max(obw, key=lambda r: len(r["pts"]))["pts"]
    if rp[0][1] > rp[-1][1]: rp = rp[::-1]                       # south -> north
    rp = [list(p) for p in rp]
    W_ob = CARRIAGEWAY + 2 * 5.0 + 0.8                            # 6 m carriageway + 5 m sidewalks + railings (推定)
    # cumulative distance along the real road centreline
    cs = [0.0]
    for i in range(1, len(rp)): cs.append(cs[-1] + math.dist(rp[i - 1][:2], rp[i][:2]))
    L_ob = cs[-1]
    def at(s_):
        s_ = min(max(s_, 0.0), L_ob)
        i = max(1, next((k for k in range(1, len(cs)) if cs[k] >= s_), len(cs) - 1))
        t = (s_ - cs[i - 1]) / max(cs[i] - cs[i - 1], 1e-6)
        p0, p1 = rp[i - 1], rp[i]
        d = Vector((p1[0] - p0[0], p1[1] - p0[1], 0)).normalized()
        return Vector((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t)), d
    wet = [cs[i] for i, p in enumerate(rp) if in_water(p[0], p[1])]
    s_sp = (min(wet) - 2.0) if wet else L_ob * 0.35        # pier between tracks and river
    s_np = (max(wet) + 2.0) if wet else L_ob * 0.75        # column cluster on the north bank
    GD, R_h = 2.2, 4.5
    # deck slab + outer railings, paved top, girder — all following the road line
    ribbon(bm_ob, rp, W_ob, -0.05, mi=0, thick=1.55, side_mi=0, walls=1.15, wall_w=0.25)
    ribbon(bm_ob, rp, W_ob - 0.6, 0.03, mi=1)
    gpts = [[p[0], p[1], p[2] - 1.6] for p in rp]
    ribbon(bm_ob, gpts, W_ob - 0.8, 0.0, mi=0, thick=GD)
    for sp_, ncol in ((s_sp, 3), (s_np, 5)):
        c, d = at(sp_); pv = Vector((-d.y, d.x, 0)); ang = math.atan2(d.y, d.x)
        zg = c.z - 1.6 - GD
        for sgn in (-1, 1):                                   # curved haunches (quarter-circle fillets)
            M_ = 7
            for j in range(M_):
                d0, d1 = R_h * j / M_, R_h * (j + 1) / M_
                ex = R_h - math.sqrt(max(R_h ** 2 - (R_h - (d0 + d1) / 2) ** 2, 0))
                if ex < 0.05: continue
                q0, _ = at(sp_ + sgn * (0.8 + d0)); q1, _ = at(sp_ + sgn * (0.8 + d1))
                q0.z = q1.z = zg - ex
                box_seg(bm_ob, q0, q1, W_ob - 0.8, ex + 0.05, 0)
        c0 = c - pv * (W_ob / 2 - 0.6); c1 = c + pv * (W_ob / 2 - 0.6)
        c0.z = c1.z = zg - R_h
        box_seg(bm_ob, c0, c1, 1.8, R_h, 0)                    # cap beam
        for k_ in range(ncol):
            off = -(W_ob / 2 - 1.2) + (W_ob - 2.4) * k_ / max(ncol - 1, 1)
            q = c + pv * off
            g_ = max(tz(q.x, q.y), WATER_Z - 0.5)
            pillar(bm_ob, q.x, q.y, g_ - 1.0, zg - R_h + 0.2, 1.6, 1.4, ang, 0)
new_obj("Bridge_Ochanomizubashi_SteelGirder", bm_ob, "04_Bridges", [mat("WB_SteelGreen", srgb("#5E9A86"), rough=0.5, metal=0.3), M["foot"]])

# ---------------------------------------------------------------- rails
bm_jr = bmesh.new(); bm_m = bmesh.new(); bm_ug = bmesh.new(); bm_portal = bmesh.new(); bm_mb = bmesh.new(); bm_rb = bmesh.new(); bm_brick = bmesh.new(); bm_sobu = bmesh.new(); bm_fill = bmesh.new(); bm_mast = bmesh.new(); _masts = []
for r in D["rails"]:
    pts = r["pts"]; line = r["line"] or ""
    metro = r["cls"] == "subway"
    near_surface = all(p[2] > tz(p[0], p[1]) - 2.5 for p in pts)
    if r["tunnel"]:
        mi = 1 if "千代田" in line else 0
        ribbon(bm_ug, pts, 7.0 if not metro else 7.5, -0.6, mi=mi, thick=0.0)
        tube = [[p[0], p[1], p[2] - 0.6] for p in pts]
        ribbon(bm_ug, tube, 8.0, 5.8, mi=mi, thick=6.0, side_mi=mi)
        if not near_surface: continue
    bm_t = bm_m if metro else bm_jr
    if not r["bridge"]:   # keep at-grade track above the smoothed DEM (≤1.5 m lift so tracks under bridges stay put)
        pts = [[p[0], p[1], min(p[2] + 1.5, max(p[2], tz(p[0], p[1]) + 0.35))] for p in pts]
    ribbon(bm_t, pts, 3.4, (r["id"] % 7) * 0.006, mi=0, thick=0.6 if not r["bridge"] else 0.0)   # tiny per-track offset: overlapping crossovers render black otherwise
    if not r["bridge"] and not metro:
        nrm_ = offsets(pts)
        for i in range(len(pts) - 1):
            for sg in (-1, 1):
                a = Vector(pts[i]) + Vector((nrm_[i].x, nrm_[i].y, 0)) * sg * 2.0
                b = Vector(pts[i + 1]) + Vector((nrm_[i + 1].x, nrm_[i + 1].y, 0)) * sg * 2.0
                ga, gb = tz(a.x, a.y), tz(b.x, b.y)
                if min(a.z - ga, b.z - gb) < 1.6: continue
                if _on_platform((a.x + b.x) / 2, (a.y + b.y) / 2, 0.8): continue   # platform edge, not a bank
                a.z -= 0.55; b.z -= 0.55
                box_seg(bm_fill, a, b, 0.5, 0.0, 0, z0=min(ga, gb) - 0.5)            # retaining wall of the raised bed
    if False:                                          # superseded by blender_railworks gantries
        acc = 25.0
        for i in range(1, len(pts)):
            acc += math.dist(pts[i - 1][:2], pts[i][:2])
            if acc < 50: continue
            d = Vector((pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], 0)).normalized(); nv = Vector((-d.y, d.x, 0))
            q = Vector(pts[i]) + nv * 2.6
            if any(math.dist((q.x, q.y), m_) < 6 for m_ in _masts): continue
            acc = 0.0; _masts.append((q.x, q.y))
            pillar(bm_mast, q.x, q.y, pts[i][2] - 0.6, pts[i][2] + 7.4, 0.35, 0.35, math.atan2(d.y, d.x), 0)
            a0 = Vector((q.x, q.y, pts[i][2] + 7.0)); a1 = a0 - nv * 3.4
            box_seg(bm_mast, a0, a1, 0.18, 0.2, 0)
    for off in (-0.55, 0.55):
        shifted = []
        nrm = offsets(pts)
        for p, nv in zip(pts, nrm): shifted.append([p[0] + nv.x * off, p[1] + nv.y * off, p[2]])
        ribbon(bm_t, shifted, 0.18, 0.18 + (r["id"] % 7) * 0.006, mi=1, thick=0.18)
    if r["bridge"]:
        if metro:   # light-grey steel box girder: deep girder under the rails, low parapet (photos)
            ribbon(bm_mb, pts, 4.8, -0.05, mi=0, thick=2.6, side_mi=0, walls=0.8, wall_w=0.35)
            for end, nxt in ((pts[0], pts[1]), (pts[-1], pts[-2])):      # abutments where the span meets land
                g_ = tz(end[0], end[1])
                if not in_water(end[0], end[1]) and end[2] - 2.65 > g_ - 6:
                    a_ = math.atan2(nxt[1] - end[1], nxt[0] - end[0])
                    pillar(bm_mb, end[0], end[1], min(g_, end[2] - 3.0) - 3.0, end[2] - 2.65, 2.5, 6.5, a_, 1)
        elif "中央" in line and not metro:
            # 中央線 east of 御茶ノ水: red-brick arch viaduct (万世橋高架橋, 1912). Bay 9 m, piers 1.8 m (推定)
            ribbon(bm_brick, pts, 4.6, -0.05, mi=0, thick=1.2, side_mi=0, walls=1.0, wall_w=0.35)
            acc = 0.0; bays = []
            for i in range(1, len(pts)):
                acc += math.dist(pts[i][:2], pts[i - 1][:2])
                if acc >= 9.0: acc = 0.0; bays.append(i)
            for i in bays:
                x, y, zz = pts[i]; g = tz(x, y)
                d_ = Vector((pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], 0)).normalized()
                ang = math.atan2(d_.y, d_.x)
                soffit = zz - 1.25
                if soffit - g < 1.2: continue
                pillar(bm_brick, x, y, g - 0.5, soffit, 1.8, 4.6, ang, 0)           # pier
                # arch over the bay that ends at this pier
                rad = 3.6; spring = soffit - rad - 0.6
                c0 = Vector((x, y, 0)) - d_ * 4.5
                if spring - g < 1.0:                                                 # too low for an arch: solid wall
                    a = Vector((x, y, g - 0.5)) - d_ * 8.1; b = Vector((x, y, g - 0.5)) - d_ * 0.9
                    box_seg(bm_brick, a, b, 4.4, soffit - g + 0.5, 0)
                    continue
                N_ = 8
                for j in range(N_):
                    u0 = -rad + 2 * rad * j / N_; u1 = -rad + 2 * rad * (j + 1) / N_; um = (u0 + u1) / 2
                    zc = spring + math.sqrt(max(0.0, rad * rad - um * um))
                    a = c0 + d_ * u0; b = c0 + d_ * u1; a.z = b.z = zc
                    box_seg(bm_brick, a, b, 4.4, soffit - zc, 0)
                    a.z = b.z = zc - 0.05
                    box_seg(bm_brick, a, b, 4.0, 0.05, 1)                             # dark arch soffit
        elif "総武" in line and not metro:
            # 総武線 神田川橋梁 / 高架: blue-grey steel plate girder on steel ramen (portal) piers (photo: 青っぽい鉄橋)
            ribbon(bm_sobu, pts, 4.4, -0.05, mi=0, thick=2.0, side_mi=0, walls=1.0, wall_w=0.3)
            acc = 0.0
            for i in range(1, len(pts)):
                acc += math.dist(pts[i][:2], pts[i - 1][:2])
                if acc < 18: continue
                acc = 0.0
                x, y, zz = pts[i]; g = tz(x, y)
                if zz - g < 3.0 or in_water(x, y): continue
                d_ = Vector((pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], 0)).normalized(); n_ = Vector((-d_.y, d_.x, 0))
                for sg in (-1, 1):
                    q = Vector((x, y, 0)) + n_ * sg * 2.6
                    pillar(bm_sobu, q.x, q.y, g - 0.5, zz - 2.05, 0.8, 0.8, 0.0, 1)
                a = Vector((x, y, zz - 3.0)) - n_ * 3.0; b = Vector((x, y, zz - 3.0)) + n_ * 3.0
                box_seg(bm_sobu, a, b, 1.0, 0.95, 1)                                    # ramen cross beam
        else:
            ribbon(bm_rb, pts, 4.2, -0.05, mi=0, thick=1.6, side_mi=0, walls=1.0, wall_w=0.3)
            # piers every ~15 m where the deck is well above ground
            acc = 0.0
            for i in range(1, len(pts)):
                acc += math.dist(pts[i][:2], pts[i - 1][:2])
                if acc >= 15:
                    acc = 0.0
                    x, y, zz = pts[i]; g = tz(x, y)
                    if zz - g > 3.0 and not in_water(x, y):
                        ang = math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
                        pillar(bm_rb, x, y, g - 0.5, zz - 1.65, 1.6, 3.6, ang, 0)
new_obj("Rail_JR", bm_jr, "05_Rail_JR", [M["ballast"], M["rail"]])
new_obj("Rail_OverheadMasts", bm_mast, "05_Rail_JR", [mat("WB_Mast", srgb("#8F9192"))])
new_obj("Rail_Metro_Marunouchi", bm_m, "06_Rail_Metro", [M["ballast"], M["rail"]])
new_obj("Underground_MetroTunnels", bm_ug, "11_Underground", [M["metro"], M["metro_deep"]])
import importlib, sys
sys.path.insert(0, ROOT)
import blender_tunnels; importlib.reload(blender_tunnels)
print("portals", blender_tunnels.build(D, tz, new_obj, mat, srgb, box_seg, pillar))
import blender_railworks; importlib.reload(blender_railworks)
print("gantries", blender_railworks.build(D, tz, new_obj, mat, srgb, box_seg, pillar, WATER_Z))
new_obj("Bridges_Viaducts", bm_b, "04_Bridges", [M["bridge"]])
new_obj("Bridges_Rail_JR", bm_rb, "04_Bridges", [M["bridge"]])
new_obj("Viaduct_Chuo_Brick", bm_brick, "04_Bridges", [mat("WB_Brick", srgb("#9A4B36")), mat("WB_NicheDark", srgb("#4E4A44"))])
new_obj("Bridge_Sobu_Steel", bm_sobu, "04_Bridges", [mat("WB_SteelBlue", srgb("#6F8796")), mat("WB_SteelBlue", srgb("#6F8796"))])
new_obj("Rail_RaisedBed_Walls", bm_fill, "02_RetainingWalls", [mat("WB_Wall", srgb("#9C978E"))])
new_obj("Bridge_Marunouchi_SteelBoxGirder", bm_mb, "04_Bridges", [mat("WB_SteelLight", srgb("#DCDFE1"), rough=0.4, metal=0.2), M["wall"]])

# revetment walls (護岸) along the channel
bm_rv = bmesh.new()
for ringp in REVET:
    if len(ringp) < 2: continue
    top = [bm_rv.verts.new((x, y, zt)) for x, y, zt in ringp]
    bot = [bm_rv.verts.new((x, y, META["bed_z"] - 0.5)) for x, y, zt in ringp]
    cap = [bm_rv.verts.new((x, y, zt)) for x, y, zt in ringp]
    for i in range(len(ringp) - 1):
        if math.dist(ringp[i][:2], ringp[i + 1][:2]) > 8: continue   # gap where the ring left the scene bounds
        bm_rv.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
new_obj("Revetment_Walls", bm_rv, "02_RetainingWalls", [M["wall"]])

# underground pedestrian passages (OSM tunnel footways; depth 推定)
bm_w = bmesh.new()
for r in D["underground"]:
    ribbon(bm_w, r["pts"], max(r["width"], 4.0), 0.0, mi=0, thick=0.4)
    ribbon(bm_w, r["pts"], max(r["width"], 4.0) + 0.6, 3.2, mi=0, thick=3.2)
new_obj("Underground_Passages", bm_w, "11_Underground", [M["ug_walk"]])

# ---------------------------------------------------------------- platforms + canopies
bm_p = bmesh.new()
# platform top = train floor: adjacent rail head (after the at-grade rail lift above) + 1.0 m
_lift_pts = [(p_[0], p_[1], min(p_[2] + 1.5, max(p_[2], tz(p_[0], p_[1]) + 0.35)) + 0.18)
             for r in D["rails"] if r["cls"] == "rail" and not r["bridge"] and not r["tunnel"] for p_ in r["pts"]]
for p in D["platforms"]:
    if p["underground"] or not _lift_pts: continue
    cx_ = sum(x for x, _ in p["poly"]) / len(p["poly"]); cy_ = sum(y for _, y in p["poly"]) / len(p["poly"])
    near_ = sorted(_lift_pts, key=lambda q: (q[0] - cx_) ** 2 + (q[1] - cy_) ** 2)[:8]
    p["z"] = round(sorted(q[2] for q in near_)[len(near_) // 2] + 1.0, 2)
for p in D["platforms"]:
    if p["underground"]: continue
    z = p["z"]
    ring_ = p["poly"]
    vb = [bm_p.verts.new((x, y, min(z - 1.15, tz(x, y) - 0.3))) for x, y in ring_]; vt = [bm_p.verts.new((x, y, z)) for x, y in ring_]
    try:
        bm_p.faces.new(vt).material_index = 0
        for i in range(len(ring_)):
            bm_p.faces.new((vb[i], vb[(i + 1) % len(ring_)], vt[(i + 1) % len(ring_)], vt[i])).material_index = 0
    except ValueError: pass
    # canopy (推定 height 3.6 m)
    continue
    cr = p.get("canopy_poly") or ring_
    cvb = [bm_p.verts.new((x, y, z + 3.6)) for x, y in cr]; cvt = [bm_p.verts.new((x, y, z + 3.9)) for x, y in cr]
    try:
        bm_p.faces.new(cvt).material_index = 1; bm_p.faces.new(list(reversed(cvb))).material_index = 1
        for i in range(len(cr)):
            bm_p.faces.new((cvb[i], cvb[(i + 1) % len(cr)], cvt[(i + 1) % len(cr)], cvt[i])).material_index = 1
    except ValueError: pass
new_obj("JR_Platforms", bm_p, "07_Platforms", [M["platform"], M["canopy"]])

# ---------------------------------------------------------------- buildings
import random as _rb
def _pip(x, y, ring):
    ins = False; n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: ins = not ins
    return ins
def _area(ring):
    return abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))) / 2
bm_eq = bmesh.new(); bm_hip = bmesh.new()
for k, b in enumerate(D["buildings"]):
    BB = META["bounds"]
    ring_ = [[min(max(x, BB[0] + 0.6), BB[2] - 0.6), min(max(y, BB[1] + 0.6), BB[3] - 0.6)] for x, y in b["poly"]]
    if len(ring_) < 3: continue
    bm = bmesh.new()
    z0, z1 = b["base"] - 0.3, b["top"]
    if b.get("over_track") and b.get("canopy") and any(
            not p_["underground"] and _pip(sum(x for x, _ in b["poly"]) / len(b["poly"]), sum(y for _, y in b["poly"]) / len(b["poly"]), p_["poly"])
            or min(math.dist(q_, (sum(x for x, _ in b["poly"]) / len(b["poly"]), sum(y for _, y in b["poly"]) / len(b["poly"]))) for q_ in p_["poly"]) < 25
            for p_ in D["platforms"] if not p_["underground"]):
        bm.free(); continue          # PLATEAU's one-slab platform roof: replaced by per-platform canopies (blender_station)
    if b.get("over_track"):
        dk = b["deck_z"]
        if b.get("canopy"):          # platform roof (上屋): thin slab 5.2 m over rail level on columns (推定)
            z1 = dk + 5.6; z0 = dk + 5.0
            for i in range(0, len(ring_), max(1, len(ring_) // 8)):
                x, y = ring_[i]
                pillar(bm, x, y, dk, z0, 0.5, 0.5, 0.0, 0)
        elif z1 < dk + 1.0:          # under a viaduct: stop below the deck
            z1 = min(z1, dk - 1.8)
        else:                        # straddles the tracks: lift the volume, stand it on columns (推定)
            z0 = max(z0, dk + 6.3)
            for i in range(0, len(ring_), max(1, len(ring_) // 6)):
                x, y = ring_[i]
                pillar(bm, x, y, b["base"] - 0.3, z0, 1.0, 1.0, 0.0, 0)
    if b.get("roof") == "dome":      # OSM roof:shape=dome: drum up to the springing line, hemisphere on top
        cx_ = sum(x for x, _ in ring_) / len(ring_); cy_ = sum(y for _, y in ring_) / len(ring_)
        r_ = min(min(math.dist((cx_, cy_), q) for q in ring_), (z1 - z0) * 0.45)
        z1 = z1 - r_
        res = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r_)
        for v in res["verts"]:
            v.co.z = max(v.co.z, 0.0); v.co += Vector((cx_, cy_, z1))
    if z1 - z0 < 0.5: bm.free(); continue
    vb = [bm.verts.new((x, y, z0)) for x, y in ring_]
    vt = [bm.verts.new((x, y, z1)) for x, y in ring_]
    try:
        ftop = bm.faces.new(vt); bm.faces.new(list(reversed(vb)))
        for i in range(len(ring_)):  # walls
            bm.faces.new((vb[i], vb[(i + 1) % len(ring_)], vt[(i + 1) % len(ring_)], vt[i]))
    except ValueError:
        bm.free(); continue
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # ---- Phase 2 roof detail (推定: parapet height, equipment layout are generic, seeded per building)
    rb = _rb.Random(k * 7919)
    cxb = sum(x for x, _ in ring_) / len(ring_); cyb = sum(y for _, y in ring_) / len(ring_)
    hgt = z1 - z0; area = _area(ring_)
    seido = 30 < cxb < 125 and 50 < cyb < 135 and hgt < 22 and (b.get("osm_building") or "") not in ("apartments", "residential")
    special = b.get("over_track") or b.get("roof") == "dome"
    def _fill_ratio():
        e_ = max(range(len(ring_)), key=lambda i: math.dist(ring_[i], ring_[(i + 1) % len(ring_)]))
        ax_ = Vector((ring_[(e_ + 1) % len(ring_)][0] - ring_[e_][0], ring_[(e_ + 1) % len(ring_)][1] - ring_[e_][1], 0)).normalized()
        ay_ = Vector((-ax_.y, ax_.x, 0))
        us_ = [Vector((x - cxb, y - cyb, 0)).dot(ax_) for x, y in ring_]; vs2 = [Vector((x - cxb, y - cyb, 0)).dot(ay_) for x, y in ring_]
        return area / max((max(us_) - min(us_)) * (max(vs2) - min(vs2)), 1e-6)
    if seido and area > 60 and _fill_ratio() > 0.75:
        # 湯島聖堂: hipped roof (green copper) over the oriented bounding box, ridge along the long axis
        e_best = max(range(len(ring_)), key=lambda i: math.dist(ring_[i], ring_[(i + 1) % len(ring_)]))
        ax = Vector((ring_[(e_best + 1) % len(ring_)][0] - ring_[e_best][0], ring_[(e_best + 1) % len(ring_)][1] - ring_[e_best][1], 0)).normalized()
        ay = Vector((-ax.y, ax.x, 0))
        us = [Vector((x - cxb, y - cyb, 0)).dot(ax) for x, y in ring_]; vs_ = [Vector((x - cxb, y - cyb, 0)).dot(ay) for x, y in ring_]
        u0, u1, v0, v1 = min(us) - 1.2, max(us) + 1.2, min(vs_) - 1.2, max(vs_) + 1.2        # eaves overhang
        C0 = Vector((cxb, cyb, z1)); rise = 0.42 * (v1 - v0)
        P_ = lambda u, v, z: C0 + ax * u + ay * v + Vector((0, 0, z))
        hw = (v1 - v0) / 2; vm = (v0 + v1) / 2
        e = [P_(u0, v0, -0.4), P_(u1, v0, -0.4), P_(u1, v1, -0.4), P_(u0, v1, -0.4)]
        r_ = [P_(u0 + hw * 0.8, vm, rise), P_(u1 - hw * 0.8, vm, rise)]
        E = [bm_hip.verts.new(v) for v in e]; Rr = [bm_hip.verts.new(v) for v in r_]
        for f in ((E[0], E[1], Rr[1], Rr[0]), (E[2], E[3], Rr[0], Rr[1]), (E[1], E[2], Rr[1]), (E[3], E[0], Rr[0])):
            bm_hip.faces.new(f)
        bm_hip.faces.new(list(reversed(E)))
    elif not special and hgt > 4 and area > 25:
        # parapet: inset the roof face, push the inner part down 0.9 m
        ins = bmesh.ops.inset_region(bm, faces=[ftop], thickness=0.3, depth=0.0, use_even_offset=True)
        for f in ins["faces"]: f.material_index = 1
        ext = bmesh.ops.extrude_face_region(bm, geom=[ftop])
        nf = [g_ for g_ in ext["geom"] if isinstance(g_, bmesh.types.BMFace)]
        nv = [g_ for g_ in ext["geom"] if isinstance(g_, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=nv, vec=(0, 0, -0.9))
        for f in bm.faces:
            if f.material_index != 1 and f not in nf and abs(f.normal.z) < 0.5 and f.calc_center_median().z > z1 - 0.95:
                f.material_index = 1
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # rooftop equipment: elevator room, AC / tank boxes, water tank (residential)
        roof_z = z1 - 0.9
        n_eq = min(8, int(area / 140) + rb.randint(0, 2))
        placed = 0; tries = 0
        while placed < n_eq and tries < 40:
            tries += 1
            px = cxb + rb.uniform(-1, 1) * math.sqrt(area) * 0.4; py = cyb + rb.uniform(-1, 1) * math.sqrt(area) * 0.4
            sz = rb.uniform(1.5, 4.0) if placed else min(5.0, math.sqrt(area) * 0.3)
            if not all(_pip(px + dx, py + dy, ring_) for dx in (-sz, sz) for dy in (-sz, sz)): continue
            if placed == 0 and hgt > 15:
                pillar(bm_eq, px, py, roof_z, roof_z + 3.4, sz, sz * 1.2, rb.uniform(0, 3.14), 0)      # elevator machine room
            elif (b.get("osm_building") in ("apartments", "residential")) and rb.random() < 0.4:
                res_ = bmesh.ops.create_cone(bm_eq, cap_ends=True, segments=10, radius1=1.1, radius2=1.1, depth=2.2)
                for v in res_["verts"]: v.co += Vector((px, py, roof_z + 2.0))
                for f in {f for v in res_["verts"] for f in v.link_faces}: f.material_index = 1
                pillar(bm_eq, px, py, roof_z, roof_z + 0.9, 1.6, 1.6, 0.0, 0)
            else:
                pillar(bm_eq, px, py, roof_z, roof_z + rb.uniform(0.9, 2.2), sz, sz * rb.uniform(0.5, 1.0), rb.uniform(0, 3.14), 0)
            placed += 1
    lm = b.get("landmark")
    name = f"LM_{lm}_{k}" if lm else f"B_{k:04d}"
    ob = new_obj(name, bm, "09_Landmarks" if lm else "08_Buildings", [M["landmark"] if lm else M["bldg"], mat("WB_Parapet", srgb("#BDB8AE"))])
    ob["name_ja"] = b.get("name") or ""
    ob["height_src"] = b["height_src"]; ob["base_z"] = b["base"]; ob["top_z"] = b["top"]; ob["plateau_id"] = b["id"]
    if b.get("part_of"): ob["part_of"] = b["part_of"]
    ob["osm_building"] = b.get("osm_building") or ""
    ob["height_m"] = float(b["top"] - b["base"])

new_obj("Rooftop_Equipment", bm_eq, "08_Buildings", [mat("WB_RoofEquip", srgb("#A3A5A6")), mat("WB_WaterTank", srgb("#D9D4C7"))])
new_obj("Seido_HipRoofs", bm_hip, "09_Landmarks", [mat("WB_CopperRoof", srgb("#6FA393"))])

# ---------------------------------------------------------------- trees (autumn)
# street trees (tree_row / natural=tree placeholders) = ginkgo yellow; groves = mixed maple / orange / evergreen
import random as _rnd
_rnd.seed(11)
AUTUMN = [mat("WB_Ginkgo", srgb("#E6B53A")), mat("WB_Maple", srgb("#C9472F")), mat("WB_Orange", srgb("#DD7A2C")),
          mat("WB_Evergreen", srgb("#6F8A52"))]
bm_t = bmesh.new()
for x, y, z, h, r in D["trees"]:
    street = (abs(h - 9.0) < 1e-6 and abs(r - 3.0) < 1e-6) or (abs(h - 8.0) < 1e-6 and abs(r - 2.6) < 1e-6)
    col = 0 if street else _rnd.choices([0, 1, 2, 3], weights=[0.30, 0.22, 0.23, 0.25])[0]
    pillar(bm_t, x, y, z - 0.2, z + h - r * 1.2, 0.45, 0.45, 0.0, 0)
    if col == 3:      # evergreen: two stacked cones
        for rr_, zc_ in ((r * 1.05, h - r * 1.4), (r * 0.75, h - r * 0.6)):
            res = bmesh.ops.create_cone(bm_t, cap_ends=True, segments=8, radius1=rr_, radius2=0.0, depth=r * 1.3)
            for v in res["verts"]: v.co += Vector((x, y, z + zc_))
            for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = 1 + col
        continue
    res = bmesh.ops.create_icosphere(bm_t, subdivisions=2 if col in (1, 2) else 1, radius=r)
    sx_, sz_ = (0.72, 1.35) if col == 0 else (1.12, 0.82)          # ginkgo: tall oval; maple/orange: wide dome
    for v in res["verts"]:
        v.co.x *= sx_; v.co.y *= sx_; v.co.z *= sz_; v.co += Vector((x, y, z + h - r * sz_))
    for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = 1 + col
new_obj("Trees_Placeholder", bm_t, "10_Vegetation", [M["trunk"]] + AUTUMN)

# nav layer (hidden in renders)
new_obj("Walkable_Surfaces", bm_nav, "12_Walkable_Nav", [M["nav"]])

# detailed ソラシティ B1 sunken plaza
import importlib, sys
sys.path.insert(0, ROOT)
import blender_sola_plaza; importlib.reload(blender_sola_plaza)
import blender_shops; importlib.reload(blender_shops)
print("shops", blender_shops.build(D, tz, new_obj, mat, srgb, box_seg))
import blender_landmarks; importlib.reload(blender_landmarks)
def _to_local(lat, lon, _lat0=35.69975, _lon0=139.76555):   # same projection as geo.py (Blender has no PIL)
    return ((lon - _lon0) * 111320.0 * math.cos(math.radians(_lat0)), (lat - _lat0) * 110574.0)
blender_landmarks.build(D, os.path.join(ROOT, "..", "data"), COL, new_obj, mat, srgb, box_seg, pillar, tz, _to_local)
blender_sola_plaza.build_sola_plaza(D.get("sola_plaza"), COL, M, mat, srgb, new_obj, box_seg, pillar)
import vehicle_paths; importlib.reload(vehicle_paths)
import blender_vehicles; importlib.reload(blender_vehicles)
print("vehicles", blender_vehicles.build(D, tz, sc, mat, srgb, os.path.join(ROOT, "..", "out", "vehicles.json")))
import blender_station; importlib.reload(blender_station)
print("station", blender_station.build(D, tz, sc, COL, mat, srgb, os.path.join(ROOT, "..", "out", "signs")))
import blender_signals; importlib.reload(blender_signals)
print("signals", blender_signals.build(D, sc, mat, srgb, os.path.join(ROOT, "..", "out", "signals.json")))
for name in ("11_Underground", "12_Walkable_Nav"):
    COL[name].hide_render = True
    for lc in bpy.context.view_layer.layer_collection.children:
        if lc.name == name: lc.hide_viewport = True
print("built", len(sc.collection.all_objects), "objects")

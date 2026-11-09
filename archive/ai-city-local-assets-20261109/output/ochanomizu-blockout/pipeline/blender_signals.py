"""Japanese traffic signals at both ends of every zebra crossing, with an animated two-phase cycle.

Per crossing (kerb-to-kerb span from road_areas): one grey pole on the sidewalk just beyond each end.
  pedestrian signal (歩行者用): vertical box, red "stop" lens over blue-green "walk" lens, facing the far end
  vehicle signal (車両用): horizontal box on an arm over the lane, 青・黄・赤 left to right as the driver sees it,
  facing traffic that approaches the crossing (left-hand traffic: the head hangs over the left lane)
Phases: crossings are split into two road groups by the crossed road's direction (A / B). 40 s cycle, 24 fps:
  road A  青 0-16 s, 黄 16-19, 赤 19-40     road B  赤 0-21, 青 21-36, 黄 36-39, 赤 39-40 (all-red 19-21, 39-40)
  pedestrians crossing road A walk 21-31 s, blink 31-35; crossing road B walk 0.5-11, blink 11-15
Lamps are shared materials (SG_*) whose emission strength is keyframed (constant, looping). Timing is 推定.
"""
import bpy, bmesh, math, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

FPS = 24
CYCLE = 40.0
ON = 14.0
COLORS = {"G": "#00C2A8", "Y": "#FFB000", "R": "#FF2A1E"}


def _blink(t0, t1, period=0.5):
    out = []; t = t0
    while t < t1:
        out.append((t, min(t + period, t1))); t += 2 * period
    return out


TIMING = {   # material -> list of (start s, end s) when lit
    "SG_VehA_G": [(0, 16)], "SG_VehA_Y": [(16, 19)], "SG_VehA_R": [(19, 40)],
    "SG_VehB_G": [(21, 36)], "SG_VehB_Y": [(36, 39)], "SG_VehB_R": [(0, 21), (39, 40)],
    "SG_PedA_G": [(21, 31)] + _blink(31, 35), "SG_PedA_R": [(0, 21), (35, 40)],
    "SG_PedB_G": [(0.5, 11)] + _blink(11, 15), "SG_PedB_R": [(0, 0.5), (15, 40)],
}


def _fcurves(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action: return []
    act = ad.action
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out += list(cb.fcurves)
    return out


def lamp_material(name, srgb):
    col = srgb(COLORS[name[-1]])
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (col[0] * 0.12, col[1] * 0.12, col[2] * 0.12, 1)
    p.inputs["Roughness"].default_value = 0.25
    for key in ("Emission Color", "Emission"):
        if key in p.inputs: p.inputs[key].default_value = (*col, 1); break
    es = p.inputs["Emission Strength"]
    lit = TIMING[name]
    marks = sorted({0.0, CYCLE} | {t for iv in lit for t in iv})
    for t in marks:
        on = any(a <= t < b for a, b in lit)
        es.default_value = ON if on else 0.0
        es.keyframe_insert("default_value", frame=1 + round(t * FPS))
    for fc in _fcurves(m.node_tree):
        for k in fc.keyframe_points: k.interpolation = "CONSTANT"
        if not any(md.type == "CYCLES" for md in fc.modifiers): fc.modifiers.new("CYCLES")
    m.diffuse_color = (*col, 1)
    return m


def build(D, sc, mat, srgb, out_json=None):
    RA = D.get("road_areas") or {}
    cr = RA.get("crossings", [])
    if not cr: return 0
    roads_ob = bpy.data.objects.get("Roads")
    me = roads_ob.data
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    ter = [o for o in bpy.data.collections["00_Terrain"].objects if o.type == "MESH"]
    tbvh = [BVHTree.FromPolygons([v.co.copy() for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons]) for o in ter]

    def ground(x, y):
        hit = bvh.ray_cast(Vector((x, y, 200.0)), Vector((0, 0, -1)), 400.0)
        if hit[0] is not None: return hit[0].z
        hs = [h[0].z for h in (t.ray_cast(Vector((x, y, 200.0)), Vector((0, 0, -1)), 400.0) for t in tbvh) if h[0] is not None]
        return max(hs) if hs else None                   # pole off the paved area: stand on the terrain

    # road groups: crossed-road direction vs the dominant street grid (doubled-angle mean)
    th = []
    for c in cr:
        u = Vector((c["b"][0] - c["a"][0], c["b"][1] - c["a"][1], 0)).normalized()
        th.append(math.atan2(u.x, -u.y))                  # road direction = crossing direction rotated 90°
    th0 = 0.5 * math.atan2(sum(math.sin(2 * t) for t in th), sum(math.cos(2 * t) for t in th))

    M = {k: lamp_material(k, srgb) for k in TIMING}
    m_pole = mat("SG_Pole", srgb("#A3A7AB"), rough=0.45, metal=0.5)
    m_box = mat("SG_Housing", srgb("#5B5F63"), rough=0.5, metal=0.3)
    mats = [m_pole, m_box] + [M[k] for k in TIMING]
    MI = {k: i + 2 for i, k in enumerate(TIMING)}

    bm = bmesh.new()

    def cuboid(c, fwd, w, d, h, mi):
        """box centred at c; fwd = facing direction (2D), w across, d deep, h tall"""
        f = Vector((fwd.x, fwd.y, 0)).normalized(); r = Vector((f.y, -f.x, 0))
        vs = []
        for sz in (-1, 1):
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                vs.append(bm.verts.new(c + r * sx * w / 2 + f * sy * d / 2 + Vector((0, 0, sz * h / 2))))
        b, t = vs[:4], vs[4:]
        for q in (b[::-1], t, *[[b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]] for i in range(4)]):
            bm.faces.new(q).material_index = mi

    def lens(c, fwd, w, h, mi):
        cuboid(c, fwd, w, 0.04, h, mi)
        hood = c + Vector((fwd.x, fwd.y, 0)).normalized() * 0.08 + Vector((0, 0, h / 2 + 0.02))
        cuboid(hood, fwd, w + 0.04, 0.16, 0.03, 1)               # visor

    rec = []
    poles = 0
    for c, t in zip(cr, th):
        g = "A" if abs(math.cos(t - th0)) >= abs(math.sin(t - th0)) else "B"
        a = Vector((*c["a"], 0)); b = Vector((*c["b"], 0)); mid = (a + b) / 2
        u = (b - a).normalized(); rd = Vector((u.y, -u.x, 0))      # road direction (one of the two)
        half = (b - a).length / 2
        for E, o in ((a, -u), (b, u)):
            P = E + o * 1.0 + rd * 2.6                            # beside the crossing, on the sidewalk
            z = ground(P.x, P.y)
            if z is None: continue
            poles += 1
            # pole
            vb = [bm.verts.new((P.x + dx, P.y + dy, z)) for dx, dy in ((-.1, -.1), (.1, -.1), (.1, .1), (-.1, .1))]
            vt = [bm.verts.new((v.co.x, v.co.y, z + 5.4)) for v in vb]
            for i in range(4): bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i])).material_index = 0
            bm.faces.new(vt).material_index = 0
            # pedestrian head facing the far end (-o)
            f = -o
            hc = P + f * 0.2 + Vector((0, 0, z + 2.75))
            cuboid(hc, f, 0.36, 0.22, 0.8, 1)
            lens(hc + f * 0.13 + Vector((0, 0, 0.19)), f, 0.28, 0.3, MI["SG_Ped%s_R" % g])
            lens(hc + f * 0.13 + Vector((0, 0, -0.19)), f, 0.28, 0.3, MI["SG_Ped%s_G" % g])
            # vehicle head: for traffic d whose LEFT side is this end; hangs over the left lane, faces -d
            for d in (rd, -rd):
                left = Vector((-d.y, d.x, 0))
                if (E - mid).dot(left) <= 0: continue
                arm = 1.0 + max(half - 1.5, 0.6)
                tip = P - o * arm + Vector((0, 0, z + 5.2))
                base = P + Vector((0, 0, z + 5.2))
                cuboid((base + tip) / 2, Vector((o.y, -o.x, 0)), arm, 0.12, 0.12, 0)
                hv = tip + Vector((0, 0, -0.3))
                fv = -d
                cuboid(hv, fv, 1.25, 0.25, 0.42, 1)
                for k, col in ((-1, "G"), (0, "Y"), (1, "R")):      # driver sees 青 黄 赤 left to right
                    lc = hv + fv * 0.14 + left * (0.4 * -k)
                    lens(lc, fv, 0.3, 0.3, MI["SG_Veh%s_%s" % (g, col)])
                rec.append(dict(kind="vehicle", group=g, pos=[round(hv.x, 2), round(hv.y, 2), round(hv.z, 2)],
                                facing=[round(fv.x, 3), round(fv.y, 3)], crossing=c["id"]))
            rec.append(dict(kind="pedestrian", group=g, pos=[round(hc.x, 2), round(hc.y, 2), round(hc.z, 2)],
                            facing=[round(f.x, 3), round(f.y, 3)], crossing=c["id"]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me2 = bpy.data.meshes.new("Traffic_Signals"); bm.to_mesh(me2); bm.free()
    for m in mats: me2.materials.append(m)
    ob = bpy.data.objects.new("Traffic_Signals", me2)
    col = bpy.data.collections.get("15_Signage") or bpy.data.collections.new("15_Signage")
    if col.name not in [c_.name for c_ in sc.collection.children]: sc.collection.children.link(col)
    col.objects.link(ob)
    sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = int(CYCLE * FPS)
    if out_json:
        json.dump(dict(fps=FPS, cycle_s=CYCLE, timing_s=TIMING, groups="A/B = crossed road direction", heads=rec,
                       note="青 = blue-green 'go'; vehicle heads read 青・黄・赤 left to right; timing 推定"),
                  open(out_json, "w", encoding="utf8"), ensure_ascii=False)
    return dict(crossings=len(cr), poles=poles, heads=len(rec))

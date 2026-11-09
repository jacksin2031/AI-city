"""Blender: detailed ソラシティ B1 sunken plaza (called from blender_build.py with its helpers in scope)."""
import bpy, bmesh, math
from mathutils import Vector


def build_sola_plaza(SP, COL, M, mat, srgb, new_obj, box_seg, pillar):
    if not SP:
        return
    # cut the DEM heightfield exactly along the plaza / stair / escalator outline (Exact boolean)
    ter = bpy.data.objects["Terrain_DEM5A"]
    cbm = bmesh.new()
    hb = [cbm.verts.new((x, y, SP["floor_z"] - 0.2)) for x, y in SP["hole"]]
    ht = [cbm.verts.new((x, y, 60.0)) for x, y in SP["hole"]]
    cbm.faces.new(list(reversed(hb))); cbm.faces.new(ht)
    for i in range(len(hb)):
        cbm.faces.new((hb[i], hb[(i + 1) % len(hb)], ht[(i + 1) % len(hb)], ht[i]))
    bmesh.ops.recalc_face_normals(cbm, faces=cbm.faces)
    cme = bpy.data.meshes.new("SP_Cutter"); cbm.to_mesh(cme); cbm.free()
    cutter = bpy.data.objects.new("SP_Cutter", cme)
    bpy.context.scene.collection.objects.link(cutter)
    mod = ter.modifiers.new("SP_Cut", "BOOLEAN"); mod.operation = "DIFFERENCE"; mod.object = cutter
    try: mod.solver = "EXACT"
    except TypeError: pass
    with bpy.context.temp_override(object=ter, active_object=ter, selected_objects=[ter]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    while len(ter.data.materials) and ter.data.materials[-1] is None:   # boolean adds an empty slot
        ter.data.materials.pop()

    col = bpy.data.collections.new("13_Detail_SolaSunkenPlaza")
    bpy.context.scene.collection.children.link(col)
    COL["13_Detail_SolaSunkenPlaza"] = col
    glass = mat("WB_GlassDark", srgb("#62737C"), rough=0.08, metal=0.1)
    rail = mat("WB_GlassRail", srgb("#C9D6DA"), rough=0.1)
    metal = mat("WB_Metal", srgb("#A7AAAD"), rough=0.35, metal=0.6)
    paving = mat("WB_PlazaPaving", srgb("#E9E2D3"))
    fz = SP["floor_z"]

    # ---------------- floor slab (whole cut-out: plaza + escalator / stair shafts)
    bm = bmesh.new()
    top = [bm.verts.new((x, y, fz)) for x, y in SP["hole"]]
    bot = [bm.verts.new((x, y, fz - 0.6)) for x, y in SP["hole"]]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    n = len(top)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    new_obj("SP_Floor_B1", bm, "13_Detail_SolaSunkenPlaza", [paving])

    # ---------------- retaining walls: openings for escalator / stairs (full height) and the concourse link (lintel)
    lw = SP["link"]["width"]
    bm = bmesh.new()
    def parapet(g0, g1, z):
        g0 = g0.copy(); g1 = g1.copy(); g0.z = g1.z = z
        box_seg(bm, g0, g1, 0.08, 1.1, 2)
        box_seg(bm, g0 + Vector((0, 0, 1.1)), g1 + Vector((0, 0, 1.1)), 0.14, 0.06, 3)
    for e in SP["edges"]:
        if e["kind"] == "facade":
            continue
        a = Vector((e["a"][0], e["a"][1], fz)); b = Vector((e["b"][0], e["b"][1], fz))
        topz = e["top"]; out = Vector((e["out"][0], e["out"][1], 0))
        L = (b - a).length
        if L < 0.05: continue
        d = (b - a).normalized()
        cuts = []
        for op in SP["openings"]:
            q = Vector((op["p"][0], op["p"][1], fz))
            t = (q - a).dot(d)
            if -0.5 < t < L + 0.5 and ((a + d * t) - q).length < 1.5:
                cuts.append((t - op["w"] / 2, t + op["w"] / 2, op.get("lintel")))
        cuts.sort()
        spans, s = [], 0.0
        for c0, c1, lin in cuts:
            if c0 > s: spans.append((s, c0))
            if lin:   # lintel + wall above the doorway
                p0 = a + d * max(0.0, c0) + out * 0.25; p1 = a + d * min(L, c1) + out * 0.25
                p0.z = p1.z = fz + lin
                box_seg(bm, p0, p1, 0.5, topz - (fz + lin), 0)
                parapet(a + d * max(0.0, c0) + out * 0.3, a + d * min(L, c1) + out * 0.3, topz)
            s = max(s, c1)
        if s < L: spans.append((s, L))
        for s0, s1 in spans:
            if s1 - s0 < 0.1: continue
            p0 = a + d * s0 + out * 0.25; p1 = a + d * s1 + out * 0.25
            p0.z = p1.z = fz - 0.3
            box_seg(bm, p0, p1, 0.5, topz - fz + 0.3, 0)
            parapet(a + d * s0 + out * 0.3, a + d * s1 + out * 0.3, topz)
    for w in SP.get("corridor_walls", []):   # side walls of the escalator / stair shafts
        a = Vector((w["a"][0], w["a"][1], fz - 0.3)); b = Vector((w["b"][0], w["b"][1], fz - 0.3))
        box_seg(bm, a, b, 0.4, w["top"] - fz + 0.3, 0)
        if w["kind"] != "escalator":   # escalator balustrades already guard its shaft
            parapet(a, b, w["top"])
    new_obj("SP_RetainingWalls_Parapets", bm, "13_Detail_SolaSunkenPlaza", [M["wall"], M["plaza"], rail, metal])

    # ---------------- B1 storefront along the tower face + canopy (推定)
    bm = bmesh.new()
    for e in SP["edges"]:
        if e["kind"] != "facade":
            continue
        a = Vector((e["a"][0], e["a"][1], fz)); b = Vector((e["b"][0], e["b"][1], fz))
        d = (b - a); L = d.length; d.normalize()
        out = Vector((e["out"][0], e["out"][1], 0))
        # out points away from the plaza; storefront faces the plaza
        inn = -out
        g0 = a + inn * 0.15; g1 = b + inn * 0.15
        box_seg(bm, g0, g1, 0.12, 4.6, 0)                       # glazing
        k = max(1, int(L / 3.0))
        for i in range(k + 1):                                   # mullions every ~3 m
            p = a + d * (L * i / k) + inn * 0.3
            pillar(bm, p.x, p.y, fz, fz + 4.6, 0.25, 0.25, math.atan2(d.y, d.x), 1)
        c0 = a + inn * 1.4; c1 = b + inn * 1.4
        c0.z = c1.z = fz + 4.6
        box_seg(bm, c0, c1, 2.8, 0.3, 1)                         # canopy
    new_obj("SP_Storefront_B1", bm, "13_Detail_SolaSunkenPlaza", [glass, metal])

    # ---------------- escalator pair (OSM 361740935): truss, stepped treads, balustrades
    es = SP["escalator"]
    t = Vector(es["top"]); bt = Vector(es["bottom"])
    horiz = Vector((bt.x - t.x, bt.y - t.y, 0)); run = horiz.length; hd = horiz.normalized()
    side = Vector((-hd.y, hd.x, 0))
    w = es["width"]
    bm = bmesh.new()
    rise = t.z - bt.z
    # landings 2.5 m at each end
    pt0 = t - hd * 2.5; pt0.z = t.z
    pt0 = t - hd * 3.2; pt0.z = t.z
    box_seg(bm, pt0 + Vector((0, 0, 0.06)), t + Vector((0, 0, 0.06)), w + 1.4, 0.0, 2, z0=t.z - 6.0)   # top landing + pit cover
    pb1 = bt + hd * 2.5; pb1.z = bt.z
    box_seg(bm, bt + Vector((0, 0, 0.06)), pb1 + Vector((0, 0, 0.06)), w + 0.6, 0.0, 2, z0=bt.z - 0.4)
    # truss underside (solid sloped beam)
    box_seg(bm, Vector((t.x, t.y, t.z - 1.1)), Vector((bt.x, bt.y, bt.z - 1.1)), w, 1.1, 0)
    nsteps = max(4, int(rise / 0.2))
    for i in range(nsteps):
        f0 = i / nsteps; f1 = (i + 1) / nsteps
        q0 = t + (bt - t) * f0; q1 = t + (bt - t) * f1
        tread_z = q1.z
        a_ = Vector((q0.x, q0.y, tread_z)); b_ = Vector((q1.x, q1.y, tread_z))
        for off in (-w / 4, w / 4):  # two units (up + down)
            box_seg(bm, a_ + side * off, b_ + side * off, w / 2 - 0.3, 0.0, 1, z0=tread_z - (q0.z - q1.z) - 0.05)
    for off in (-w / 2, 0.0, w / 2):  # balustrades (outer + centre)
        a_ = Vector((t.x, t.y, t.z)) + side * off; b_ = Vector((bt.x, bt.y, bt.z)) + side * off
        box_seg(bm, a_, b_, 0.12, 1.0, 3)
        box_seg(bm, a_ + Vector((0, 0, 1.0)), b_ + Vector((0, 0, 1.0)), 0.18, 0.08, 1)
    new_obj("SP_Escalator", bm, "13_Detail_SolaSunkenPlaza", [metal, M["rail"], M["plaza"], rail])

    # ---------------- stairs to 淡路坂 (OSM 392721866): 165 mm risers, landing at each OSM vertex, cheek walls
    st = SP["stairs"]; pts = [Vector((x, y, 0)) for x, y in st["pts"]]
    lens = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(lens); z0, z1 = st["z0"], st["z1"]; w = st["width"]
    n_risers = max(1, round((z1 - z0) / 0.165))
    riser = (z1 - z0) / n_risers
    landing = 1.5
    flights = [max(0.5, L - landing) for L in lens]
    per = [max(1, round(n_risers * f / sum(flights))) for f in flights]
    per[-1] = n_risers - sum(per[:-1])
    bm = bmesh.new()
    z = z0
    for i, L in enumerate(lens):
        a = pts[i]; b = pts[i + 1]; d = (b - a).normalized(); sd = Vector((-d.y, d.x, 0))
        k = max(per[i], 1); tread = (L - (landing if i < len(lens) - 1 else 0.0)) / k
        for s in range(k):
            p0 = a + d * (s * tread); p1 = a + d * ((s + 1) * tread)
            z += riser
            box_seg(bm, Vector((p0.x, p0.y, z)), Vector((p1.x, p1.y, z)), w, 0.0, 0, z0=z0 - 0.3)
        if i < len(lens) - 1:   # landing
            p0 = a + d * (L - landing); p1 = b.copy()
            box_seg(bm, Vector((p0.x, p0.y, z)), Vector((p1.x, p1.y, z)), w, 0.0, 0, z0=z0 - 0.3)
    # cheek walls: sloped solids 1.0 m above the flight
    zz = z0
    for i, L in enumerate(lens):
        a = pts[i]; b = pts[i + 1]; d = (b - a).normalized(); sd = Vector((-d.y, d.x, 0))
        za = zz; zb = zz + riser * per[i]; zz = zb
        for sgn in (-1, 1):
            c0 = a + sd * sgn * (w / 2 + 0.2); c1 = b + sd * sgn * (w / 2 + 0.2)
            c0.z = za + 1.0; c1.z = zb + 1.0
            box_seg(bm, c0, c1, 0.3, 0.0, 1, z0=z0 - 0.3)
    new_obj("SP_Stairs_to_AwajiZaka", bm, "13_Detail_SolaSunkenPlaza", [M["steps"], M["wall"]])

    # ---------------- underground concourse (OSM 662223256, layer -1) + link through the wall (位置推定)
    bm = bmesh.new()
    cz = SP["concourse"]["z"]; cw = SP["concourse"]["width"]
    cp = SP["concourse"]["pts"]
    for (x0, y0), (x1, y1) in zip(cp, cp[1:]):
        box_seg(bm, Vector((x0, y0, cz - 0.4)), Vector((x1, y1, cz - 0.4)), cw, 0.4, 0)          # floor
        box_seg(bm, Vector((x0, y0, cz + 3.4)), Vector((x1, y1, cz + 3.4)), cw + 0.8, 0.5, 0)    # roof slab
    (x0, y0), (x1, y1) = SP["link"]["pts"]
    box_seg(bm, Vector((x0, y0, cz - 0.4)), Vector((x1, y1, cz - 0.4)), lw, 0.4, 0)
    box_seg(bm, Vector((x0, y0, cz + 3.6)), Vector((x1, y1, cz + 3.6)), lw + 0.8, 0.5, 0)
    ob = new_obj("SP_Concourse_ShinOchanomizu_B1", bm, "11_Underground", [M["ug_walk"]])

    # ---------------- walkable nav for the plaza
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, fz + 0.05)) for x, y in SP["poly"]]
    bm.faces.new(vs)
    for a_, b_, w_ in ((t, bt, es["width"]),):
        box_seg(bm, Vector((a_.x, a_.y, a_.z + 0.05)), Vector((b_.x, b_.y, b_.z + 0.05)), w_, 0.0, 0)
    zz = z0
    for i in range(len(pts) - 1):
        za = zz; zb = zz + riser * per[i]; zz = zb
        box_seg(bm, Vector((pts[i].x, pts[i].y, za + 0.05)), Vector((pts[i + 1].x, pts[i + 1].y, zb + 0.05)), st["width"], 0.0, 0)
    for (x0, y0), (x1, y1) in [SP["link"]["pts"]] + list(zip(cp, cp[1:])):
        box_seg(bm, Vector((x0, y0, cz + 0.05)), Vector((x1, y1, cz + 0.05)), lw, 0.0, 0)
    new_obj("Walkable_SolaPlaza", bm, "12_Walkable_Nav", [M["nav"]])

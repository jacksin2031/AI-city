"""JR 御茶ノ水駅: platform canopies (上屋) and station signs.

Platforms keep their real (OSM) position: they run from under the station building to beyond 聖橋.
PLATEAU records the platform roofs as one big slab over all tracks; it is replaced here by one canopy per island
platform on a centre row of columns, so platforms and trains stay visible between the roofs (canopy extent 推定:
from the station building's east side to 12 m short of the platform's east end).
Signs: JR East-style 駅名標 on the platforms (中央線快速 JC03 / 中央・総武線各停 JB18) and "JR 御茶ノ水駅" on the
station buildings (main building over the tracks, 御茶ノ水橋口, 聖橋口). Sign sizes are slightly enlarged (推定).
"""
import bpy, bmesh, math, os
from mathutils import Vector

FAM = {"中央本線": "rapid", "中央緩行線": "local", "総武緩行線": "local", "中央・総武緩行線": "local", "JR中央・総武緩行線": "local"}


def _sign_mat(name, path):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    img = bpy.data.images.load(path, check_existing=True)
    try: img.pack()
    except Exception: pass
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], p.inputs["Base Color"])
    for key in ("Emission Color", "Emission"):
        if key in p.inputs: nt.links.new(tex.outputs["Color"], p.inputs[key]); break
    if "Emission Strength" in p.inputs: p.inputs["Emission Strength"].default_value = 0.35   # backlit panel
    p.inputs["Roughness"].default_value = 0.4
    return m


def _quad(bm, uv, c, right, up, w, h, mi):
    """textured quad centred at c, facing right.cross(up)"""
    vs = [bm.verts.new(c + right * sx * w / 2 + up * sy * h / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs); f.material_index = mi
    for lp, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uv].uv = t
    return f


def _axis(ring):
    n = len(ring); cx = sum(x for x, _ in ring) / n; cy = sum(y for _, y in ring) / n
    sxx = sum((x - cx) ** 2 for x, _ in ring); syy = sum((y - cy) ** 2 for _, y in ring); sxy = sum((x - cx) * (y - cy) for x, y in ring)
    th = 0.5 * math.atan2(2 * sxy, sxx - syy)
    a = Vector((math.cos(th), math.sin(th), 0))
    if a.x < 0: a = -a                                      # axis points east
    return Vector((cx, cy, 0)), a


def _cross_section(ring, c, a, s):
    """interval (t0, t1) across the platform at axis station s (perpendicular line)"""
    nrm = Vector((-a.y, a.x, 0)); o = c + a * s
    ts = []
    for i in range(len(ring)):
        p = Vector((*ring[i], 0)); q = Vector((*ring[(i + 1) % len(ring)], 0))
        dp = (p - o).dot(a); dq = (q - o).dot(a)
        if (dp > 0) == (dq > 0) or dp == dq: continue
        f = dp / (dp - dq); x = p + (q - p) * f
        ts.append((x - o).dot(nrm))
    return (min(ts), max(ts)) if len(ts) >= 2 else None


def _facade_edge(ring, want):
    """longest edge whose outward normal points along `want` (2D unit vector)"""
    n = len(ring); area2 = sum(ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1] for i in range(n))
    best = None
    for i in range(n):
        p = Vector((*ring[i], 0)); q = Vector((*ring[(i + 1) % n], 0)); d = q - p; L = d.length
        if L < 3: continue
        d /= L; out = Vector((d.y, -d.x, 0)) if area2 > 0 else Vector((-d.y, d.x, 0))
        score = out.dot(want) * L
        if out.dot(want) > 0.5 and (best is None or score > best[0]): best = (score, (p + q) / 2, d, out, L)
    return best


def build(D, tz, sc, COL, mat, srgb, sign_dir):
    plats = [p for p in D["platforms"] if not p["underground"]]
    stn = [b for b in D["buildings"] if b.get("landmark") == "jr_ochanomizu_station"]
    main = max(stn, key=lambda b: abs(sum(b["poly"][i][0] * b["poly"][(i + 1) % len(b["poly"])][1] - b["poly"][(i + 1) % len(b["poly"])][0] * b["poly"][i][1] for i in range(len(b["poly"])))))
    main_east = max(x for x, _ in main["poly"])
    m_can = mat("WB_PlatformCanopy", srgb("#E9E7E1"), rough=0.6); m_col = mat("WB_CanopyColumn", srgb("#7D8288"), rough=0.5, metal=0.4)
    m_post = mat("WB_SignPost", srgb("#5D6166"), rough=0.5, metal=0.3)
    bm = bmesh.new(); uv = bm.loops.layers.uv.verify()
    sign_mats = {}
    def smi(key):
        if key not in sign_mats: sign_mats[key] = (len(sign_mats) + 3, _sign_mat("SIGN_" + key, os.path.join(sign_dir, key + ".png")))
        return sign_mats[key][0]
    rail_pts = []                                           # densified JR track points with their line family
    for r in D["rails"]:
        if r["tunnel"] or not FAM.get(r["line"] or ""): continue
        for a_, b_ in zip(r["pts"], r["pts"][1:]):
            k_ = max(1, int(math.dist(a_[:2], b_[:2]) / 2))
            rail_pts += [((a_[0] + (b_[0] - a_[0]) * i / k_, a_[1] + (b_[1] - a_[1]) * i / k_), FAM[r["line"]]) for i in range(k_)]

    def fam_at(q):
        return min(rail_pts, key=lambda t: (t[0][0] - q.x) ** 2 + (t[0][1] - q.y) ** 2)[1]
    n_boards = 0
    for P in plats:
        ring = P["poly"]; z = P["z"]
        c, a = _axis(ring)
        ss = [(Vector((x, y, 0)) - c).dot(a) for x, y in ring]; s0, s1 = min(ss), max(ss)
        nrm = Vector((-a.y, a.x, 0))
        # canopy: from the station building's east side to 12 m short of the east end (推定)
        cs0 = max(s0 + 2, (Vector((main_east, 0, 0)) - c).dot(a) - 4 if main_east > c.x + s0 else s0 + 2)
        cs1 = s1 - 12
        prev = None; k = 0
        s = cs0
        while s <= cs1 + 1e-6:
            cut = _cross_section(ring, c, a, s)
            if cut:
                t0, t1 = cut[0] + 0.3, cut[1] - 0.3
                o = c + a * s
                L_ = [o + nrm * t0 + Vector((0, 0, z + 3.75)), o + nrm * t1 + Vector((0, 0, z + 3.75))]
                cur = [bm.verts.new(v) for v in L_] + [bm.verts.new(v + Vector((0, 0, 0.22))) for v in L_]
                if prev:
                    for i0, i1 in ((2, 3), (1, 0), (0, 2), (3, 1)):
                        try: bm.faces.new((prev[i0], prev[i1], cur[i1], cur[i0])).material_index = 0
                        except ValueError: pass
                else:
                    bm.faces.new((cur[0], cur[1], cur[3], cur[2])).material_index = 0
                if k % 2 == 0:                                   # centre column every 10 m
                    m_ = o + nrm * (t0 + t1) / 2
                    for dz0, dz1, w in ((0.0, 3.75, 0.3),):
                        vb = [bm.verts.new((m_.x + sx * w / 2, m_.y + sy * w / 2, z + dz0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                        vt = [bm.verts.new((v.co.x, v.co.y, z + dz1)) for v in vb]
                        for i in range(4):
                            bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i])).material_index = 1
                prev = cur
            k += 1; s += 5.0
        if prev: bm.faces.new((prev[2], prev[3], prev[1], prev[0])).material_index = 0
        # 駅名標: four double-sided boards along the platform centre (one near each end, two under the roof)
        for f in (0.08, 0.36, 0.62, 0.95):
            s = s0 + (s1 - s0) * f
            cut = _cross_section(ring, c, a, s)
            if not cut: continue
            o = c + a * s + nrm * (cut[0] + cut[1]) / 2 + Vector((0, 0, z))
            for sx in (-1.0, 1.0):                               # two posts
                q = o + a * sx * 1.0
                vb = [bm.verts.new((q.x + dx, q.y + dy, z)) for dx, dy in ((-.05, -.05), (.05, -.05), (.05, .05), (-.05, .05))]
                vt = [bm.verts.new((v.co.x, v.co.y, z + 3.0)) for v in vb]
                for i in range(4): bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i])).material_index = 2
            up = Vector((0, 0, 1)); ctr = o + Vector((0, 0, 2.6))
            for side in (1, -1):                                  # face normal = side*nrm
                n_ = nrm * side
                right = up.cross(n_).normalized()              # viewer's right when facing the board (quad normal = n_)
                # east on the viewer's right -> board with the west neighbour on the left
                # island platform: each face shows the line of the track on its own side (快速 JC03 / 各停 JB18)
                fam = fam_at(o + n_ * ((cut[1] - cut[0]) / 2 + 1.6))
                key = "ekimei_%s_%s" % (fam, "wl" if right.x > 0 else "wr")
                _quad(bm, uv, ctr + n_ * 0.03, right, up, 2.4, 0.8, smi(key))
            n_boards += 1
    # station-building signs (JR 御茶ノ水駅)
    targets = []
    for want in (Vector((0, 1, 0)), Vector((0, -1, 0))):             # river side and street side of the main building
        targets.append((main, want, 12.0))
    west = min(stn, key=lambda b: sum(x for x, _ in b["poly"]) / len(b["poly"]))
    targets.append((west, Vector((-1, 0, 0)), 8.0))                   # 御茶ノ水橋口 faces 明大通り / 御茶ノ水橋
    hj = min((b for b in D["buildings"] if b.get("over_track") and not b.get("canopy")),
             key=lambda b: math.dist((sum(x for x, _ in b["poly"]) / len(b["poly"]), sum(y for _, y in b["poly"]) / len(b["poly"])), (-30, -38)))
    if not D.get("station_plaza"):                                   # with a forecourt the sign goes on its entrance
        targets.append((hj, Vector((1, 0, 0)), 8.0))                  # 聖橋口 faces 聖橋
    n_fac = 0
    for b, want, w in targets:
        e = _facade_edge(b["poly"], want)
        if not e: continue
        _, mid, d, out, L = e
        w = min(w, L * 0.8); h = w / 6.0
        zc = b["top"] - (3.3 if b is main else 2.0)
        right = Vector((0, 0, 1)).cross(out).normalized()            # reads left-to-right for a viewer facing the wall
        _quad(bm, uv, mid + out * (1.4 if b is main else 0.25) + Vector((0, 0, zc)), right, Vector((0, 0, 1)), w, h, smi("station_sign"))
        n_fac += 1
    me = bpy.data.meshes.new("JR_Station_CanopiesSigns"); bm.to_mesh(me); bm.free()
    for m in [m_can, m_col, m_post] + [m for _, m in sorted(sign_mats.values(), key=lambda t: t[0])]: me.materials.append(m)
    ob = bpy.data.objects.new("JR_Station_CanopiesSigns", me)
    col = bpy.data.collections.get("15_Signage") or bpy.data.collections.new("15_Signage")
    if col.name not in [c.name for c in sc.collection.children]: sc.collection.children.link(col)
    col.objects.link(ob)
    smi("station_sign")
    plaza_info = _forecourt(D, tz, hj, sign_mats["station_sign"][1], COL, col)
    return dict(platforms=len(plats), boards=n_boards, facade_signs=n_fac, forecourt=plaza_info)


def _forecourt(D, tz, stn_b, sign_mat, COL, col):
    """聖橋口 駅前広場: flat paved forecourt at sidewalk level, railing on the track side, glazed entrance with a
    canopy and sign on the station's south face, walkable nav + entrance markers for the game (12_Walkable_Nav)."""
    from mathutils.geometry import tessellate_polygon
    from mathutils.bvhtree import BVHTree
    P = D.get("station_plaza")
    if not P: return None
    ring = P["poly"]
    stn = next((b for b in D["buildings"] if b.get("station_entrance") == "hijiribashi"), stn_b)
    sp = stn["poly"]
    roads = bpy.data.objects.get("Roads")
    bvh = BVHTree.FromPolygons([v.co.copy() for v in roads.data.vertices], [tuple(p.vertices) for p in roads.data.polygons]) if roads else None
    cx = sum(x for x, _ in ring) / len(ring); cy = sum(y for _, y in ring) / len(ring)
    zs = []
    for x, y in ring:                                    # sidewalk level just outside the forecourt edge
        d = Vector((x - cx, y - cy, 0)).normalized()
        if bvh:
            h = bvh.ray_cast(Vector((x + d.x * 1.2, y + d.y * 1.2, 60.0)), Vector((0, 0, -1)), 80.0)
            if h[0] is not None and abs(h[0].z - P["z"]) < 3.0: zs.append(h[0].z)
    z = sorted(zs)[len(zs) // 2] - 0.01 if zs else P["z"] + 0.12
    bm = bmesh.new(); uvl = bm.loops.layers.uv.verify()
    tris = tessellate_polygon([[(x, y, 0.0) for x, y in ring]])
    n = len(ring)
    vt = [bm.verts.new((x, y, z)) for x, y in ring]
    vb = [bm.verts.new((x, y, min(tz(x, y), z) - 1.0)) for x, y in ring]
    for t in tris:
        try:
            f = bm.faces.new((vt[t[0]], vt[t[1]], vt[t[2]])); f.material_index = 0
            if f.normal.z < 0: f.normal_flip()
            for lp in f.loops: lp[uvl].uv = (lp.vert.co.x, lp.vert.co.y)
        except ValueError: pass
    for i in range(n):
        try: bm.faces.new((vb[i], vb[(i + 1) % n], vt[(i + 1) % n], vt[i])).material_index = 1
        except ValueError: pass
    # railing where the forecourt edge drops to the tracks
    rails = [p for r in D["rails"] if r["cls"] == "rail" and not r["tunnel"] for p in r["pts"]]
    for i in range(n):
        a = Vector((*ring[i], z)); b = Vector((*ring[(i + 1) % n], z)); m = (a + b) / 2
        d = b - a; d.z = 0
        if d.length < 0.5: continue
        out = Vector((d.y, -d.x, 0)).normalized()
        if Vector((cx - m.x, cy - m.y, 0)).dot(out) > 0: out = -out
        probe = m + out * 1.5
        if min(math.dist((probe.x, probe.y), p[:2]) for p in rails) > 6.5 or _inside(probe.x, probe.y, sp): continue
        k = 0
        while k * 1.5 <= d.length:
            _post(bm, a + d.normalized() * k * 1.5, 1.1, 2); k += 1
        _bar(bm, a + Vector((0, 0, 1.1)), b + Vector((0, 0, 1.1)), 0.08, 2)
        _bar(bm, a + Vector((0, 0, 0.55)), b + Vector((0, 0, 0.55)), 0.05, 2)
    # entrance on the station face nearest the forecourt: glazed doors, canopy, sign
    uvs = bm.loops.layers.uv.verify()
    e = Vector((*P["entrance"], 0)) if P.get("entrance") else Vector((cx, cy, 0))
    best = None
    for i in range(len(sp)):
        p0 = Vector((*sp[i], 0)); p1 = Vector((*sp[(i + 1) % len(sp)], 0)); dd = p1 - p0
        if dd.length < 2: continue
        t = max(0.0, min(1.0, (e - p0).dot(dd) / dd.length_squared)); q = p0 + dd * t
        if best is None or (q - e).length < best[0]: best = ((q - e).length, p0, p1, q)
    _, p0, p1, q = best
    dd = (p1 - p0).normalized(); out = Vector((dd.y, -dd.x, 0))
    if (Vector((cx, cy, 0)) - q).dot(out) < 0: out = -out
    L = min((p1 - p0).length - 1.0, 9.0)
    t_ = max(L / 2 + 0.3, min((p1 - p0).length - L / 2 - 0.3, (q - p0).length))
    c = p0 + dd * t_
    _wall(bm, c - dd * L / 2 + out * 0.1, c + dd * L / 2 + out * 0.1, z, z + 3.0, 0.12, 3)      # glass doors
    k = 1
    while k * 1.8 < L:                                                                           # mullions
        _post(bm, c - dd * L / 2 + dd * k * 1.8 + out * 0.18 + Vector((0, 0, z)), 3.0, 2, w=0.05); k += 1
    _wall(bm, c - dd * (L / 2 + 0.6) + out * 1.5, c + dd * (L / 2 + 0.6) + out * 1.5, z + 3.2, z + 3.5, 3.0, 4)   # canopy
    right = Vector((0, 0, 1)).cross(out).normalized()
    sw = min(L + 1.0, 9.0); sh = sw / 6.0                                # sign on the timber screen above the canopy
    sc_ = c + out * 0.6 + Vector((0, 0, z + 3.75 + sh / 2))
    vs = [bm.verts.new(sc_ + right * sx * sw / 2 + Vector((0, 0, sy * sh / 2))) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs); f.material_index = 5
    for lp, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uvs].uv = t
    me = bpy.data.meshes.new("JR_Hijiribashi_Forecourt"); bm.to_mesh(me); bm.free()
    for m_ in (bpy.data.materials.get("WB_Plaza"), bpy.data.materials.get("WB_Wall"), bpy.data.materials.get("WB_CanopyColumn"),
               bpy.data.materials.get("WB_ShopGlass") or bpy.data.materials.get("VH_Glass"), bpy.data.materials.get("WB_PlatformCanopy"), sign_mat):
        me.materials.append(m_)
    col.objects.link(bpy.data.objects.new("JR_Hijiribashi_Forecourt", me))
    # walkable nav + entrance markers
    nbm = bmesh.new(); nv = [nbm.verts.new((x, y, z + 0.05)) for x, y in ring]
    for t in tris:
        try: nbm.faces.new((nv[t[0]], nv[t[1]], nv[t[2]]))
        except ValueError: pass
    nme = bpy.data.meshes.new("Walkable_StationForecourt"); nbm.to_mesh(nme); nbm.free()
    if bpy.data.materials.get("NAV_Walkable"): nme.materials.append(bpy.data.materials["NAV_Walkable"])
    COL["12_Walkable_Nav"].objects.link(bpy.data.objects.new("Walkable_StationForecourt", nme))
    marks = [("Entrance_JR_Ochanomizu_Hijiribashi", c + out * 0.6 + Vector((0, 0, z)), out, "聖橋口")]
    for b in D["buildings"]:                                    # 御茶ノ水橋口: west face of the west station building
        if b.get("landmark") == "jr_ochanomizu_station" and not b.get("over_track"):
            e_ = _facade_edge(b["poly"], Vector((-1, 0, 0)))
            if e_: marks.append(("Entrance_JR_Ochanomizu_Ochanomizubashi", e_[1] + e_[3] * 0.6 + Vector((0, 0, tz(e_[1].x + e_[3].x * 3, e_[1].y + e_[3].y * 3))), e_[3], "御茶ノ水橋口"))
    for name, pos, facing, exit_ in marks:
        em = bpy.data.objects.new(name, None); em.empty_display_type = "SINGLE_ARROW"; em.empty_display_size = 2.0
        em.location = pos
        em["kind"] = "station_entrance"; em["station"] = "御茶ノ水"; em["operator"] = "JR東日本"; em["exit"] = exit_
        em["inward"] = [round(-facing.x, 3), round(-facing.y, 3)]
        COL["12_Walkable_Nav"].objects.link(em)
    return dict(area=P["area"], z=round(z, 2), entrances=[m[0] for m in marks])


def _inside(x, y, ring):
    ins = False; n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: ins = not ins
    return ins


def _post(bm, q, h, mi, w=0.06):
    vb = [bm.verts.new((q.x + dx * w, q.y + dy * w, q.z)) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    vt = [bm.verts.new((v.co.x, v.co.y, q.z + h)) for v in vb]
    for i in range(4): bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i])).material_index = mi
    bm.faces.new(vt).material_index = mi


def _bar(bm, a, b, t, mi):
    d = b - a; d.z = 0
    if d.length < 1e-3: return
    n_ = Vector((-d.y, d.x, 0)).normalized() * t / 2
    vs = [bm.verts.new(v) for v in (a + n_, a - n_, b - n_, b + n_)]
    vs2 = [bm.verts.new(v.co + Vector((0, 0, t))) for v in vs]
    for q in (vs[::-1], vs2, *[[vs[i], vs[(i + 1) % 4], vs2[(i + 1) % 4], vs2[i]] for i in range(4)]):
        bm.faces.new(q).material_index = mi


def _wall(bm, a, b, z0, z1, t, mi):
    d = b - a; d.z = 0
    n_ = Vector((-d.y, d.x, 0)).normalized() * t / 2
    pts = [a + n_, a - n_, b - n_, b + n_]
    vb = [bm.verts.new((p.x, p.y, z0)) for p in pts]; vt = [bm.verts.new((p.x, p.y, z1)) for p in pts]
    for q in (vb[::-1], vt, *[[vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i]] for i in range(4)]):
        bm.faces.new(q).material_index = mi

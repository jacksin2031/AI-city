"""Railway tunnel portals: headwall with an arched opening, dark tunnel throat, wing walls, and a terrain notch so
the opening is visible. Portal positions come from OSM (tunnel=yes ways meeting open track); headwall size,
arch shape and wing walls are generic (推定). The Marunouchi south portal sits in the stone wall under the JR
tracks, as in the Wikimedia photo "Ochanomizu Station Metro-Chuo Line crossing from Hijiri Bridge".
"""
import bpy, bmesh, math
from mathutils import Vector


def find_portals(D):
    open_ends = [(q["pts"][0], q) for q in D["rails"] if not q["tunnel"]] + [(q["pts"][-1], q) for q in D["rails"] if not q["tunnel"]]
    ends = []
    for r in D["rails"]:
        if not r["tunnel"] or len(r["pts"]) < 2: continue
        for end, nxt in ((r["pts"][0], r["pts"][1]), (r["pts"][-1], r["pts"][-2])):
            if any(math.dist(e[:2], end[:2]) < 1.5 for e, _ in open_ends):
                ends.append(dict(p=Vector(end), into=(Vector(nxt) - Vector(end)), metro=r["cls"] == "subway"))
    groups = []
    for e in ends:
        e["into"].z = 0; e["into"].normalize()
        for g in groups:
            if g["metro"] == e["metro"] and (g["ps"][0] - e["p"]).length < 14 and g["into"].dot(e["into"]) > 0.3:
                g["ps"].append(e["p"]); break
        else:
            groups.append(dict(ps=[e["p"]], into=e["into"].copy(), metro=e["metro"]))
    return groups


def build(D, tz, new_obj, mat, srgb, box_seg, pillar):
    bm = bmesh.new()       # headwalls + wing walls (mi 0), dark throat (mi 1), coping (mi 2)
    cutters = []
    # JR "tunnels" at the west end of 御茶ノ水駅 are the covered section under the station deck / 御茶ノ水橋,
    # not bored tunnels: no stone portal there (it clipped into the tracks). Only the Marunouchi Line gets portals.
    groups = [g for g in find_portals(D) if g["metro"]]
    for g in groups:
        c = sum(g["ps"], Vector()) / len(g["ps"])
        d = g["into"]; side = Vector((-d.y, d.x, 0))
        spread = max([abs((p - c).dot(side)) for p in g["ps"]] + [0.0]) * 2
        open_w = spread + (3.8 if g["metro"] else 4.4)
        rail_z = min(p.z for p in g["ps"])
        spring = rail_z + (3.4 if g["metro"] else 4.2)   # arch springing line (metro: low clearance under JR)
        rad = open_w / 2
        crown = spring + rad * (0.35 if g["metro"] else 0.5)   # segmental arch (flattened)
        ground = max(tz(*(c + d * k + side * s).xy) for k in (2, 6, 10) for s in (-open_w / 2, 0, open_w / 2))
        top = max(ground + 0.6, crown + 1.6)
        wall_w = open_w + 5.0
        # anything that runs OVER the portal (JR track bed, roads) caps the headwall: no clipping into them
        cap = 999.0
        for q in D["rails"]:
            if q["tunnel"] or q["cls"] == "subway": continue
            for p in q["pts"]:
                v = Vector(p) - c
                if abs(v.dot(side)) < wall_w / 2 + 3 and -2 < v.dot(d) < 14 and p[2] > crown:
                    cap = min(cap, p[2] - 0.75)                       # below ballast (0.6) + margin
        for q in D["roads"]:
            if q.get("tunnel") or q.get("bridge"): continue
            for p in q["pts"]:
                v = Vector(p) - c
                if abs(v.dot(side)) < wall_w / 2 + 2 and -1 < v.dot(d) < 10 and p[2] > crown:
                    cap = min(cap, p[2] + 1.0)                        # parapet up to 1 m above the road
        top = max(crown + 0.9, min(top, cap))
        base = rail_z - 1.0
        P = lambda u, z, k=0.0: c + side * u + d * k + Vector((0, 0, z - c.z))
        # piers either side of the opening
        for sgn in (-1, 1):
            a = P(sgn * (rad + (wall_w / 2 - rad) / 2), base)
            pillar(bm, a.x, a.y, base, top, wall_w / 2 - rad, 1.2, math.atan2(d.y, d.x) + math.pi / 2, 0)
        # arch ring + spandrel infill (stepped segments)
        N = 10
        for j in range(N):
            u0 = -rad + 2 * rad * j / N; u1 = -rad + 2 * rad * (j + 1) / N
            um = (u0 + u1) / 2
            zz = spring + (crown - spring) * math.sqrt(max(0.0, 1 - (um / rad) ** 2))
            a = P(u0, zz); b = P(u1, zz)
            box_seg(bm, a, b, 1.2, top - zz, 0)
        # stone voussoir band (slightly proud) around the arch
        for j in range(N):
            u0 = -rad + 2 * rad * j / N; u1 = -rad + 2 * rad * (j + 1) / N
            z0 = spring + (crown - spring) * math.sqrt(max(0.0, 1 - (u0 / rad) ** 2))
            z1 = spring + (crown - spring) * math.sqrt(max(0.0, 1 - (u1 / rad) ** 2))
            a = P(u0, z0, -0.65); b = P(u1, z1, -0.65)
            box_seg(bm, a, b, 0.25, 0.7, 2)
        # coping on top of the headwall
        a = P(-wall_w / 2 - 0.2, top, 0); b = P(wall_w / 2 + 0.2, top, 0)
        box_seg(bm, a, b, 1.6, 0.35, 2)
        # short dark throat (0.6-2.6 m behind the face) closed by a solid tunnel block that is never open on top:
        # nothing dark can be seen from behind or above (no "see-through" portals)
        a = P(0, base + 0.2, 0.6); b = P(0, base + 0.2, 2.6)
        box_seg(bm, a, b, open_w, 0.15, 1)                                       # throat floor
        for sgn in (-1, 1):                                                       # throat side linings
            a = P(sgn * (rad - 0.05), base, 0.6); b = P(sgn * (rad - 0.05), base, 2.6)
            box_seg(bm, a, b, 0.1, crown - base, 1)
        a = P(0, crown, 0.6); b = P(0, crown, 2.6)
        box_seg(bm, a, b, open_w, 0.1, 1)                                        # throat ceiling
        a = P(0, base, 2.6); b = P(0, base, 2.75)
        box_seg(bm, a, b, open_w, crown - base + 0.1, 1)                         # dark back face
        g_behind = min(tz(q.x, q.y) for q in (P(-rad, 0, 4), P(0, 0, 4), P(rad, 0, 4), P(0, 0, 9)))
        blk_top = min(max(crown + 1.0, top - 0.3), top, max(crown + 0.4, g_behind - 0.1))   # earth-covered: follows the ground
        a = P(0, crown + 0.1, 0.6); b = P(0, crown + 0.1, 2.75)
        box_seg(bm, a, b, wall_w - 0.2, blk_top - crown - 0.1, 0)               # block over the throat
        a = P(0, base, 2.75); b = P(0, base, 14.0)
        box_seg(bm, a, b, wall_w - 0.2, blk_top - base, 0)                       # tunnel block behind
        a = P(0, blk_top, 0.6); b = P(0, blk_top, 14.0)
        box_seg(bm, a, b, wall_w - 0.1, 0.12, 3)                                 # earth / grass cover on top
        # wing walls flaring out on the open side
        for sgn in (-1, 1):
            a = P(sgn * (wall_w / 2 - 0.4), base, -0.4)
            b = a - d * 6.0 + side * sgn * 2.5
            zt = lambda q: max(rail_z + 1.0, min(top, tz(q.x, q.y) + 0.4, cap))
            a.z = base; b.z = base
            box_seg(bm, a, b, 0.6, zt(b) - base, 0, z0=base)
        # terrain notch in front of the opening so the portal reads (Exact boolean on the DEM mesh)
        cutters.append([P(-wall_w / 2 + 0.6, base + 0.1, -9), P(wall_w / 2 - 0.6, base + 0.1, -9),
                        P(wall_w / 2 - 0.6, base + 0.1, 0.2), P(-wall_w / 2 + 0.6, base + 0.1, 0.2), top - 0.2])
    new_obj("Tunnel_Portals", bm, "02_RetainingWalls",
                 [mat("WB_PortalStone", srgb("#8E897F")), mat("WB_TunnelDark", srgb("#141414")), mat("WB_Kerb", srgb("#B9B4AA")),
                  mat("WB_Green", srgb("#C2B27A"))])
    # terrain cut
    ter = bpy.data.objects.get("Terrain_DEM5A")
    if ter and cutters:
        cbm = bmesh.new()
        for q0, q1, q2, q3, zt in cutters:
            vb = [cbm.verts.new(v) for v in (q0, q1, q2, q3)]
            vt = [cbm.verts.new((v.x, v.y, zt + 30)) for v in (q0, q1, q2, q3)]
            cbm.faces.new(list(reversed(vb))); cbm.faces.new(vt)
            for i in range(4):
                cbm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i]))
        bmesh.ops.recalc_face_normals(cbm, faces=cbm.faces)
        me = bpy.data.meshes.new("PortalCutter"); cbm.to_mesh(me); cbm.free()
        cut = bpy.data.objects.new("PortalCutter", me); bpy.context.scene.collection.objects.link(cut)
        mod = ter.modifiers.new("PortalCut", "BOOLEAN"); mod.operation = "DIFFERENCE"; mod.object = cut
        try: mod.solver = "EXACT"
        except TypeError: pass
        with bpy.context.temp_override(object=ter, active_object=ter, selected_objects=[ter]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cut, do_unlink=True)
        while len(ter.data.materials) and ter.data.materials[-1] is None:
            ter.data.materials.pop()
    return [(round(sum(p.x for p in g["ps"]) / len(g["ps"])), round(sum(p.y for p in g["ps"]) / len(g["ps"])), "metro" if g["metro"] else "JR", len(g["ps"])) for g in groups]

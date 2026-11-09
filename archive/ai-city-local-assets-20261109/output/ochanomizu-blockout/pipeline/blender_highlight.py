"""Blender: accent band marking デジタルハリウッド大学 (ソラシティ アカデミア 3F/4F, OSM addr) on the ソラシティ prism.

Floor levels are estimates: 1F = 本郷通り side ground (DEM), 4.5 m per podium floor.
"""
import bpy, bmesh, json, os


def add_dhu_band(scene_json, floor_h=4.5, floors=(3, 4), color=(0.95, 0.42, 0.12)):
    D = json.load(open(scene_json, encoding="utf8"))
    sola = next(b for b in D["buildings"] if b.get("landmark") == "sola_city")
    one_f = sola["ground_max"]                     # 1F ≈ upper-street ground level
    z0 = one_f + (floors[0] - 1) * floor_h
    z1 = one_f + floors[1] * floor_h
    name = "HL_DigitalHollywoodUniv_3F4F"
    old = bpy.data.objects.get(name)
    if old: bpy.data.objects.remove(old, do_unlink=True)
    m = bpy.data.materials.get("HL_Accent") or bpy.data.materials.new("HL_Accent")
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*color, 1); p.inputs["Roughness"].default_value = 0.5
    ring = sola["poly"]
    # inflate the footprint 0.25 m so the band sits proud of the facade
    cx = sum(x for x, _ in ring) / len(ring); cy = sum(y for _, y in ring) / len(ring)
    ring = [[x + (x - cx) * 0.006, y + (y - cy) * 0.006] for x, y in ring]
    bm = bmesh.new()
    vb = [bm.verts.new((x, y, z0)) for x, y in ring]; vt = [bm.verts.new((x, y, z1)) for x, y in ring]
    bm.faces.new(vt); bm.faces.new(list(reversed(vb)))
    for i in range(len(ring)):
        bm.faces.new((vb[i], vb[(i + 1) % len(ring)], vt[(i + 1) % len(ring)], vt[i]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    col = bpy.data.collections.get("09_Landmarks")
    col.objects.link(ob)
    ob["name_ja"] = "デジタルハリウッド大学 駿河台キャンパス（ソラシティ アカデミア 3F/4F）"
    ob["estimated"] = "floor levels: 1F=%.1f m (DEM), %.1f m/floor" % (one_f, floor_h)
    return z0, z1

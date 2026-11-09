"""Landmark details (Phase 2b), from Wikimedia reference photos. Proportions are read from the photos (推定).

Objects are named LMX_* and carry a custom property "facade" = material name; blender_materials.apply() assigns it.
"""
import bmesh, json, math, os
from mathutils import Vector


def build(D, DATA, COL, new_obj, mat, srgb, box_seg, pillar, tz, to_local):
    out = []

    def ring_of(lm, pick):
        cands = [b for b in D["buildings"] if b.get("landmark") == lm]
        return pick(cands) if cands else None

    def area(r):
        return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2

    def prism(bm, ring, z0, z1, scale=1.0):
        cx = sum(x for x, _ in ring) / len(ring); cy = sum(y for _, y in ring) / len(ring)
        r = [(cx + (x - cx) * scale, cy + (y - cy) * scale) for x, y in ring]
        vb = [bm.verts.new((x, y, z0)) for x, y in r]; vt = [bm.verts.new((x, y, z1)) for x, y in r]
        bm.faces.new(vt); bm.faces.new(list(reversed(vb)))
        for i in range(len(r)):
            bm.faces.new((vb[i], vb[(i + 1) % len(r)], vt[(i + 1) % len(r)], vt[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return cx, cy

    def obj(name, bm, col, facade):
        ob = new_obj(name, bm, col, [mat(facade, srgb("#CCCCCC"))])   # placeholder; real material set in blender_materials.apply
        ob["facade"] = facade
        out.append(name)
        return ob

    def cross(bm, x, y, z, h=3.2):
        pillar(bm, x, y, z, z + h, 0.28, 0.28, 0.0, 0)                                 # upright
        box_seg(bm, Vector((x - 0.9, y, z + h * 0.65)), Vector((x + 0.9, y, z + h * 0.65)), 0.25, 0.25, 0)

    # ---- ソラシティ: recessed rooftop crown (mechanical screen) — photo shows a flat top with a set-back band
    b = ring_of("sola_city", lambda c: max(c, key=lambda b: b["top"]))
    if b:
        bm = bmesh.new()
        prism(bm, b["poly"], b["top"] - 0.1, b["top"] + 5.5, 0.86)
        obj("LMX_SolaCity_Crown", bm, "09_Landmarks", "F_OfficeGrey")
        bm = bmesh.new()                                   # thin cornice band at the roof edge
        prism(bm, b["poly"], b["top"] - 1.2, b["top"] + 0.4, 1.01)
        obj("LMX_SolaCity_Cornice", bm, "09_Landmarks", "WB_Parapet")

    # ---- WATERRAS tower: glass crown, slightly set back (photo: rounded glass top)
    b = ring_of("waterras_tower", lambda c: max(c, key=lambda b: b["top"]))
    if b:
        bm = bmesh.new()
        prism(bm, b["poly"], b["top"] - 0.1, b["top"] + 6.0, 0.9)
        obj("LMX_Waterras_Crown", bm, "09_Landmarks", "F_Waterras")

    # ---- JR 御茶ノ水駅 聖橋口 (2025 photo): dark projecting roof slab over the east (聖橋-side) station building
    b = ring_of("jr_ochanomizu_station", lambda c: max(c, key=lambda b: sum(x for x, _ in b["poly"]) / len(b["poly"])))
    if b:
        bm = bmesh.new()
        prism(bm, b["poly"], b["top"] - 0.9, b["top"] - 0.2, 1.12)
        obj("LMX_JR_Hijiribashi_Canopy", bm, "09_Landmarks", "WB_LampPole")
        bm = bmesh.new()                                   # timber-look screen on the upper floor
        prism(bm, b["poly"], b["top"] - 5.5, b["top"] - 1.0, 1.02)
        obj("LMX_JR_Hijiribashi_Louvre", bm, "09_Landmarks", "WB_TimberLouvre")

    # ---- ニコライ堂: cross on the main dome; bell tower (OSM building:part 553266118, roof:shape=dome, h=23)
    domes = [b for b in D["buildings"] if b.get("landmark") == "nikolai_do" and b.get("roof") == "dome"]
    bm = bmesh.new()
    for b in domes:
        cx = sum(x for x, _ in b["poly"]) / len(b["poly"]); cy = sum(y for _, y in b["poly"]) / len(b["poly"])
        pillar(bm, cx, cy, b["top"] - 0.3, b["top"] + 1.6, 1.6, 1.6, 0.0, 0)          # lantern
        cross(bm, cx, cy, b["top"] + 1.6)
    pj = os.path.join(DATA, "parts.json")
    if os.path.exists(pj):
        d = json.load(open(pj, encoding="utf8"))
        N = {e["id"]: to_local(e["lat"], e["lon"]) for e in d["elements"] if e["type"] == "node"}
        for e in d["elements"]:
            if e["type"] == "way" and e["id"] == 553266118:
                ring = [N[n] for n in e["nodes"][:-1] if n in N]
                g = min(tz(x, y) for x, y in ring)
                # OSM says 23 m, but the 18 m podium around it would bury the belfry; the photo shows the bell tower
                # rising clearly above the nave roof to just below the main dome -> 27 m (推定)
                h = max(float(e["tags"].get("height", 23)), 27.0)
                cx, cy = prism(bm, ring, g - 0.3, g + h * 0.62)                       # square tower
                prism(bm, ring, g + h * 0.62, g + h * 0.80, 0.82)                     # belfry
                r_ = math.sqrt(area(ring) / math.pi) * 0.72
                res = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r_)
                for v in res["verts"]:
                    v.co.z = max(v.co.z, 0.0) * 1.4; v.co += Vector((cx, cy, g + h * 0.80))
                cross(bm, cx, cy, g + h * 0.80 + r_ * 1.4)
    obj("LMX_Nikolai_BellTower_Crosses", bm, "09_Landmarks", "F_Nikolai")

    # ---- river guardrails: green steel fence along the revetment tops (御茶ノ水橋 photo)
    bm = bmesh.new()
    for ring in D.get("revetments", []):
        for a, c in zip(ring, ring[1:]):
            if math.dist(a[:2], c[:2]) > 8: continue
            p0 = Vector((a[0], a[1], a[2])); p1 = Vector((c[0], c[1], c[2]))
            box_seg(bm, p0 + Vector((0, 0, 1.0)), p1 + Vector((0, 0, 1.0)), 0.08, 0.08, 0)   # top rail
            box_seg(bm, p0 + Vector((0, 0, 0.5)), p1 + Vector((0, 0, 0.5)), 0.05, 0.05, 0)   # mid rail
            pillar(bm, a[0], a[1], a[2], a[2] + 1.05, 0.08, 0.08, 0.0, 0)                  # post
    obj("LMX_River_Guardrails", bm, "02_RetainingWalls", "WB_SteelGreen")
    return out

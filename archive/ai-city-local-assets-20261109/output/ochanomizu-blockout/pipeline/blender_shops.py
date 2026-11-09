"""Ground-floor shopfronts: lit glazing, fascia band and a coloured awning per OSM shop (category colours, 推定).
No text, logos or signs (scene rule)."""
import bmesh, math
from mathutils import Vector

COLORS = {"food": "#B5392E", "cafe": "#3E5E3A", "bar": "#6B2A30", "books": "#2E4A6B", "music": "#2B2B2E",
          "conv": "#E8E6E0", "health": "#5C8FB8", "sport": "#D9772B", "tech": "#D8B13A", "other": "#9C8A72"}


def build(D, tz, new_obj, mat, srgb, box_seg):
    shops = D.get("shops") or []
    if not shops: return 0
    cats = list(COLORS)
    mats = [mat("WB_ShopGlass", srgb("#3B3A36")), mat("WB_ShopFascia", srgb("#D9D4C8"))] + \
           [mat("WB_Awning_" + c, srgb(COLORS[c])) for c in cats]
    bm = bmesh.new()
    for s in shops:
        a = Vector((s["a"][0], s["a"][1], 0)); b = Vector((s["b"][0], s["b"][1], 0))
        n = Vector((s["n"][0], s["n"][1], 0))
        mid = (a + b) / 2
        g = tz(mid.x + n.x * 1.5, mid.y + n.y * 1.5) + 0.12           # sidewalk level in front of the shop
        g = max(g, s["base"])
        # glazing (slightly proud of the wall so it reads over any facade pattern)
        p0 = a + n * 0.08; p1 = b + n * 0.08; p0.z = p1.z = g
        box_seg(bm, p0, p1, 0.12, 3.0, 0)
        # fascia band
        p0.z = p1.z = g + 3.0
        box_seg(bm, p0, p1, 0.18, 0.55, 1)
        # awning: sloped from the wall (g+3.45) down to g+2.85, projecting 1.3 m
        mi = 2 + cats.index(s["cat"] if s["cat"] in COLORS else "other")
        d = (b - a).normalized()
        q = [a + n * 0.15, b + n * 0.15, b + n * 1.45, a + n * 1.45]
        zt = [g + 3.45, g + 3.45, g + 2.85, g + 2.85]
        top = [bm.verts.new((v.x, v.y, z)) for v, z in zip(q, zt)]
        bot = [bm.verts.new((v.x, v.y, z - 0.08)) for v, z in zip(q, zt)]
        faces = [top, list(reversed(bot))] + [[bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]] for i in range(4)]
        for f in faces:
            try: bm.faces.new(f).material_index = mi
            except ValueError: pass
        # valance (front drop)
        v0 = a + n * 1.45; v1 = b + n * 1.45; v0.z = v1.z = g + 2.55
        box_seg(bm, v0, v1, 0.05, 0.3, mi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    new_obj("Shops_GroundFloor", bm, "08_Buildings", mats)
    return len(shops)

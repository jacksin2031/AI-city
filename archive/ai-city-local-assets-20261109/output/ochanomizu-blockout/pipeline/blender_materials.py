"""Phase 1: semi-realistic procedural materials for the Ochanomizu scene (render-only, no image textures).

apply(scene) rebuilds the node trees of the existing WB_* materials and assigns facade materials to buildings.
Facade types for generic buildings are rule-based (height / OSM building tag / seeded hash) — 推定.
Landmark facades follow Wikimedia reference photos (Sola City, WATERRAS, Yushima Seido, Nikolai-do, JR Hijiribashi exit).
"""
import bpy, math, random


def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


class G:
    """tiny node-graph helper"""
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        for n in list(self.nt.nodes): self.nt.nodes.remove(n)
        self.out = self.n("ShaderNodeOutputMaterial")
        self.bsdf = self.n("ShaderNodeBsdfPrincipled")
        self.l(self.bsdf.outputs["BSDF"], self.out.inputs["Surface"])
        self.geo = self.n("ShaderNodeNewGeometry")
        self.P = self.n("ShaderNodeSeparateXYZ"); self.l(self.geo.outputs["Position"], self.P.inputs[0])
        self.N = self.n("ShaderNodeSeparateXYZ"); self.l(self.geo.outputs["Normal"], self.N.inputs[0])

    def n(self, t, **kw):
        node = self.nt.nodes.new(t)
        for k, v in kw.items(): setattr(node, k, v)
        return node

    def l(self, a, b):
        self.nt.links.new(a, b)

    def _in(self, sock, v):
        if hasattr(v, "is_output") or hasattr(v, "links"): self.l(v, sock)
        elif isinstance(v, (tuple, list)): sock.default_value = tuple(v) if len(v) == len(sock.default_value) else (*v, 1.0)
        else: sock.default_value = v

    def m(self, op, a, b=None, c=None, clamp=False):
        node = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        self._in(node.inputs[0], a)
        if b is not None: self._in(node.inputs[1], b)
        if c is not None: self._in(node.inputs[2], c)
        return node.outputs[0]

    def vm(self, op, a, b=None):
        node = self.n("ShaderNodeVectorMath", operation=op)
        self._in(node.inputs[0], a)
        if b is not None: self._in(node.inputs[1], b)
        return node.outputs["Value"] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else node.outputs["Vector"]

    def mix(self, fac, a, b):
        node = self.n("ShaderNodeMix", data_type="RGBA")
        ins = [s for s in node.inputs if s.type == "RGBA"]
        self._in(node.inputs["Factor"], fac); self._in(ins[0], a); self._in(ins[1], b)
        return [s for s in node.outputs if s.type == "RGBA"][0]

    def mixf(self, fac, a, b):
        node = self.n("ShaderNodeMix", data_type="FLOAT")
        fl = [s for s in node.inputs if s.type == "VALUE" and s.name in ("A", "B")]
        self._in(node.inputs["Factor"], fac); self._in(fl[0], a); self._in(fl[1], b)
        return [s for s in node.outputs if s.type == "VALUE"][0]

    def combine(self, x, y, z):
        node = self.n("ShaderNodeCombineXYZ")
        self._in(node.inputs[0], x); self._in(node.inputs[1], y); self._in(node.inputs[2], z)
        return node.outputs[0]

    def noise(self, vec, scale, detail=4.0, rough=0.5):
        node = self.n("ShaderNodeTexNoise")
        if vec is not None: self.l(vec, node.inputs["Vector"])
        node.inputs["Scale"].default_value = scale; node.inputs["Detail"].default_value = detail
        node.inputs["Roughness"].default_value = rough
        return node.outputs["Fac"]

    def white(self, vec):
        node = self.n("ShaderNodeTexWhiteNoise", noise_dimensions="3D")
        self.l(vec, node.inputs["Vector"])
        return node.outputs["Value"]

    def voronoi(self, vec, scale):
        node = self.n("ShaderNodeTexVoronoi")
        if vec is not None: self.l(vec, node.inputs["Vector"])
        node.inputs["Scale"].default_value = scale
        return node.outputs["Distance"], node.outputs["Color"]

    def brick(self, vec, c1, c2, mortar, scale, msize=0.02, bw=0.5, rh=0.25):
        node = self.n("ShaderNodeTexBrick")
        self.l(vec, node.inputs["Vector"])
        node.inputs["Color1"].default_value = (*c1, 1); node.inputs["Color2"].default_value = (*c2, 1)
        node.inputs["Mortar"].default_value = (*mortar, 1); node.inputs["Scale"].default_value = scale
        node.inputs["Mortar Size"].default_value = msize
        node.inputs["Brick Width"].default_value = bw; node.inputs["Row Height"].default_value = rh
        return node.outputs["Color"], node.outputs["Fac"]

    def bump(self, height, strength=0.2, dist=0.05):
        node = self.n("ShaderNodeBump")
        node.inputs["Strength"].default_value = strength; node.inputs["Distance"].default_value = dist
        self.l(height, node.inputs["Height"])
        self.l(node.outputs["Normal"], self.bsdf.inputs["Normal"])

    def set(self, color=None, rough=None, metal=None):
        if color is not None: self._in(self.bsdf.inputs["Base Color"], color)
        if rough is not None: self._in(self.bsdf.inputs["Roughness"], rough)
        if metal is not None: self._in(self.bsdf.inputs["Metallic"], metal)

    def obj_random(self):
        return self.n("ShaderNodeObjectInfo").outputs["Random"]

    def attr(self, name):
        return self.n("ShaderNodeAttribute", attribute_type="OBJECT", attribute_name=name).outputs["Fac"]

    def uv(self):
        sep = self.n("ShaderNodeSeparateXYZ")
        self.l(self.n("ShaderNodeTexCoord").outputs["UV"], sep.inputs[0])
        return sep.outputs[0], sep.outputs[1]


def mat(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def shade(c, k):
    return tuple(min(1.0, x * k) for x in c)


# ------------------------------------------------------------------ facades
def facade(name, wall, win, roof, bay=2.4, floor=3.6, ww=0.55, wh=0.5, sill=0.3, glass=False, mull=0.06,
           frame=None, spandrel=0.12, roof_th=0.6, shop=True, roof_rough=0.9, wall_rough=0.8):
    m = mat(name); g = G(m)
    zaxis = (0.0, 0.0, 1.0)
    T = g.vm("NORMALIZE", g.vm("CROSS_PRODUCT", zaxis, g.geo.outputs["Normal"]))
    u = g.vm("DOT_PRODUCT", g.geo.outputs["Position"], T)
    v = g.P.outputs["Z"]
    fu = g.m("FRACT", g.m("DIVIDE", u, bay)); fv = g.m("FRACT", g.m("DIVIDE", v, floor))
    if glass:
        win_mask = g.m("MULTIPLY", g.m("GREATER_THAN", fu, mull), g.m("GREATER_THAN", fv, spandrel))
    else:
        a0, a1 = (1 - ww) / 2, (1 + ww) / 2
        wu = g.m("MULTIPLY", g.m("GREATER_THAN", fu, a0), g.m("LESS_THAN", fu, a1))
        wv = g.m("MULTIPLY", g.m("GREATER_THAN", fv, sill), g.m("LESS_THAN", fv, sill + wh))
        win_mask = g.m("MULTIPLY", wu, wv)
    if shop:   # ground floor shopfront (first 4.2 m above the building's own base)
        rel = g.m("SUBTRACT", v, g.attr("base_z"))
        gf = g.m("MULTIPLY", g.m("LESS_THAN", rel, 4.2), g.m("GREATER_THAN", rel, 0.15))
        shopwin = g.m("MULTIPLY", g.m("GREATER_THAN", fu, 0.05), g.m("LESS_THAN", rel, 3.4))
        win_mask = g.mixf(gf, win_mask, shopwin)
    # per-window variation (lit / dark / curtains)
    cell = g.combine(g.m("FLOOR", g.m("DIVIDE", u, bay)), g.m("FLOOR", g.m("DIVIDE", v, floor)), g.m("MULTIPLY", g.obj_random(), 97.0))
    wn = g.white(cell)
    wincol = g.mix(wn, shade(win, 0.75), shade(win, 1.35))
    # wall: per-building tint + soft dirt
    rnd = g.obj_random()
    wallcol = g.mix(rnd, shade(wall, 0.9), shade(wall, 1.07))
    dirt = g.noise(g.geo.outputs["Position"], 0.08, 3)
    wallcol = g.mix(g.m("MULTIPLY", dirt, 0.35), wallcol, shade(wall, 0.72))
    if frame is not None and glass:
        wallcol = g.mix(rnd, shade(frame, 0.95), shade(frame, 1.05))
    col = g.mix(win_mask, wallcol, wincol)
    rough = g.mixf(win_mask, wall_rough, 0.08)
    # roof (top faces): concrete / gravel
    roofm = g.m("GREATER_THAN", g.N.outputs["Z"], roof_th)
    gravel = g.noise(g.geo.outputs["Position"], 1.6, 2)
    roofcol = g.mix(gravel, shade(roof, 0.88), shade(roof, 1.1))
    # per-building roof variety: concrete / dark membrane / weathered green-grey (推定)
    rr = g.obj_random()
    roofvar = g.mix(g.m("GREATER_THAN", rr, 0.55), shade(roof, 0.82), srgb("#6E716F"))
    roofvar = g.mix(g.m("GREATER_THAN", rr, 0.85), roofvar, srgb("#8C9387"))
    roofcol = g.mix(0.55, roofcol, roofvar)
    col = g.mix(roofm, col, roofcol)
    rough = g.mixf(roofm, rough, roof_rough)
    g.set(col, rough, 0.0)
    return m


def build_facades():
    F = {}
    # generic (推定)
    F["office_white"] = facade("F_OfficeWhite", srgb("#E4E1DA"), srgb("#4E5C68"), srgb("#A6A39C"), bay=2.0, floor=3.9, ww=0.86, wh=0.5, sill=0.32)
    F["office_grey"] = facade("F_OfficeGrey", srgb("#B9B5AD"), srgb("#3F4A54"), srgb("#9E9B94"), bay=2.6, floor=3.8, ww=0.55, wh=0.48, sill=0.32)
    F["glass"] = facade("F_GlassTower", srgb("#7D8D98"), srgb("#5D7486"), srgb("#9C9A95"), bay=1.5, floor=4.1, glass=True, mull=0.07,
                        frame=srgb("#B7BDC1"), spandrel=0.16)
    F["resi"] = facade("F_Residential", srgb("#E3D6C3"), srgb("#55606A"), srgb("#A9A49B"), bay=3.2, floor=3.0, ww=0.5, wh=0.55, sill=0.22)
    F["brick"] = facade("F_BrickTile", srgb("#A3664D"), srgb("#3E4448"), srgb("#958F86"), bay=2.4, floor=3.2, ww=0.45, wh=0.5, sill=0.3)
    F["small"] = facade("F_SmallShop", srgb("#CFC6B8"), srgb("#4C5459"), srgb("#8F8A82"), bay=2.8, floor=3.0, ww=0.4, wh=0.45, sill=0.32)
    # landmarks (from reference photos)
    F["sola"] = facade("F_SolaCity", srgb("#4C565E"), srgb("#3E4A55"), srgb("#8E8C88"), bay=1.25, floor=4.2, glass=True, mull=0.38,
                       frame=srgb("#C9CBCB"), spandrel=0.05)                       # silver vertical fins + dark glass
    F["waterras"] = facade("F_Waterras", srgb("#5F86A6"), srgb("#5C86AB"), srgb("#9C9A95"), bay=1.5, floor=3.6, glass=True, mull=0.05,
                           frame=srgb("#8FAEC6"), spandrel=0.08)                   # blue glass curtain wall
    F["nikolai"] = facade("F_Nikolai", srgb("#EEEAE1"), srgb("#5A5650"), srgb("#5E9C88"), bay=4.0, floor=6.0, ww=0.28, wh=0.45, sill=0.3,
                          roof_th=0.2, shop=False, roof_rough=0.55)                # white walls, verdigris copper domes/roofs
    F["seido"] = facade("F_Seido", srgb("#2C2926"), srgb("#1E1C1A"), srgb("#6FA393"), bay=3.6, floor=7.0, ww=0.7, wh=0.6, sill=0.12,
                        roof_th=0.2, shop=False, roof_rough=0.55, wall_rough=0.6)  # black lacquered wood, green copper roof
    F["station"] = facade("F_JRStation", srgb("#55524E"), srgb("#3D454B"), srgb("#7A7773"), bay=2.2, floor=4.5, ww=0.9, wh=0.55, sill=0.3)
    return F


def pick_facade(ob, F, rnd):
    nm = ob.get("name_ja", "") or ""
    lm = ob.name
    h = float(ob.get("height_m", 10.0)); kind = (ob.get("osm_building", "") or "").lower()
    if "sola_city" in lm: return F["sola"]
    if "waterras" in lm and h > 60: return F["waterras"]
    if "nikolai" in lm or "ニコライ" in nm: return F["nikolai"]
    if "jr_ochanomizu_station" in lm: return F["station"]
    x, y = ob.get("cx", 0.0), ob.get("cy", 0.0)
    if 30 < x < 125 and 50 < y < 135 and h < 22 and kind not in ("apartments", "residential"): return F["seido"]
    if h >= 90: return F["glass"] if rnd.random() < 0.6 else F["office_white"]
    if kind in ("apartments", "residential", "dormitory", "house"): return F["resi"]
    if h >= 30: return rnd.choices([F["office_white"], F["office_grey"], F["resi"]], [0.5, 0.3, 0.2])[0]
    if h >= 12: return rnd.choices([F["resi"], F["office_grey"], F["brick"], F["office_white"]], [0.35, 0.25, 0.2, 0.2])[0]
    return rnd.choices([F["small"], F["brick"], F["office_grey"]], [0.6, 0.25, 0.15])[0]


# ------------------------------------------------------------------ ground, roads, structures
def ground_materials():
    # urban ground (paved / compacted)
    g = G(mat("WB_Ground"))
    n1 = g.noise(g.geo.outputs["Position"], 0.05, 3); n2 = g.noise(g.geo.outputs["Position"], 0.9, 2)
    c = g.mix(n1, srgb("#C9C3B6"), srgb("#D9D3C6")); c = g.mix(g.m("MULTIPLY", n2, 0.4), c, srgb("#B9B2A4"))
    g.set(c, 0.9, 0.0)
    # autumn grass + fallen leaves
    g = G(mat("WB_Green"))
    n1 = g.noise(g.geo.outputs["Position"], 0.25, 4)
    c = g.mix(n1, srgb("#8E8A4E"), srgb("#B59E5A"))
    d, _ = g.voronoi(g.geo.outputs["Position"], 2.2)
    leaves = g.m("LESS_THAN", d, 0.18)
    c = g.mix(g.m("MULTIPLY", leaves, 0.7), c, srgb("#C7642E"))
    g.set(c, 0.95, 0.0)
    # stone paving (plazas)
    for name in ("WB_Plaza", "WB_PlazaPaving"):
        g = G(mat(name))
        col, fac = g.brick(g.geo.outputs["Position"], srgb("#D6CFC2"), srgb("#C7BFB0"), srgb("#A9A193"), 1.1, 0.03, 0.9, 0.45)
        g.set(col, 0.8, 0.0); g.bump(fac, 0.15)
    # retaining walls: stone masonry (JR shelf / cut faces), mossy toward the bottom
    g = G(mat("WB_Wall"))
    uw = g.m("ADD", g.P.outputs["X"], g.P.outputs["Y"])
    vec = g.combine(uw, g.P.outputs["Z"], 0.0)
    col, fac = g.brick(vec, srgb("#9C978E"), srgb("#948F85"), srgb("#837E75"), 2.2, 0.03, 0.9, 0.45)
    moss = g.m("MULTIPLY", g.noise(g.geo.outputs["Position"], 0.4, 4), g.m("LESS_THAN", g.P.outputs["Z"], 8.0))
    col = g.mix(g.m("MULTIPLY", moss, 0.6), col, srgb("#5F6E45"))
    g.set(col, 0.92, 0.0); g.bump(fac, 0.15)
    # diorama section (soil strata)
    g = G(mat("WB_Section"))
    ramp = g.n("ShaderNodeValToRGB")
    mr = g.n("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -12; mr.inputs["From Max"].default_value = 20
    g.l(g.P.outputs["Z"], mr.inputs["Value"]); g.l(mr.outputs["Result"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].color = (*srgb("#5C4A3A"), 1); ramp.color_ramp.elements[1].color = (*srgb("#9A8468"), 1)
    g.set(ramp.outputs["Color"], 0.95, 0.0)
    g = G(mat("WB_RiverBed")); g.set(srgb("#3F4A42"), 0.9, 0.0)
    # Kanda river: dark green-blue, glossy, small ripples
    g = G(mat("WB_Water"))
    c = g.mix(g.noise(g.geo.outputs["Position"], 0.05, 2), srgb("#2B3F3A"), srgb("#3A5249"))
    g.set(c, 0.06, 0.0); g.bump(g.noise(g.geo.outputs["Position"], 1.2, 3), 0.08, 0.02)


def road_materials():
    def asphalt(name, centre):
        g = G(mat(name))
        n1 = g.noise(g.geo.outputs["Position"], 0.4, 4); n2 = g.noise(g.geo.outputs["Position"], 3.0, 2)
        c = g.mix(n1, srgb("#45474A"), srgb("#55575A")); c = g.mix(g.m("MULTIPLY", n2, 0.3), c, srgb("#3A3C3E"))
        if centre:   # dashed centre line (UV u = metres from the centreline, v = metres along)
            u, v = g.uv()
            line = g.m("MULTIPLY", g.m("LESS_THAN", g.m("ABSOLUTE", u), 0.08), g.m("LESS_THAN", g.m("FRACT", g.m("DIVIDE", v, 9.0)), 0.55))
            c = g.mix(line, c, srgb("#E9E6DD"))
        g.set(c, 0.85, 0.0)
    asphalt("WB_RoadMajor", True)
    asphalt("WB_Road", False)
    # sidewalk pavers (interlocking blocks along the walk direction)
    g = G(mat("WB_Footway"))
    u, v = g.uv()
    col, fac = g.brick(g.combine(v, u, 0.0), srgb("#CDBFA6"), srgb("#BFB097"), srgb("#9E9280"), 2.4, 0.04, 0.5, 0.5)
    tint = g.noise(g.geo.outputs["Position"], 0.15, 2)
    col = g.mix(g.m("MULTIPLY", tint, 0.3), col, srgb("#B2A48B"))
    g.set(col, 0.85, 0.0); g.bump(fac, 0.15)
    g = G(mat("WB_Steps"))
    u, v = g.uv()
    tread = g.m("LESS_THAN", g.m("FRACT", g.m("DIVIDE", v, 0.32)), 0.12)
    g.set(g.mix(tread, srgb("#BEB6A8"), srgb("#8F887C")), 0.8, 0.0)


def structure_materials():
    g = G(mat("WB_Bridge"))                         # exposed concrete with rain streaks
    n1 = g.noise(g.geo.outputs["Position"], 0.15, 4)
    streak = g.noise(g.combine(g.m("MULTIPLY", g.m("ADD", g.P.outputs["X"], g.P.outputs["Y"]), 4.0), g.m("MULTIPLY", g.P.outputs["Z"], 0.25), 0.0), 1.0, 3)
    c = g.mix(n1, srgb("#B4AFA5"), srgb("#C8C3B9")); c = g.mix(g.m("MULTIPLY", streak, 0.35), c, srgb("#8F8A80"))
    g.set(c, 0.85, 0.0)
    g = G(mat("WB_SteelGreen"))                     # painted steel, 御茶ノ水橋
    c = g.mix(g.noise(g.geo.outputs["Position"], 0.5, 3), srgb("#467E6C"), srgb("#5A937F"))
    g.set(c, 0.45, 0.15)
    g = G(mat("WB_SteelLight"))                     # 丸ノ内線 box girder
    g.set(g.mix(g.noise(g.geo.outputs["Position"], 0.3, 3), srgb("#BFC3C5"), srgb("#D3D6D7")), 0.5, 0.2)
    g = G(mat("WB_Ballast"))                        # crushed stone + concrete sleepers (UV v = metres along track)
    d, colv = g.voronoi(g.geo.outputs["Position"], 9.0)
    c = g.mix(g.white(g.geo.outputs["Position"]), srgb("#6E6A63"), srgb("#958E84"))
    u, v = g.uv()
    sleeper = g.m("MULTIPLY", g.m("LESS_THAN", g.m("FRACT", g.m("DIVIDE", v, 0.62)), 0.36), g.m("LESS_THAN", g.m("ABSOLUTE", u), 1.25))
    c = g.mix(sleeper, c, srgb("#A9A49A"))
    g.set(c, 0.95, 0.0); g.bump(d, 0.4, 0.03)
    g = G(mat("WB_Rail")); g.set(srgb("#8A8682"), 0.32, 0.85)
    g = G(mat("WB_Platform")); g.set(g.mix(g.noise(g.geo.outputs["Position"], 0.3, 2), srgb("#BDB7AC"), srgb("#CFC9BE")), 0.85, 0.0)
    g = G(mat("WB_Portal")); g.set(srgb("#8E897F"), 0.9, 0.0)
    g = G(mat("WB_Trunk")); g.set(srgb("#5E4A3A"), 0.9, 0.0)
    g = G(mat("WB_Parapet")); g.set(g.mix(g.noise(g.geo.outputs["Position"], 0.4, 3), srgb("#AFAAA0"), srgb("#C4BFB5")), 0.85, 0.0)
    g = G(mat("WB_RoofEquip")); g.set(g.mix(g.noise(g.geo.outputs["Position"], 0.8, 2), srgb("#8E9193"), srgb("#B3B5B6")), 0.5, 0.4)
    g = G(mat("WB_WaterTank")); g.set(srgb("#D8D2C3"), 0.6, 0.0)
    g = G(mat("WB_Kerb")); g.set(g.mix(g.noise(g.geo.outputs["Position"], 1.0, 2), srgb("#AAA59B"), srgb("#C2BDB3")), 0.75, 0.0)
    g = G(mat("WB_RoadPaint")); g.set(srgb("#ECE9E1"), 0.6, 0.0)
    g = G(mat("WB_LampPole")); g.set(srgb("#4E5154"), 0.45, 0.6)
    g = G(mat("WB_LampHead")); g.set(srgb("#E2E0D8"), 0.35, 0.2)
    g = G(mat("WB_TimberLouvre"))                   # JR 聖橋口: vertical timber-look slats
    stripe = g.m("LESS_THAN", g.m("FRACT", g.m("MULTIPLY", g.m("ADD", g.P.outputs["X"], g.P.outputs["Y"]), 3.0)), 0.55)
    g.set(g.mix(stripe, srgb("#6E5038"), srgb("#9C7552")), 0.7, 0.0)
    g = G(mat("WB_Mast")); g.set(srgb("#8F9192"), 0.5, 0.5)
    g = G(mat("WB_Brick"))                          # red brick (万世橋高架橋), English bond
    uw = g.m("ADD", g.P.outputs["X"], g.P.outputs["Y"])
    col, fac = g.brick(g.combine(uw, g.P.outputs["Z"], 0.0), srgb("#8E3F2C"), srgb("#A65238"), srgb("#B8AE9E"), 3.2, 0.03, 0.75, 0.3)
    g.set(col, 0.85, 0.0); g.bump(fac, 0.2)
    g = G(mat("WB_SteelBlue")); g.set(g.mix(g.noise(g.geo.outputs["Position"], 0.4, 3), srgb("#5F7888"), srgb("#7A93A2")), 0.45, 0.3)
    g = G(mat("WB_ShopGlass"))                      # shop glazing: dark glass with warm interior glow
    c = g.mix(g.noise(g.geo.outputs["Position"], 0.5, 2), srgb("#4A3F33"), srgb("#8C6B45"))
    g.set(c, 0.08, 0.0)
    em = g.bsdf.inputs.get("Emission Color") or g.bsdf.inputs.get("Emission")
    if em is not None:
        em.default_value = (1.0, 0.78, 0.52, 1.0)
        if "Emission Strength" in g.bsdf.inputs: g.bsdf.inputs["Emission Strength"].default_value = 0.6
    g = G(mat("WB_ShopFascia")); g.set(srgb("#D9D4C8"), 0.6, 0.0)
    for k_, h_ in (("food", "#B5392E"), ("cafe", "#3E5E3A"), ("bar", "#6B2A30"), ("books", "#2E4A6B"), ("music", "#2B2B2E"),
                   ("conv", "#E8E6E0"), ("health", "#5C8FB8"), ("sport", "#D9772B"), ("tech", "#D8B13A"), ("other", "#9C8A72")):
        g = G(mat("WB_Awning_" + k_)); g.set(g.mix(g.noise(g.geo.outputs["Position"], 2.0, 2), shade(srgb(h_), 0.9), shade(srgb(h_), 1.08)), 0.75, 0.0)
    g = G(mat("WB_NicheDark")); g.set(g.mix(g.noise(g.geo.outputs["Position"], 0.8, 3), srgb("#3F3B36"), srgb("#58534B")), 0.95, 0.0)
    g = G(mat("WB_CopperRoof"))                      # verdigris copper tiles (湯島聖堂 photo): ridged along the slope
    rid = g.m("FRACT", g.m("MULTIPLY", g.m("ADD", g.P.outputs["X"], g.P.outputs["Y"]), 1.6))
    c = g.mix(g.noise(g.geo.outputs["Position"], 0.5, 3), srgb("#5E9585"), srgb("#79AE9C"))
    c = g.mix(g.m("MULTIPLY", g.m("LESS_THAN", rid, 0.18), 0.5), c, srgb("#4C7C6E"))
    g.set(c, 0.55, 0.1)


def foliage_materials():
    for name, a, b in (("WB_Ginkgo", "#D9A62C", "#EFC54A"), ("WB_Maple", "#B23A26", "#D2553A"),
                       ("WB_Orange", "#CC6A24", "#E58C3A"), ("WB_Evergreen", "#4F6B3A", "#6E8A52")):
        g = G(mat(name))
        c = g.mix(g.noise(g.geo.outputs["Position"], 0.6, 3), srgb(a), srgb(b))
        g.set(c, 0.8, 0.0)


def apply(scene):
    random.seed(5)
    ground_materials(); road_materials(); structure_materials(); foliage_materials()
    F = build_facades()
    counts = {}
    for c in ("08_Buildings", "09_Landmarks"):
        col = bpy.data.collections.get(c)
        if not col: continue
        for ob in col.objects:
            if ob.type != "MESH" or not ob.data.vertices: continue
            if ob.name.startswith(("Rooftop_", "Seido_", "HL_", "Shops_")): continue
            if "facade" in ob:                              # landmark detail: material chosen by the builder
                ob.data.materials.clear(); ob.data.materials.append(mat(ob["facade"])); continue
            vs = ob.data.vertices
            ob["cx"] = sum(v.co.x for v in vs) / len(vs); ob["cy"] = sum(v.co.y for v in vs) / len(vs)
            if "height_m" not in ob: ob["height_m"] = max(v.co.z for v in vs) - min(v.co.z for v in vs)
            rnd = random.Random(ob.name)
            fm = pick_facade(ob, F, rnd)
            ob.data.materials.clear(); ob.data.materials.append(fm); ob.data.materials.append(mat("WB_Parapet"))
            counts[fm.name] = counts.get(fm.name, 0) + 1
    return counts

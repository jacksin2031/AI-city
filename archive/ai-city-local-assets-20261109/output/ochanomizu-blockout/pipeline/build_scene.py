"""Build a layered, Z-resolved Ochanomizu blockout model -> scene.json

Sources
  * GSI dem5a_png z15 (laser ground surface, T.P. m)        -> terrain, at-grade Z
  * PLATEAU 2020 Tokyo 23-ku LOD1 (indigo-lab MVT mirror)    -> footprints + measuredHeight
  * OpenStreetMap (Overpass, fetched 2026-10-29)             -> roads, rails, layer/bridge/tunnel, water, green, names
Everything that is not directly in a source is flagged "estimated" (推定).
"""
import json, math, os, random, glob
from collections import defaultdict
import numpy as np
import mapbox_vector_tile as mvt
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box, shape
from shapely.ops import unary_union, polygonize, linemerge
from shapely.strtree import STRtree
from shapely.prepared import prep
from geo import DEM, load_osm, to_local, BOUNDS, DATA, LAT0, LON0

random.seed(7)
dem = DEM()
nodes, ways, rels = load_osm()
way_by_id = {w["id"]: w for w in ways}
BX = box(*BOUNDS)
BXP = prep(BX)
WATER_Z = 1.0          # 推定: DEM5A near-channel minima 0.4–2.8 m T.P.
BED_Z = -1.5           # 推定
EST = []               # list of estimate notes

def note(s):
    if s not in EST: EST.append(s)

def ll(w):
    return [nodes[i] for i in w["nodes"] if i in nodes]

def tags(e): return e.get("tags", {})

def layer_of(t):
    try: return int(float(t.get("layer", "0").split(";")[0]))
    except ValueError: return 0

# ---------------------------------------------------------------- water
def rel_polys(rel):
    lines = [LineString(ll(way_by_id[m["ref"]])) for m in rel["members"]
             if m["type"] == "way" and m["ref"] in way_by_id and len(ll(way_by_id[m["ref"]])) > 1]
    return list(polygonize(linemerge(lines)))

water_parts = []
for w in ways:
    t = tags(w)
    if t.get("natural") == "water" and len(w["nodes"]) > 3 and w["nodes"][0] == w["nodes"][-1]:
        water_parts.append(Polygon(ll(w)))
for r in rels:
    if tags(r).get("natural") == "water":
        water_parts += rel_polys(r)
water = unary_union([p.buffer(0) for p in water_parts]).intersection(BX)
print("water area", round(water.area))

# ---------------------------------------------------------------- terrain grid
STEP = 2.0
gx = np.arange(BOUNDS[0], BOUNDS[2] + 0.01, STEP)
gy = np.arange(BOUNDS[1], BOUNDS[3] + 0.01, STEP)
Z = np.array([[dem(x, y) for x in gx] for y in gy])
from shapely import vectorized
XX, YY = np.meshgrid(gx, gy)
in_water = vectorized.contains(water, XX, YY)
# carve channel: water cells to river bed, 1-cell ring to just above water (revetment toe)
from scipy import ndimage
from scipy import ndimage as _nd
Z = _nd.gaussian_filter(Z, 0.7)
carve = vectorized.contains(water.buffer(1.5), XX, YY)
Z[carve] = BED_Z
in_water = carve
note("神田川: 水面 T.P.+1.0m / 河床 -1.5m は推定（DEM5A の水域は欠測）")

# ---------------------------------------------------------------- green / plaza polygons
green, plaza = [], []
for w in ways:
    t = tags(w)
    if len(w["nodes"]) < 4 or w["nodes"][0] != w["nodes"][-1]: continue
    p = Polygon(ll(w)).buffer(0)
    if not p.intersects(BX): continue
    if t.get("natural") in ("wood", "scrub", "grassland") or t.get("landuse") in ("grass", "forest", "religious") \
            or t.get("leisure") in ("park", "garden"):
        green.append((p, t))
    elif t.get("area:highway") or (t.get("highway") == "pedestrian" and t.get("area") == "yes") or t.get("place") == "square":
        plaza.append((p, t))
green_u = unary_union([g for g, _ in green]).intersection(BX) if green else Polygon()
plaza_u = unary_union([g for g, _ in plaza]).intersection(BX) if plaza else Polygon()

# ---------------------------------------------------------------- PLATEAU buildings
def tile_to_lonlat(z, X, Y, cx, cy, ext):
    n = 2 ** z
    lon = (X + cx / ext) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (Y + cy / ext) / n))))
    return lat, lon

parts = defaultdict(list); attrs = {}
for f in glob.glob(os.path.join(DATA, "plateau-tokyo23ku-building-mvt-2020_*.pbf")):
    _, X, Y = os.path.basename(f)[:-4].rsplit("_", 2)
    X, Y = int(X), int(Y)
    t = mvt.decode(open(f, "rb").read(), default_options={"y_coord_down": True})
    for layer in t.values():
        ext = layer.get("extent", 4096)
        for feat in layer["features"]:
            g = feat["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
            for pc in polys:
                ring = [to_local(*tile_to_lonlat(16, X, Y, cx, cy, ext)) for cx, cy in pc[0]]
                if len(ring) >= 4:
                    parts[feat["properties"].get("建物ID")].append(Polygon(ring).buffer(0))
            attrs[feat["properties"].get("建物ID")] = feat["properties"]

# OSM building names / heights for matching
osm_b = []
for w in ways:
    t = tags(w)
    if "building" in t and len(w["nodes"]) > 3:
        p = Polygon(ll(w)).buffer(0)
        if p.is_valid and p.area > 1: osm_b.append((p, t))
for r in rels:
    t = tags(r)
    if "building" in t:
        for p in rel_polys(r):
            osm_b.append((p.buffer(0), t))
osm_tree = STRtree([p for p, _ in osm_b])

LANDMARKS = {
    "御茶ノ水ソラシティ": "sola_city", "ワテラスタワー": "waterras_tower", "ワテラス アネックス": "waterras_annex",
    "明治大学リバティタワー": "meiji_liberty_tower", "日本大学病院": "nihon_univ_hospital",
    "順天堂大学医学部付属順天堂医院B棟": "juntendo_b", "順天堂大学A棟": "juntendo_a",
    "御茶ノ水": "jr_ochanomizu_station", "ニコライ堂": "nikolai_do", "聖ニコライ記念聖堂": "nikolai_do",
    "新お茶の水ビル オフィスタワー": "shin_ochanomizu_bldg", "お茶の水サンクレール": "sanclair",
    "アカデミーコモン": "meiji_academy_common", "日本大学理工学部駿河台校舎タワー・スコラ": "nihon_u_tower_scola",
}

def osm_match(poly):
    best, bt = 0, None
    for i in osm_tree.query(poly):
        p, t = osm_b[i]
        a = p.intersection(poly).area
        if a > best: best, bt = a, t
    return bt if best > 0.3 * poly.area else None

buildings = []
seen = []
for bid, ps in parts.items():
    g = unary_union(ps).buffer(0.3).buffer(-0.3)
    if g.is_empty or not BXP.intersects(g): continue
    g = g.intersection(BX)
    a = attrs[bid]
    h = a.get("measuredHeight")
    geoms = [g] if g.geom_type == "Polygon" else [x for x in getattr(g, "geoms", []) if x.geom_type == "Polygon"]
    for gp in geoms:
        if gp.area < 6: continue
        gp = gp.simplify(0.25)
        if gp.is_empty or gp.geom_type != "Polygon": continue
        t = osm_match(gp)
        src = "plateau"
        if h is None or h <= 0:
            if t and t.get("height"): h2, src = float(t["height"]), "osm_height"
            elif t and t.get("building:levels"): h2, src = float(t["building:levels"]) * 3.4, "osm_levels_est"
            else: h2, src = 7.0, "default_est"
        else: h2 = float(h)
        ring = list(gp.exterior.coords)[:-1]
        zs = [dem(x, y) for x, y in ring] + [dem(*gp.representative_point().coords[0])]
        base = min(zs)
        # buildings whose footprint dips into the river channel stand on the bank, not the bed
        base = max(base, WATER_Z + 0.5)
        name = (t or {}).get("name")
        buildings.append(dict(id=bid, name=name, osm_building=(t or {}).get("building"), landmark=LANDMARKS.get(name), poly=[[round(x, 2), round(y, 2)] for x, y in ring],
                              base=round(base, 2), ground_max=round(max(zs), 2), top=round(base + h2, 2), height=round(h2, 2), height_src=src,
                              underground=int((t or {}).get("building:levels:underground", "0").strip("-") or 0) if (t or {}).get("building:levels:underground", "0").strip("-").isdigit() else 0))
        seen.append(gp)
print("plateau buildings", len(buildings))

# OSM-only buildings (not covered by PLATEAU 2020)
seen_tree = STRtree(seen)
added = 0
osm_added = []
for p, t in osm_b:
    if not BXP.intersects(p) or t.get("building") in ("roof", "train_station") : continue
    p = p.intersection(BX)
    if p.is_empty or p.area < 6: continue
    cov = sum(seen[i].intersection(p).area for i in seen_tree.query(p))
    if cov > 0.25 * p.area: continue
    if any(q.intersection(p).area > 0.25 * min(p.area, q.area) for q in osm_added): continue   # way + multipolygon duplicates
    osm_added.append(p)
    p = p.intersection(BX).simplify(0.25)
    if p.geom_type != "Polygon" or p.area < 6: continue
    if t.get("height"): h, src = float(t["height"]), "osm_height"
    elif t.get("building:levels"): h, src = float(t["building:levels"]) * 3.4, "osm_levels_est"
    else: h, src = 9.0, "default_est"
    ring = list(p.exterior.coords)[:-1]
    zs = [dem(x, y) for x, y in ring]
    base = max(min(zs), WATER_Z + 0.5)
    buildings.append(dict(id="osm", name=t.get("name"), osm_building=t.get("building"), landmark=LANDMARKS.get(t.get("name")), poly=[[round(x, 2), round(y, 2)] for x, y in ring],
                          base=round(base, 2), ground_max=round(max(zs), 2), top=round(base + h, 2), height=round(h, 2), height_src=src, underground=0))
    added += 1
print("osm-only buildings", added)
note("建物高さ: PLATEAU 2020 measuredHeight を最低地盤（DEM5A）から立ち上げ。欠測は OSM height/階数×3.4m/既定値で推定（height_src 参照）")
# drop near-duplicate footprints (coincident faces render black in Cycles and break collision)
_keep, _polys = [], []
for b in sorted(buildings, key=lambda b: (b["height_src"] != "plateau", -Polygon(b["poly"]).area)):
    p = Polygon(b["poly"]).buffer(0)
    if any(q.intersection(p).area > 0.5 * min(p.area, q.area) for q in _polys if q.distance(p) < 1): continue
    _keep.append(b); _polys.append(p)
print("dedup removed", len(buildings) - len(_keep))
buildings = _keep

# ---------------------------------------------------------------- podium / tower split from OSM building:part + nested outlines
# PLATEAU LOD1 extrudes a whole complex to its maximum height. Where OSM maps the tower (or parts) inside the
# footprint, the tower keeps PLATEAU measuredHeight and the rest becomes podium(s).
def _num(v):
    try: return float(str(v).split()[0].replace("m", ""))
    except (TypeError, ValueError): return None

subs_src = [(p, t, "building") for p, t in osm_b]
_pj = os.path.join(DATA, "parts.json")
if os.path.exists(_pj):
    _d = json.load(open(_pj, encoding="utf8"))
    _N = {e["id"]: to_local(e["lat"], e["lon"]) for e in _d["elements"] if e["type"] == "node"}
    for e in _d["elements"]:
        if e["type"] == "way" and e.get("tags") and len(e["nodes"]) > 3:
            subs_src.append((Polygon([_N[n] for n in e["nodes"] if n in _N]).buffer(0), e["tags"], "part"))
_sub_tree = STRtree([p for p, _, _ in subs_src])
TOWER_WORDS = ("タワー", "Tower", "tower")
split_out, n_split = [], 0
for b in buildings:
    P = Polygon(b["poly"]).buffer(0)
    if b["height_src"] != "plateau" or P.area < 150:
        split_out.append(b); continue
    cands, main_h = [], None
    for i in _sub_tree.query(P):
        p, t, kind = subs_src[i]
        if not p.is_valid or p.area < 25: continue
        inter = p.intersection(P)
        if inter.area < 0.6 * p.area: continue
        h = _num(t.get("height")) if kind == "part" else None
        lv = _num(t.get("building:levels"))
        if inter.area > 0.85 * P.area:          # the complex's own outline: its OSM height/levels describe the body
            if kind == "building":
                oh = _num(t.get("height")); main_h = (oh, "osm_height(body)") if oh else ((lv * 3.4, "osm_levels_est(body)") if lv else main_h)
            continue
        towerish = kind == "part" and h is not None or any(w in (t.get("name") or "") for w in TOWER_WORDS)
        cands.append(dict(poly=inter, h=h, lv=lv, kind=kind, name=t.get("name"), towerish=towerish, roof=t.get("roof:shape")))
    if not any(c["towerish"] for c in cands):
        split_out.append(b); continue
    # tallest towerish sub gets the measured height
    tw = max((c for c in cands if c["towerish"]), key=lambda c: (c["h"] or 0, c["poly"].area))
    body_h, body_src = main_h if main_h and main_h[0] < b["height"] - 1 else (min(18.0, b["height"]), "podium_default_est")
    if tw["roof"] != "dome" and (tw["poly"].area < 150 or b["height"] - body_h < 8):
        split_out.append(b); continue
    taken = Polygon()
    pieces = []
    for c in sorted(cands, key=lambda c: (c is not tw, c["kind"] != "part", -(c["h"] or 0))):
        g = c["poly"].difference(taken).buffer(0)
        if g.area < 15: continue
        if c is tw: h, src = b["height"], "plateau(tower)"
        elif c["h"]: h, src = min(c["h"], b["height"]), "osm_part_height"
        elif c["lv"] and c["lv"] * 3.4 < 0.6 * b["height"]: h, src = c["lv"] * 3.4, "osm_levels_est(podium)"
        else: h, src = body_h, body_src
        pieces.append((g, h, src, c.get("roof"), c.get("name") or b["name"]))
        taken = taken.union(g)
    rest = P.difference(taken).buffer(-0.2).buffer(0.2)
    for g in ([rest] if rest.geom_type == "Polygon" else list(getattr(rest, "geoms", []))):
        if g.area > 30: pieces.append((g, body_h, body_src, None, b["name"]))
    n_split += 1
    for k, (g, h, src, roof, nm) in enumerate(pieces):
        for gg in ([g] if g.geom_type == "Polygon" else [x for x in getattr(g, "geoms", []) if x.geom_type == "Polygon"]):
            gg = gg.simplify(0.25)
            if gg.area < 15: continue
            nb = dict(b); nb.update(poly=[[round(x, 2), round(y, 2)] for x, y in list(gg.exterior.coords)[:-1]],
                                    top=round(b["base"] + h, 2), height=round(h, 2), height_src=src, part_of=b["id"], roof=roof,
                                    name=nm, landmark=b["landmark"] if src == "plateau(tower)" or b["landmark"] else None)
            split_out.append(nb)
    print("split", b["name"], [(round(g.area), round(h, 1), src) for g, h, src, _, _ in pieces])
buildings = split_out
note(f"基壇／タワー分割: OSM building:part・内包する建物輪郭がある {n_split} 棟を分割。タワーは PLATEAU 実測高、基壇は OSM 高さ／階数×3.4m、情報なしは 18m（推定、height_src 参照）")
bld_union = unary_union([Polygon(b["poly"]) for b in buildings]).buffer(0)

# ---------------------------------------------------------------- line network (roads + rails) with Z solve
ROAD_W = {"motorway": 20, "trunk": 18, "primary": 15, "secondary": 13, "tertiary": 9, "unclassified": 6.5,
          "residential": 5, "living_street": 4.5, "service": 4, "pedestrian": 5, "footway": 2.4, "path": 2,
          "steps": 3, "cycleway": 2, "track": 3}
SKIP_HW = {"corridor", "elevator", "platform", "construction", "proposed", "bus_stop", "raceway"}

lines = []   # dict(id, kind, cls, tags, nodes[list of node ids], bridge, tunnel, layer)
for w in ways:
    t = tags(w)
    if "highway" in t and t["highway"] in ROAD_W and t["highway"] not in SKIP_HW and t.get("area") != "yes" and not t.get("indoor"):
        kind = "road"
    elif t.get("railway") in ("rail", "subway", "light_rail") and t.get("service") not in ("yard",):
        kind = "rail"
    else:
        continue
    pts = ll(w)
    if len(pts) < 2: continue
    ls = LineString(pts)
    if not ls.intersects(BX.buffer(80)): continue
    lines.append(dict(id=w["id"], kind=kind, cls=t.get("highway") or t.get("railway"), tags=t, nodes=[n for n in w["nodes"] if n in nodes],
                      bridge=bool(t.get("bridge")) and t.get("bridge") != "no", tunnel=t.get("tunnel") in ("yes", "culvert") or (t.get("tunnel") not in (None, "no", "building_passage") and layer_of(t) < 0),
                      layer=layer_of(t), embank=t.get("embankment") == "yes"))

def surface_max(x, y, r=25):
    return max(dem(x + dx, y + dy) for dx in (-r, 0, r) for dy in (-r, 0, r))

# node classification
node_lines = defaultdict(list)
for L in lines:
    for n in L["nodes"]: node_lines[n].append(L)

# one shared track-level field for all at-grade JR track: low percentile of DEM over a 22 m disc, so parallel
# tracks and joints between OSM ways get the same height (no steps) and decks / buildings over the tracks
# (covered section under the 御茶ノ水橋 station building) don't pull the rail level up.
from scipy.spatial import cKDTree
_trk = []
for L in lines:
    if L["kind"] == "rail" and L["cls"] == "rail" and not (L["bridge"] or L["tunnel"] or L["embank"]):
        ns = L["nodes"]
        for a_, b_ in zip(ns, ns[1:]):
            (x0, y0), (x1, y1) = nodes[a_], nodes[b_]
            k = max(1, int(math.dist((x0, y0), (x1, y1)) / 3.0))
            for j in range(k + 1):
                x, y = x0 + (x1 - x0) * j / k, y0 + (y1 - y0) * j / k
                _trk.append((x, y, dem(x, y)))
_trk = np.array(_trk)
_ttree = cKDTree(_trk[:, :2])
def track_level(x, y):
    idx = _ttree.query_ball_point((x, y), 22.0)
    return float(np.percentile(_trk[idx, 2], 30)) if len(idx) >= 3 else dem(x, y)
note("JR 地上區間軌面: 22m 半徑內 DEM 第 30 百分位（所有並行軌道共用，避免接縫高低差）；盛土區間（OSM embankment=yes）在車站與橋梁之間以斜坡解算（推定）")

def rail_profile(L, step=3.0, half=15):
    """Low-percentile DEM along an at-grade track: ignores bank tops / bridge decks interpolated into DEM5A."""
    ns = L["nodes"]
    samp, node_at = [], {}
    for i in range(len(ns) - 1):
        (x0, y0), (x1, y1) = nodes[ns[i]], nodes[ns[i + 1]]
        k = max(1, int(math.dist((x0, y0), (x1, y1)) / step))
        node_at[ns[i]] = len(samp)
        for j in range(k):
            t_ = j / k; samp.append(dem(x0 + (x1 - x0) * t_, y0 + (y1 - y0) * t_))
    node_at[ns[-1]] = len(samp); samp.append(dem(*nodes[ns[-1]]))
    pos = []
    for i in range(len(ns) - 1):
        (x0, y0), (x1, y1) = nodes[ns[i]], nodes[ns[i + 1]]
        k = max(1, int(math.dist((x0, y0), (x1, y1)) / step))
        for j in range(k): pos.append((x0 + (x1 - x0) * j / k, y0 + (y1 - y0) * j / k))
    pos.append(nodes[ns[-1]])
    if L["cls"] == "rail":
        prof = np.array([track_level(x, y) for x, y in pos])
    else:
        a = np.array(samp)
        prof = np.array([np.median(a[max(0, i - half):i + half + 1]) for i in range(len(a))])
    return prof, node_at

rail_fixed = {}
for L in lines:
    if L["kind"] == "rail" and not (L["bridge"] or L["tunnel"] or L["embank"]):
        prof, node_at = rail_profile(L)
        L["profile"] = prof
        for n, i in node_at.items():
            rail_fixed[n] = min(rail_fixed.get(n, 99), prof[i])

_rbn = np.array([nodes[n] for L in lines if L["kind"] == "rail" and L["cls"] == "rail" and L["bridge"] for n in L["nodes"]])
_rbtree = cKDTree(_rbn) if len(_rbn) else None
def near_rail_bridge(x, y, r=60.0):
    return _rbtree is not None and _rbtree.query((x, y))[0] < r

fixed, prior = {}, {}
freed = set()
for n, Ls in node_lines.items():
    x, y = nodes[n]
    if n in rail_fixed and all(L["kind"] == "rail" for L in Ls) and near_rail_bridge(x, y):
        # approach to a rail bridge: free node, so the line ramps gradually (realistic gradient) instead of stepping
        prior[n] = (rail_fixed[n] + 0.45, 0.004); freed.add(n)
        continue
    grade = [L for L in Ls if not L["bridge"] and not L["tunnel"] and not L.get("embank")]
    if grade:
        off = 0.45 if any(L["kind"] == "rail" for L in grade) else 0.12
        g = dem(x, y)
        if any(L["bridge"] and L["kind"] == "road" and L["cls"] not in ("footway", "steps", "path") for L in Ls):
            g = max(dem(x + dx, y + dy) for dx in (-8, 0, 8) for dy in (-8, 0, 8))   # abutment sits on the bank top
        if n in rail_fixed: g = rail_fixed[n]
        fixed[n] = g + off
        continue
    L = Ls[0]
    if L["tunnel"]:
        depth = {"subway": 9.0, "rail": 8.0}.get(L["cls"], 4.5)
        if "千代田" in L["tags"].get("name", ""): depth = 24.0
        lay = min(L["layer"], -1)
        prior[n] = (surface_max(x, y) - depth - 6.0 * (abs(lay) - 1), 0.01)
    elif L.get("embank"):   # embankment: ramp freely between the fixed station level and the bridge
        prior[n] = (dem(x, y) + 2.0, 0.002)
    else:  # bridge
        g = dem(x, y)
        if L["kind"] == "rail":
            prior[n] = (g + 6.5 + 3.0 * max(L["layer"] - 1, 0), 0.02)
        elif L["cls"] in ("footway", "pedestrian", "path", "steps", "cycleway"):
            prior[n] = (g + 6.0, 0.3)
        else:
            prior[n] = (g + 6.0, 0.002)
note("橋梁・高架・トンネル内の標高: 地上区間（DEM5A）に固定し、間をグラフ補間＋交差クリアランス制約で解いた推定値")
note("地下鉄トンネル深さ: 丸ノ内線=地表最大値-9m、千代田線=-24m（新御茶ノ水駅付近）を事前値とした推定")

adj = defaultdict(list)
for L in lines:
    ns = L["nodes"]
    for a, b in zip(ns, ns[1:]):
        d = max(math.dist(nodes[a], nodes[b]), 0.5)
        adj[a].append((b, 1 / d)); adj[b].append((a, 1 / d))

z = {n: fixed.get(n, prior.get(n, (0, 0))[0]) for n in node_lines}
anchors = {}

def solve(iters=4000):
    free = [n for n in node_lines if n not in fixed]
    for _ in range(iters):
        delta = 0
        for n in free:
            if n in anchors:
                z[n] = anchors[n][0]; continue
            p, lam = prior[n]
            s = lam * p; ws = lam
            for m, wgt in adj[n]:
                s += wgt * z[m]; ws += wgt
            nz = s / ws
            delta = max(delta, abs(nz - z[n])); z[n] = nz
        if delta < 1e-4: break

def seg_z(L, i, t_):
    a, b = L["nodes"][i], L["nodes"][i + 1]
    return z[a] * (1 - t_) + z[b] * t_

def clearance(upper, lower):
    if lower["tunnel"]:
        if upper["kind"] == "rail": return 4.5
        return 2.5 if upper["cls"] in ("footway", "path", "steps", "cycleway") else 3.5
    if lower["kind"] == "rail" and upper["kind"] != "rail": return 6.3
    if lower["kind"] == "rail" and upper["kind"] == "rail": return 6.0
    if upper["tunnel"]: return 4.5
    return 5.0

def crossing_pass():
    """Enforce OSM layer order at 2D crossings by anchoring the free (bridge/tunnel) side only."""
    segs = []
    for L in lines:
        ns = L["nodes"]
        for i in range(len(ns) - 1):
            segs.append((L, i, LineString([nodes[ns[i]], nodes[ns[i + 1]]])))
    tree = STRtree([s[2] for s in segs])
    fixes = 0
    for a, (L, i, g) in enumerate(segs):
        for j in tree.query(g):
            if j <= a: continue
            M, k, h = segs[j]
            if M is L or M["layer"] == L["layer"]: continue
            if L["kind"] == "road" and M["kind"] == "road" and not (L["bridge"] or L["tunnel"] or M["bridge"] or M["tunnel"]): continue
            if set(L["nodes"][i:i + 2]) & set(M["nodes"][k:k + 2]) or not g.crosses(h): continue
            ip = g.intersection(h)
            if ip.is_empty or ip.geom_type != "Point": continue
            U, iu, gu, D, idn, gd = (L, i, g, M, k, h) if L["layer"] > M["layer"] else (M, k, h, L, i, g)
            zU = seg_z(U, iu, gu.project(ip) / max(gu.length, 1e-6))
            zD = seg_z(D, idn, gd.project(ip) / max(gd.length, 1e-6))
            c = clearance(U, D)
            if zU - zD >= c - 0.05: continue
            u_free = all(n not in fixed for n in U["nodes"][iu:iu + 2])
            d_free = all(n not in fixed for n in D["nodes"][idn:idn + 2])
            if d_free and (D["tunnel"] or not u_free):
                for n in D["nodes"][idn:idn + 2]:
                    if anchors.get(n, (None, 0))[1] == +1: continue
                    anchors[n] = (min(anchors.get(n, (99, -1))[0], zU - c), -1); fixes += 1
            elif u_free:
                for n in U["nodes"][iu:iu + 2]:
                    if anchors.get(n, (None, 0))[1] == -1: continue
                    anchors[n] = (max(anchors.get(n, (-99, +1))[0], zD + c), +1); fixes += 1
    return fixes

water_p = prep(water.buffer(1))
solve()
for it in range(8):
    f = crossing_pass()
    for L in lines:
        if L["bridge"]:
            for n in L["nodes"]:
                if n not in fixed and water_p.contains(Point(nodes[n])) and z[n] < WATER_Z + 3.5 and n not in anchors:
                    anchors[n] = (WATER_Z + 3.5, +1); f += 1
    print("crossing fixes", it, f)
    solve()
    if not f: break

# densify + clip
def densify(L, step=3.0):
    out = []; seg = []
    ns = L["nodes"]
    for i in range(len(ns) - 1):
        (x0, y0), (x1, y1) = nodes[ns[i]], nodes[ns[i + 1]]
        d = math.dist((x0, y0), (x1, y1)); k = max(1, int(d / step))
        for j in range(k):
            t_ = j / k
            x, y = x0 + (x1 - x0) * t_, y0 + (y1 - y0) * t_
            zz = seg_z(L, i, t_)
            out.append([x, y, zz]); seg.append(i)
    x, y = nodes[ns[-1]]; out.append([x, y, z[ns[-1]]]); seg.append(len(ns) - 2)
    if L.get("profile") is not None and len(L["profile"]) == len(out):
        for p, v, i in zip(out, L["profile"], seg):
            if ns[i] in freed or ns[i + 1] in freed: continue          # ramp segment: keep the solved (linear) grade
            p[2] = v + 0.45
    elif not (L["bridge"] or L["tunnel"] or L.get("embank")):  # at grade: drape exactly on DEM between nodes
        off = 0.45 if L["kind"] == "rail" else 0.12
        for p in out:
            p[2] = dem(p[0], p[1]) + off
            if water_p.contains(Point(p[0], p[1])) and L["kind"] == "road": p[2] = max(p[2], WATER_Z + 3)
    return out

def clip_runs(pts):
    runs, cur = [], []
    for p in pts:
        if BOUNDS[0] <= p[0] <= BOUNDS[2] and BOUNDS[1] <= p[1] <= BOUNDS[3]:
            cur.append([round(v, 2) for v in p])
        else:
            if len(cur) > 1: runs.append(cur)
            cur = []
    if len(cur) > 1: runs.append(cur)
    return runs

roads, rails, underground = [], [], []
for L in lines:
    pts = densify(L)
    t = L["tags"]
    for run in clip_runs(pts):
        rec = dict(id=L["id"], cls=L["cls"], name=t.get("name"), bridge=L["bridge"], tunnel=L["tunnel"], layer=L["layer"], pts=run,
                   z_src="dem" if not (L["bridge"] or L["tunnel"]) else "solved_est")
        if L["kind"] == "road":
            rec["width"] = ROAD_W[L["cls"]] if not t.get("width") else float(str(t["width"]).split()[0].replace("m", "") or ROAD_W[L["cls"]])
            rec["sidewalk"] = t.get("footway") == "sidewalk"
            rec["footway"] = t.get("footway")
            rec["oneway"] = t.get("oneway") in ("yes", "-1")
            (underground if L["tunnel"] else roads).append(rec)
        else:
            rec["line"] = t.get("name")
            rec["embankment"] = bool(L.get("embank")); rec["bridge_kind"] = t.get("bridge")
            rec["gauge"] = t.get("gauge")
            rails.append(rec)

# JR gradient limiter: railways cannot climb steeply. Only RAISES valleys (keeps clearance humps), max 3.5 %,
# then re-syncs shared joints between OSM ways; iterated so the whole network converges.
GMAX = 0.035
jr_runs = [r for r in rails if r["cls"] == "rail" and not r["tunnel"]]
for _ in range(6):
    for r in jr_runs:
        p = r["pts"]
        for rng in (range(1, len(p)), range(len(p) - 2, -1, -1)):
            for i in rng:
                j = i - 1 if rng.step == 1 else i + 1
                p[i][2] = max(p[i][2], p[j][2] - GMAX * math.dist(p[i][:2], p[j][:2]))
    ends_ = [(r, 0) for r in jr_runs] + [(r, -1) for r in jr_runs]
    for r, k in ends_:
        e = r["pts"][k]
        grp = [(r2, k2) for r2, k2 in ends_ if math.dist(r2["pts"][k2][:2], e[:2]) < 1.5]
        zmax = max(r2["pts"][k2][2] for r2, k2 in grp)
        for r2, k2 in grp: r2["pts"][k2][2] = zmax
note("JR 縦断勾配: 最大 3.5% に制限（谷側のみ持ち上げ、交差クリアランスは維持）")

# platforms
# revetment walls along the channel edge: bed -> top (DEM 3 m landward, clamped)
revet = []
for p in (water.geoms if hasattr(water, "geoms") else [water]):
    ring = LineString(p.exterior.coords)
    k = max(4, int(ring.length / 3))
    pts_ = []
    for i in range(k + 1):
        q = ring.interpolate(i / k, normalized=True)
        # landward normal: probe both sides, the one outside water is land
        q2 = ring.interpolate(min(i / k + 0.002, 1), normalized=True)
        dx, dy = q2.x - q.x, q2.y - q.y; L_ = math.hypot(dx, dy) or 1
        nx_, ny_ = -dy / L_, dx / L_
        if water.contains(Point(q.x + nx_ * 2, q.y + ny_ * 2)): nx_, ny_ = -nx_, -ny_
        top = dem(q.x + nx_ * 4, q.y + ny_ * 4)
        top = min(max(top, WATER_Z + 2.5), WATER_Z + 6.0)
        if BXP.contains(q): pts_.append([round(q.x + nx_ * 1.5, 2), round(q.y + ny_ * 1.5, 2), round(top, 2)])
    revet.append(pts_)
note("護岸: 水面+2.5〜+6.0m の鉛直護岸として表現（高さは陸側 DEM から推定）")

platforms = []
rail_pts = np.array([p for r in rails for p in r["pts"]])
for w in ways:
    t = tags(w)
    if t.get("railway") == "platform" or t.get("public_transport") == "platform" and "railway" in t:
        if len(w["nodes"]) < 4 or w["nodes"][0] != w["nodes"][-1]: continue
        p = Polygon(ll(w)).buffer(0)
        if not p.intersects(BX): continue
        c = p.centroid
        d = np.hypot(rail_pts[:, 0] - c.x, rail_pts[:, 1] - c.y)
        idx = np.argsort(d)[:6]
        zz = float(np.median(rail_pts[idx, 2])) + 0.65
        p = p.intersection(BX)
        if p.geom_type != "Polygon": continue
        cp_ = p.buffer(-0.8)
        cp_ = cp_ if cp_.geom_type == "Polygon" else p
        platforms.append(dict(id=w["id"], poly=[[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]], z=round(zz, 2),
                              canopy_poly=[[round(x, 2), round(y, 2)] for x, y in list(cp_.exterior.coords)[:-1]],
                              underground=bool(t.get("tunnel")) or layer_of(t) < 0))
note("ホーム高さ: 隣接軌道面+1.1m（レール面+0.65m基準）推定")

# station roofs / decks recorded by PLATEAU as buildings over the tracks -> canopy slabs (not solid blocks)
rail_corr = unary_union([LineString([p[:2] for p in r["pts"]]).buffer(2.2) for r in rails if not r["tunnel"]]
                        + [Polygon(p["poly"]).buffer(1.0) for p in platforms if not p["underground"]])
for b in buildings:
    fp = Polygon(b["poly"])
    b["over_track"] = bool(fp.is_valid and fp.area > 0 and fp.intersection(rail_corr).area > 0.3 * fp.area)
    if b["over_track"]:
        mrr = fp.minimum_rotated_rectangle; e = list(mrr.exterior.coords)
        sides = sorted([math.dist(e[0], e[1]), math.dist(e[1], e[2])])
        b["canopy"] = sides[0] < 22 and sides[1] > 50      # long thin => platform roof (上屋)
        b["deck_z"] = round(float(np.median([p[2] for r in rails if not r["tunnel"] for p in r["pts"] if fp.buffer(3).contains(Point(p[0], p[1]))] or [b["base"]])), 2)
note("PLATEAU で線路上に記録された駅舎・上屋（線路回廊と30%以上重複）は軌道面上の上屋スラブ＋柱として表現（柱位置は推定）")

# ---------------------------------------------------------------- vegetation scatter
trees = []
roads_buf = unary_union([LineString([p[:2] for p in r["pts"]]).buffer(r["width"] / 2) for r in roads if not r["bridge"]])
no_tree = unary_union([bld_union.buffer(1.5), roads_buf, water.buffer(3.0)])
for g, t in green:
    g = g.intersection(BX).difference(no_tree)
    if g.is_empty: continue
    dens = 0.75 if t.get("landuse") == "religious" else 0.55
    minx, miny, maxx, maxy = g.bounds
    pg = prep(g)
    sp = 6.5
    yy = miny
    while yy < maxy:
        xx = minx
        while xx < maxx:
            px, py = xx + random.uniform(-2, 2), yy + random.uniform(-2, 2)
            if random.random() < dens and pg.contains(Point(px, py)) and dem(px, py) > WATER_Z + 3:
                h = random.uniform(8, 15) if t.get("landuse") == "religious" else random.uniform(6, 12)
                trees.append([round(px, 2), round(py, 2), round(dem(px, py), 2), round(h, 1), round(h * random.uniform(0.28, 0.38), 1)])
            xx += sp
        yy += sp
for w in ways:
    t = tags(w)
    if t.get("natural") == "tree_row":
        ls = LineString(ll(w))
        k = int(ls.length / 8)
        for i in range(k + 1):
            p = ls.interpolate(i * 8)
            if BXP.contains(p) and not bld_union.contains(p):
                trees.append([round(p.x, 2), round(p.y, 2), round(dem(p.x, p.y), 2), 9.0, 3.0])
    if t.get("natural") == "tree":
        pass
for n in [e for e in json.load(open(os.path.join(DATA, "osm.json"), encoding="utf8"))["elements"] if e["type"] == "node" and tags(e).get("natural") == "tree"]:
    x, y = to_local(n["lat"], n["lon"])
    if BXP.contains(Point(x, y)): trees.append([round(x, 2), round(y, 2), round(dem(x, y), 2), 8.0, 2.6])
note("樹木: OSM 緑地ポリゴン内に 6.5m 格子で配置したプレースホルダ（位置・樹高は推定）")
print("trees", len(trees))

# ---------------------------------------------------------------- terrain classes
cls = np.zeros(Z.shape, dtype=np.uint8)              # 0 ground
cls[vectorized.contains(green_u, XX, YY)] = 2 if not green_u.is_empty else 0
cls[vectorized.contains(plaza_u, XX, YY)] = 3 if not plaza_u.is_empty else 0
cls[in_water] = 1
gy_, gx_ = np.gradient(Z, STEP)
slope = np.hypot(gx_, gy_)
cls[(slope > 1.2) & (cls != 1)] = 4                  # steep (> 50°) -> retaining wall / cut face

# ---------------------------------------------------------------- Sola City sunken plaza (推定) & underground links
special = []
sola = next((b for b in buildings if b["landmark"] == "sola_city"), None)
sola_plaza = None
if sola:
    # ---- ソラシティ B1 サンクンプラザ（詳細）----
    # Plan: DEM5A depression (< 15.5 m) west of the tower face, between 本郷通り and the tower.
    # Floor: low percentile of the depression. Escalator/stairs/subway link: OSM ways 361740935 / 392721866 / 662223256.
    sp = Polygon(sola["poly"])
    win = box(40, -130, 82, -94).difference(sp.buffer(0.3))
    low = vectorized.contains(win, XX, YY) & (Z < 15.5)
    lab, nlab = ndimage.label(low)
    sizes = ndimage.sum(low, lab, range(1, nlab + 1)); keep = lab == (int(np.argmax(sizes)) + 1)
    floor_z = float(np.percentile(Z[keep], 20))
    # rectilinear plan aligned to real edges (outline 推定): W ∥ 本郷通り, N ∥ footway 392721870, E = tower face, S = depression limit
    def _line(p, d):
        d = np.array(d, float); return np.array(p, float), d / np.linalg.norm(d)
    def _isect(l1, l2):
        (p1, d1), (p2, d2) = l1, l2
        A = np.array([d1, -d2]).T; t = np.linalg.solve(A, p2 - p1); return p1 + d1 * t[0]
    ys_, xs_ = np.nonzero(keep); dep = [(gx[i], gy[j]) for j, i in zip(ys_, xs_)]
    F = _line((74, -94), (58 - 74, -138 + 94))
    Nn = _line((max(p[0] for p in dep if p[1] > -103) - 20, max(p[1] for p in dep) - 1.0), (68 - 43, -102 + 93))
    Wl = _line((min(p[0] for p in dep) + 1.0, -110), (35 - 6, -166 + 70))
    S = _line((np.mean([p[0] for p in dep]), min(p[1] for p in dep) + 1.0), (-F[1][1], F[1][0]))
    corners = [_isect(Nn, Wl), _isect(Nn, F), _isect(F, S), _isect(S, Wl)]
    plaza_poly = Polygon(corners).buffer(0)
    if not plaza_poly.is_valid or plaza_poly.area < 100: raise RuntimeError("plaza outline failed")

    def osm_line(wid):
        return [list(nodes[n]) for n in way_by_id[wid]["nodes"] if n in nodes]
    esc = osm_line(361740935); stairs = osm_line(392721866); concourse = osm_line(662223256)
    if Point(stairs[0]).distance(plaza_poly) > Point(stairs[-1]).distance(plaza_poly): stairs = stairs[::-1]
    stairs_top_z = dem(*stairs[-1])
    esc_top = esc[0] if dem(*esc[0]) > dem(*esc[-1]) else esc[-1]
    esc_bot = esc[-1] if esc_top is esc[0] else esc[0]
    upper = lambda x, y: max(dem(x, y), floor_z + 3.0)
    bnd = plaza_poly.exterior
    def crossing(line):
        ip = LineString(line).intersection(bnd)
        if ip.is_empty: return list(bnd.interpolate(bnd.project(Point(line[0]))).coords)[0]
        return list(ip.coords)[0] if ip.geom_type == "Point" else list(ip.geoms[0].coords)[0]
    # escalator: extend the OSM line so it lands 2 m inside the plaza, keep its slope
    e_dir = np.array(esc_bot) - np.array(esc_top); e_len = np.linalg.norm(e_dir); e_dir /= e_len
    esc_cross = crossing([esc_top, list(np.array(esc_top) + e_dir * (e_len + 10))])
    # stairs: bottom on the wall line, top at the 淡路坂 sidewalk
    st_dir = np.array(stairs[-1]) - np.array(stairs[0]); st_dir /= np.linalg.norm(st_dir)
    st_cross = crossing([list(np.array(stairs[0]) - st_dir * 6), stairs[-1]])
    stairs = [list(st_cross)] + [p for p in stairs if not plaza_poly.contains(Point(p))][1:] if plaza_poly.contains(Point(stairs[0])) else [list(st_cross)] + stairs[1:]
    cl = LineString(concourse)
    w_mid = Point((corners[0][0] + corners[3][0]) / 2, (corners[0][1] + corners[3][1]) / 2)
    p_on = cl.interpolate(cl.project(w_mid))
    link = [[float(w_mid.x), float(w_mid.y)], [p_on.x, p_on.y]]
    esc_corr = LineString([list(np.array(esc_top) - e_dir * 2.5), esc_cross]).buffer(2.1, cap_style=2)
    st_corr = LineString(stairs).buffer(2.4, cap_style=2)
    hole = unary_union([plaza_poly, esc_corr, st_corr]).buffer(0)
    stair_corr = st_corr
    inh = vectorized.contains(hole.buffer(-0.5), XX, YY)
    rim = vectorized.contains(hole.buffer(6.0), XX, YY) & ~inh & ~vectorized.contains(sp.buffer(0.5), XX, YY)
    for j, i in zip(*np.nonzero(rim)):
        Z[j, i] = max(Z[j, i], upper(gx[i], gy[j]) if Z[j, i] < floor_z + 3.0 else Z[j, i])
    Z[inh] = floor_z - 0.3
    cls[inh | rim] = 3
    openings = [dict(p=[round(v, 2) for v in esc_cross], w=4.2, kind="escalator"),
                dict(p=[round(v, 2) for v in st_cross], w=4.8, kind="stairs"),
                dict(p=[round(float(w_mid.x), 2), round(float(w_mid.y), 2)], w=6.0, kind="concourse_link", lintel=3.6)]
    edges = []
    ring = list(plaza_poly.exterior.coords)
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        mid = Point((x0 + x1) / 2, (y0 + y1) / 2)
        kind = "facade" if mid.distance(sp) < 2.5 else "wall"
        dx, dy = x1 - x0, y1 - y0; L_ = math.hypot(dx, dy) or 1
        nx_, ny_ = dy / L_, -dx / L_
        if plaza_poly.contains(Point(mid.x + nx_ * 1.5, mid.y + ny_ * 1.5)): nx_, ny_ = -nx_, -ny_
        top = max(upper(mid.x + nx_ * 4, mid.y + ny_ * 4), floor_z + 3.0)
        edges.append(dict(a=[round(x0, 2), round(y0, 2)], b=[round(x1, 2), round(y1, 2)], kind=kind, top=round(top, 2), out=[round(nx_, 3), round(ny_, 3)]))
    corridor_walls = []
    for corr, kind in ((esc_corr, "escalator"), (st_corr, "stairs")):
        cr = list(corr.exterior.coords)
        for (x0, y0), (x1, y1) in zip(cr, cr[1:]):
            seg = LineString([(x0, y0), (x1, y1)]).difference(plaza_poly.buffer(0.3))
            if seg.is_empty or seg.length < 1.0: continue
            mid = seg.interpolate(0.5, normalized=True)
            # skip the open end (the side facing away from the plaza = entry from street level)
            if seg.length < 5.0 and Point(mid).distance(plaza_poly) > 3: continue
            for g in (getattr(seg, "geoms", [seg])):
                c = list(g.coords)
                corridor_walls.append(dict(a=[round(c[0][0], 2), round(c[0][1], 2)], b=[round(c[-1][0], 2), round(c[-1][1], 2)], kind=kind,
                                           top=round(max(upper(mid.x, mid.y), floor_z + 3.0), 2)))
    hole_ = hole.simplify(0.05)
    # roads: drop the generic escalator/stair ribbons (replaced by detailed models) and clip others at the cut-out
    hp = prep(hole.buffer(0.3))
    _r2 = []
    for r_ in roads:
        if r_["id"] in (361740935, 392721866): continue
        run, cur = [], []
        for q in r_["pts"]:
            if hp.contains(Point(q[0], q[1])):
                if len(cur) > 1: run.append(cur)
                cur = []
            else: cur.append(q)
        if len(cur) > 1: run.append(cur)
        for c_ in run: _r2.append(dict(r_, pts=c_))
    roads[:] = _r2
    sola_plaza = dict(floor_z=round(floor_z, 2), openings=openings, corridor_walls=corridor_walls, hole=[[round(x, 2), round(y, 2)] for x, y in list(hole_.exterior.coords)[:-1]], poly=[[round(x, 2), round(y, 2)] for x, y in ring[:-1]], edges=edges,
                      escalator=dict(top=[*esc_top, round(upper(*esc_top), 2)], bottom=[float(esc_top[0] + e_dir[0] * (e_len + 3)), float(esc_top[1] + e_dir[1] * (e_len + 3)), round(floor_z, 2)], width=3.4, src="OSM 361740935"),
                      stairs=dict(pts=[[round(x, 2), round(y, 2)] for x, y in stairs], z0=round(floor_z, 2), z1=round(stairs_top_z, 2), width=4.0, src="OSM 392721866"),
                      concourse=dict(pts=[[round(x, 2), round(y, 2)] for x, y in concourse], z=round(floor_z, 2), width=6.0, src="OSM 662223256 (layer -1)"),
                      link=dict(pts=[[round(v, 2) for v in p] for p in link], z=round(floor_z, 2), width=6.0),
                      area=round(plaza_poly.area, 1), estimated=["floor_z (DEM5A)", "wall tops (DEM5A)", "escalator/stairs width", "storefront & canopy", "concourse level = B1 floor", "link position"])
    special.append(dict(kind="sola_city_sunken_plaza_B1", z=round(floor_z, 2), area=round(plaza_poly.area, 1), estimated=True))
    print("sunken plaza floor", round(floor_z, 2), "area", round(plaza_poly.area), "corners", [tuple(np.round(c, 1)) for c in corners], "edges", [e["kind"] for e in edges], "openings", openings, "cw", len(corridor_walls))
    # subway entrance kiosk (OSM building 378652018) sits on the concourse stair: low structure, not a 9 m default block
    for b_ in buildings:
        if b_["height_src"] == "default_est" and Polygon(b_["poly"]).distance(Point(concourse[0])) < 1.5:
            b_["top"] = round(b_["base"] + 4.0, 2); b_["height"] = 4.0; b_["height_src"] = "subway_entrance_est"; b_["name"] = "新御茶ノ水駅 B2 出入口（推定）"
    note("ソラシティ B1 サンクンプラザ: 平面＝DEM5A 窪地（<15.5m）、床＝T.P.%.1fm（推定）。エスカレーター・階段・地下連絡通路の位置は OSM（361740935／392721866／662223256）、幅・段数・店舗ファサード・庇・連絡口の位置は推定。公開資料: 地上約3,000㎡・地下約1,400㎡の二層広場、地下は新御茶ノ水駅改札に直結" % floor_z)

# ---------------------------------------------------------------- dual-carriageway pairing (game simplification)
# Two parallel one-way ways (本郷通り, 外堀通り, 聖橋 …) are drawn as ONE two-lane road: each keeps one lane,
# shifted to the median, and only gets a sidewalk on its outer side.
VEH = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"}
ow = [r for r in roads if r.get("oneway") and r["cls"] in VEH]
ow_lines = [LineString([p[:2] for p in r["pts"]]) for r in ow]
ow_tree = STRtree(ow_lines)
for k, r in enumerate(ow):
    pts = r["pts"]; hits = {1: [], -1: []}; n = 0
    for i in range(0, len(pts) - 1, 2):
        (x0, y0), (x1, y1) = pts[i][:2], pts[i + 1][:2]
        dx, dy = x1 - x0, y1 - y0; L_ = math.hypot(dx, dy)
        if L_ < 0.5: continue
        dx, dy = dx / L_, dy / L_; n += 1
        P = Point(x0, y0)
        best = None
        for j in ow_tree.query(P.buffer(30)):
            if j == k: continue
            g = ow_lines[j]
            d = g.distance(P)
            if d < 2 or d > 30: continue
            q = g.interpolate(g.project(P)); q2 = g.interpolate(min(g.project(P) + 1.0, g.length))
            ex, ey = q2.x - q.x, q2.y - q.y; eL = math.hypot(ex, ey) or 1
            if abs(dx * ex / eL + dy * ey / eL) < 0.8: continue           # must run parallel
            side = 1 if dx * (q.y - y0) - dy * (q.x - x0) > 0 else -1    # +1 = left of travel direction
            if best is None or d < best[0]: best = (d, side)
        if best: hits[best[1]].append(best[0])
    side = max(hits, key=lambda s_: len(hits[s_]))
    if n and len(hits[side]) >= 0.4 * n:
        r["pair_side"] = side; r["pair_sep"] = round(float(np.median(hits[side])), 2)
print("dual-carriageway ways paired:", sum(1 for r in ow if r.get("pair_side")))
note("ゲーム用簡略化: 車道は一律 6m（片側1車線）。上下線分離の道路は各1車線を中央に寄せて1本の2車線道路に統合。歩道は4m以上に拡幅、横断歩道（footway=crossing）は描画しない")

import road_areas
_cut = unary_union([water] + ([Polygon(sola_plaza["hole"])] if sola_plaza else []))
ROAD_AREAS = road_areas.build(roads, BX, _cut)
import shops as _shops
# ---- JR 御茶ノ水駅 聖橋口 駅前広場: open paved forecourt between the tracks, 茗渓通り and 聖橋 (Google Maps 2026).
# PLATEAU 2020 still has construction-era volumes there; buildings mostly inside the forecourt are dropped, the
# over-track station volume is cut back to the track band so its south face becomes the station entrance (推定 extent).
_PZ_REGION = Polygon([(-34.5, -30.0), (-11.5, -36.0), (-11.5, -64.0), (-34.5, -64.0)])
_rail_band = unary_union([LineString([p[:2] for p in r["pts"]]).buffer(3.2) for r in rails if r["cls"] == "rail" and not r["tunnel"]])
_ra_union = lambda key: unary_union([Polygon(rr[0], rr[1:]).buffer(0) for rr in ROAD_AREAS[key]])
_pz_zone = _PZ_REGION.difference(_rail_band)
_kept, _stn_hj = [], None
for b in buildings:
    fp = Polygon(b["poly"]).buffer(0)
    if fp.is_empty or fp.intersection(_pz_zone).area < 0.2 * fp.area:
        _kept.append(b); continue
    over = fp.intersection(_rail_band)
    if b.get("over_track") and over.area > 20:
        over = max(getattr(over, "geoms", [over]), key=lambda g: g.area)
        b["poly"] = [[round(x, 2), round(y, 2)] for x, y in list(over.exterior.coords)[:-1]]
        b["station_entrance"] = "hijiribashi"; b["name"] = "御茶ノ水駅 聖橋口"; _stn_hj = b
        b["landmark"] = "jr_ochanomizu_station"            # station facade + 聖橋口 timber screen / roof (blender_landmarks)
        _kept.append(b)
buildings = _kept
_pz = _pz_zone.difference(_ra_union("car")).difference(_ra_union("walk").buffer(-0.05))
_pz = _pz.difference(unary_union([Polygon(b["poly"]).buffer(0) for b in buildings]))
_pz = max(getattr(_pz, "geoms", [_pz]), key=lambda g: g.area)
station_plaza = None
if _pz.area > 50:
    ent = None
    if _stn_hj:
        sp_ = Polygon(_stn_hj["poly"]); c_ = _pz.centroid
        from shapely.ops import nearest_points
        q_ = nearest_points(sp_.exterior, c_)[0]
        ent = [round(q_.x, 2), round(q_.y, 2)]
    zs_ = [p[2] for r in roads if not r["bridge"] for p in r["pts"] if math.dist(p[:2], (_pz.centroid.x, _pz.centroid.y)) < 25]
    station_plaza = dict(name="御茶ノ水駅 聖橋口 駅前広場", poly=[[round(x, 2), round(y, 2)] for x, y in list(_pz.exterior.coords)[:-1]],
                         z=round(float(np.median(zs_)) if zs_ else 19.0, 2), area=round(_pz.area, 1), entrance=ent, estimated=True)
    note("聖橋口 駅前広場: Google マップで平坦な広場となっている範囲（線路・茗渓通り・聖橋の間）から建物を除き、"
         "線路上の駅舎を軌道帯まで切り詰めて南面を入口とした（範囲・入口位置は推定）")
SHOPS = _shops.build(DATA, to_local, buildings, ROAD_AREAS, BX)
from collections import Counter as _C
print("shops", len(SHOPS), _C(x["cat"] for x in SHOPS).most_common())
note("地面店舗: OSM の shop / 飲食・サービス系 amenity のうち 1 階（level 0–1 または未記載）の店舗を、所在建物の道路側ファサードに配置。間口 5m・庇・色はカテゴリ別の推定、店名や看板は描かない")
print("road areas", ROAD_AREAS["stats"], "kerbs", len(ROAD_AREAS["kerbs"]), "dashes", len(ROAD_AREAS["dashes"]))
note("道路面: 地上の車道・歩道をそれぞれ 2D で合成（union）した一枚の面として生成し、交差点で途切れないようにした。縁石は車道と歩道の境界から自動生成")

meta = dict(origin=dict(lat=LAT0, lon=LON0, name="聖橋中心"), bounds=BOUNDS, crs="local ENU metres (x=east, y=north), z=T.P. metres",
            water_z=WATER_Z, bed_z=BED_Z, terrain=dict(x0=float(gx[0]), y0=float(gy[0]), step=STEP, nx=len(gx), ny=len(gy)),
            sources=["GSI dem5a_png z15", "PLATEAU 2020 Tokyo23 LOD1 (indigo-lab MVT)", "OpenStreetMap via Overpass 2026-10-29"], estimates=EST)
out = dict(meta=meta, terrain_z=np.round(Z, 2).ravel().tolist(), terrain_cls=cls.ravel().tolist(),
           water=[[[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]] for p in (water.geoms if hasattr(water, "geoms") else [water])],
           buildings=buildings, shops=SHOPS, road_areas=ROAD_AREAS, sola_plaza=sola_plaza, station_plaza=station_plaza, revetments=revet, roads=roads, rails=rails, platforms=platforms, underground=underground, trees=trees,
           plazas=[[[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]] for p in (plaza_u.geoms if hasattr(plaza_u, "geoms") else [plaza_u]) if not p.is_empty])
meta["special"] = special
os.makedirs(os.path.join(DATA, "..", "out"), exist_ok=True)
json.dump(out, open(os.path.join(DATA, "..", "out", "scene.json"), "w", encoding="utf8"), ensure_ascii=False)
print("roads", len(roads), "rails", len(rails), "platforms", len(platforms), "underground", len(underground))
for r in rails:
    if r["bridge"] or r["tunnel"]:
        print("RAILZ", r["id"], r["line"], "br" if r["bridge"] else "tun", r["layer"], [round(p[2], 1) for p in r["pts"][::max(1, len(r['pts']) // 6)]])
for r in roads:
    if r["bridge"] and r["cls"] not in ("footway", "steps"):
        print("ROADZ", r["id"], r["name"], [round(p[2], 1) for p in r["pts"][::max(1, len(r['pts']) // 6)]])
for b in buildings:
    if b["landmark"]: print("LM", b["landmark"], b["name"], b["base"], b["top"], b["height_src"], len(b["poly"]))
print("\n".join(EST))

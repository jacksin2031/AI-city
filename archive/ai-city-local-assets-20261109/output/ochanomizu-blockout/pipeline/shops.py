"""Ground-floor shops from OpenStreetMap (shop=*, food / service amenities).

Each POI is attached to the building that contains it (or the nearest one within 5 m), on the facade edge that faces
the street (closest edge to the road / sidewalk surface). Upper-floor tenants (OSM level >= 2 or level < 0) are skipped.
Frontage width (5 m), awning size and colour per category are generic (推定); no names or signs are drawn.
"""
import json, math, os
from shapely.geometry import Point, Polygon, LineString
from shapely.strtree import STRtree
from shapely.ops import unary_union

CAT = [
    ("food", {"restaurant", "fast_food", "food_court", "ice_cream", "bakery", "confectionery", "deli", "pastry"}),
    ("cafe", {"cafe", "tea", "coffee"}),
    ("bar", {"bar", "pub", "alcohol", "wine"}),
    ("books", {"books", "stationery", "art", "frame", "copyshop"}),
    ("music", {"musical_instrument", "music", "hifi"}),
    ("conv", {"convenience", "supermarket", "variety_store", "tobacco"}),
    ("health", {"pharmacy", "chemist", "clinic", "dentist", "optician", "massage", "hairdresser", "beauty"}),
    ("sport", {"sports", "outdoor", "bicycle", "shoes", "clothes"}),
    ("tech", {"electronics", "computer", "mobile_phone", "radiotechnics", "video_games", "toys", "collector", "hobby", "games", "anime"}),
]


def category(t):
    k = t.get("shop") or t.get("amenity") or ""
    for name, keys in CAT:
        if k in keys: return name
    return "other"


def ground_floor(t):
    lv = t.get("level") or t.get("addr:floor")
    if lv is None: return True
    try:
        v = float(str(lv).split(";")[0].replace("F", "").strip())
    except ValueError:
        return True
    return 0 <= v <= 1


def build(data_dir, to_local, buildings, road_areas, bounds_poly):
    path = os.path.join(data_dir, "pois.json")
    if not os.path.exists(path): return []
    els = json.load(open(path, encoding="utf8"))["elements"]
    street = []
    for key in ("car", "walk"):
        for rings in road_areas.get(key, []):
            try: street.append(Polygon(rings[0], rings[1:]).buffer(0))
            except Exception: pass
    street = unary_union(street)
    bpolys = [Polygon(b["poly"]).buffer(0) for b in buildings]
    tree = STRtree(bpolys)
    used = {}            # (building idx, edge idx) -> list of [s0, s1] occupied along the edge
    shops = []
    for e in els:
        t = e.get("tags", {})
        if not ground_floor(t): continue
        if e["type"] == "node": lat, lon = e["lat"], e["lon"]
        elif "center" in e: lat, lon = e["center"]["lat"], e["center"]["lon"]
        else: continue
        x, y = to_local(lat, lon); P = Point(x, y)
        if not bounds_poly.contains(P): continue
        cand = [i for i in tree.query(P.buffer(5.0)) if bpolys[i].distance(P) < 5.0]
        if not cand: continue
        bi = min(cand, key=lambda i: bpolys[i].distance(P))
        b = buildings[bi]
        if b.get("over_track") or b.get("landmark") in ("nikolai_do",): continue
        ring = b["poly"]; n = len(ring)
        best = None
        for k in range(n):
            a, c = ring[k], ring[(k + 1) % n]
            L = math.dist(a, c)
            if L < 3.0: continue
            mx, my = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
            dx, dy = (c[0] - a[0]) / L, (c[1] - a[1]) / L
            nx, ny = dy, -dx                                       # outward = right of the edge for CCW rings
            if bpolys[bi].contains(Point(mx + nx * 0.5, my + ny * 0.5)): nx, ny = -nx, -ny
            probe = Point(mx + nx * 3.0, my + ny * 3.0)
            if street.distance(probe) > 1.5: continue            # not a street-facing facade
            score = LineString([a, c]).distance(P)
            if best is None or score < best[0]: best = (score, k, a, c, (nx, ny), L)
        if best is None: continue
        _, k, a, c, nrm, L = best
        seg = LineString([a, c]); s = seg.project(P)
        w = min(5.0, L - 0.6)
        s0 = min(max(s - w / 2, 0.3), L - 0.3 - w)
        occ = used.setdefault((bi, k), [])
        tries = 0
        while any(not (s0 + w <= o0 or s0 >= o1) for o0, o1 in occ) and tries < 8:
            s0 += w + 0.4; tries += 1
            if s0 + w > L - 0.3: s0 = 0.3 + (tries * 1.7) % max(L - w - 0.6, 0.1)
        if any(not (s0 + w <= o0 or s0 >= o1) for o0, o1 in occ): continue
        occ.append((s0, s0 + w))
        p0, p1 = seg.interpolate(s0), seg.interpolate(s0 + w)
        shops.append(dict(a=[round(p0.x, 2), round(p0.y, 2)], b=[round(p1.x, 2), round(p1.y, 2)], n=[round(nrm[0], 3), round(nrm[1], 3)],
                          cat=category(t), kind=t.get("shop") or t.get("amenity"), bid=int(bi), base=float(b["base"])))
    return shops

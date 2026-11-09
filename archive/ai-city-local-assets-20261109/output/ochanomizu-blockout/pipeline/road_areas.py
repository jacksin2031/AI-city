"""Merged at-grade road network (2D): one carriageway surface and one sidewalk surface, so junctions are seamless.

Same game-simplification rules as blender_build.py's ribbons: carriageway 6 m (one lane each way), one-way pairs
merged toward the median, leftover road width + 1 m becomes sidewalk, footways >= 4 m wide. Bridges and tunnels are
excluded (drawn as decks in Blender).
"""
import math
from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely import segmentize

CW, FOOT_W, SIDE_EXTRA, LANE = 6.0, 4.0, 1.0, 3.25
FOOT = {"footway", "path", "cycleway", "pedestrian", "steps"}
DASHED = {"trunk", "primary", "secondary"}


def _extend(ls, e):
    if e <= 0: return ls
    c = list(ls.coords)
    def push(a, b):
        dx, dy = a[0] - b[0], a[1] - b[1]; L = math.hypot(dx, dy) or 1
        return (a[0] + dx / L * e, a[1] + dy / L * e)
    return LineString([push(c[0], c[1])] + c + [push(c[-1], c[-2])])


def _polys(g):
    if g.is_empty: return []
    gs = [g] if isinstance(g, Polygon) else [x for x in getattr(g, "geoms", []) if isinstance(x, Polygon)]
    out = []
    for p in gs:
        if p.area < 4: continue
        p = segmentize(p.simplify(0.05), 2.0)
        out.append([[[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]]] +
                   [[[round(x, 2), round(y, 2)] for x, y in list(h.coords)[:-1]] for h in p.interiors if Polygon(h).area > 1.0])
    return out


def _polys_small(g):
    gs = [g] if isinstance(g, Polygon) else [x for x in getattr(g, "geoms", []) if isinstance(x, Polygon)]
    return [[[[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]]] for p in gs if p.area > 0.2]


def build(roads, bounds_poly, cut=None):
    car_p, walk_p, dashes = [], [], []
    for r in roads:
        if r.get("bridge") or r.get("tunnel"): continue
        if r.get("footway") in ("sidewalk", "crossing", "traffic_island"): continue
        pts = [p[:2] for p in r["pts"]]
        if len(pts) < 2: continue
        ls = LineString(pts)
        if ls.length < 0.5: continue
        c, w = r["cls"], r["width"]
        if c in FOOT:
            if c != "steps" and ls.length < 12: continue
            walk_p.append(_extend(ls, 0.0 if c == "steps" else 1.5).buffer(max(w, FOOT_W) / 2, cap_style=2))
            continue
        L2 = _extend(ls, min(w / 2 + 1.0, 4.0))
        ps = r.get("pair_side")
        if ps:
            shift = max(0.0, min(r["pair_sep"] / 2 - LANE / 2 + 0.6, 12.0))
            car_p.append(L2.offset_curve(ps * shift).buffer(LANE / 2 + 0.05, cap_style=2))
            out_edge = LANE / 2 - shift
            side = w / 2 + SIDE_EXTRA - out_edge
            if side > 0.6:
                walk_p.append(L2.offset_curve(-ps * (out_edge + side / 2)).buffer(side / 2 + 0.05, cap_style=2))
            continue
        cw = min(w, CW)
        car_p.append(L2.buffer(cw / 2, cap_style=2))
        side = (w - cw) / 2 + (SIDE_EXTRA if w > cw else 0.0)
        if side > 0.6:
            walk_p.append(L2.buffer(cw / 2 + side, cap_style=2))
        if c in DASHED:                                   # dashed centre line, kept clear of junction ends
            d = 10.0
            while d + 5.0 < ls.length - 10.0:
                a, b = ls.interpolate(d), ls.interpolate(d + 5.0)
                dashes.append([[round(a.x, 2), round(a.y, 2)], [round(b.x, 2), round(b.y, 2)]])
                d += 9.0
    car = unary_union(car_p).buffer(0.4).buffer(-0.4)             # close hairline gaps between lanes / junctions
    walk = unary_union(walk_p).buffer(0.3).buffer(-0.3)
    walk = walk.difference(car.buffer(0.02))
    if cut is not None and not cut.is_empty:
        car = car.difference(cut); walk = walk.difference(cut)
    car = car.intersection(bounds_poly); walk = walk.intersection(bounds_poly)
    # zebra crossings: stripes along each OSM crossing way, clipped to the carriageway (never onto the sidewalk)
    zebra = []; crossings = []
    road_only = car.buffer(-0.3)
    for r in roads:
        if r.get("footway") != "crossing" or r.get("bridge") or len(r["pts"]) < 2: continue
        ls = LineString([p[:2] for p in r["pts"]])
        if ls.length < 1.0: continue
        stripes = []
        d = 0.2
        while d + 0.45 <= ls.length:
            a, b = ls.interpolate(d), ls.interpolate(d + 0.45)
            stripes.append(LineString([a, b]).buffer(1.5, cap_style=2))   # 0.45 m stripe, 3 m long across
            d += 0.9
        g = unary_union(stripes).intersection(road_only)
        zebra += _polys_small(g)
        # crossing span over the carriageway (kerb to kerb): signal poles stand just beyond both ends
        span = ls.intersection(car)
        parts = [span] if span.geom_type == "LineString" else [q for q in getattr(span, "geoms", []) if q.geom_type == "LineString"]
        if parts:
            sp = max(parts, key=lambda q: q.length)
            if sp.length >= 3.0:
                (ax, ay), (bx, by) = sp.coords[0], sp.coords[-1]
                crossings.append(dict(id=r["id"], a=[round(ax, 2), round(ay, 2)], b=[round(bx, 2), round(by, 2)], length=round(sp.length, 2)))
    # kerbs: where carriageway meets sidewalk (stops at junctions automatically)
    kb = car.boundary.intersection(walk.buffer(0.35))
    kerbs = []
    for g in ([kb] if kb.geom_type == "LineString" else list(getattr(kb, "geoms", []))):
        if g.geom_type != "LineString" or g.length < 1.5: continue
        g = segmentize(g, 2.0)
        kerbs.append([[round(x, 2), round(y, 2)] for x, y in g.coords])
    return dict(car=_polys(car), walk=_polys(walk), kerbs=kerbs, dashes=dashes, zebra=zebra, crossings=crossings,
                stats=dict(car_area=round(car.area), walk_area=round(walk.area), car_parts=len(_polys(car))))

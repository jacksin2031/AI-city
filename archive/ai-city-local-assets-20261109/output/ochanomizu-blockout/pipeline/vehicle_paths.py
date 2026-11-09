"""Continuous driving paths for trains and cars (pure Python, no bpy).

Rails: OSM ways of one line are chained end-to-end (directed, straightest continuation, same line family first).
Roads: every trunk..tertiary way becomes one or two directed lanes. Japan drives on the LEFT, so a two-way road gives
one lane 1.5 m left of the centreline in each direction; a paired one-way half uses the lane the scene draws
(moved towards the median). Lanes are chained the same way as rails.
Z is resolved in Blender (rail head / road surface), so points here keep the scene.json z as a first guess.
"""
import math

RAIL_FAMILY = {"中央本線": "rapid", "中央緩行線": "local", "総武緩行線": "local", "中央・総武緩行線": "local",
               "JR中央・総武緩行線": "local", "東京メトロ丸ノ内線": "marunouchi", "東京メトロ千代田線": "chiyoda"}
CAR_CLS = ("trunk", "primary", "secondary", "tertiary")
LANE = 3.25
SNAP = 2.5


def plen(pts):
    return sum(math.dist(a[:2], b[:2]) for a, b in zip(pts, pts[1:]))


def _dir(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1.0
    return dx / L, dy / L


def offset(pts, off):
    """shift a polyline sideways; off > 0 = to the LEFT of the travel direction"""
    out = []
    n = len(pts)
    for i, p in enumerate(pts):
        d0 = _dir(pts[max(i - 1, 0)], pts[min(i + 1, n - 1)])
        out.append([p[0] - d0[1] * off, p[1] + d0[0] * off, p[2]])
    return out


def _clean(pts, tol=0.3):
    out = [pts[0]]
    for p in pts[1:]:
        if math.dist(p[:2], out[-1][:2]) > tol: out.append(p)
    return out


def chain(segs, start, max_turn=35.0):
    """segs: list of dict(pts, fam). Greedy forward + backward extension from segs[start]."""
    used = {start}
    path = list(segs[start]["pts"]); fam = segs[start]["fam"]

    def best_next(end, d_end, forward):
        best = None
        for j, s in enumerate(segs):
            if j in used: continue
            p = s["pts"]
            q0 = p[0] if forward else p[-1]
            if math.dist(q0[:2], end[:2]) > SNAP: continue
            d = _dir(p[0], p[1]) if forward else _dir(p[-2], p[-1])
            turn = math.degrees(math.acos(max(-1.0, min(1.0, d[0] * d_end[0] + d[1] * d_end[1]))))
            if turn > max_turn: continue
            score = turn + (0 if s["fam"] == fam else 25 if s["fam"] is None else 60)
            if best is None or score < best[0]: best = (score, j)
        return best

    while True:                                   # forward
        b = best_next(path[-1], _dir(path[-2], path[-1]), True)
        if not b: break
        used.add(b[1]); path += segs[b[1]]["pts"][1:]
    while True:                                   # backward
        b = best_next(path[0], _dir(path[0], path[1]), False)
        if not b: break
        used.add(b[1]); path = segs[b[1]]["pts"][:-1] + path
    return _clean(path), used


def rail_paths(D):
    # 4th value per point: 0 = at grade, 1 = bridge / viaduct, 2 = tunnel (Blender applies the same rail lift)
    segs = [dict(pts=[[p[0], p[1], p[2], 1 if r["bridge"] else 2 if r["tunnel"] else 0] for p in r["pts"]],
                 fam=RAIL_FAMILY.get(r["line"] or r.get("name") or ""), id=r["id"]) for r in D["rails"]]
    out = []; done = set()
    order = sorted(range(len(segs)), key=lambda i: -plen(segs[i]["pts"]))
    for i in order:
        s = segs[i]
        if i in done or s["fam"] in (None, "chiyoda"): continue
        pts, used = chain(segs, i)
        done |= used
        if plen(pts) < 150: continue
        out.append(dict(kind="rail", fam=s["fam"], pts=pts, length=round(plen(pts), 2),
                        ways=[segs[j]["id"] for j in used]))
    return out


def road_lanes(D):
    lanes = []
    for r in D["roads"]:
        if r["cls"] not in CAR_CLS or r.get("tunnel") or len(r["pts"]) < 2: continue
        pts = _clean(r["pts"])
        if len(pts) < 2: continue
        ps = r.get("pair_side")
        if ps:
            shift = max(0.0, min(r["pair_sep"] / 2 - LANE / 2 + 0.6, 12.0))
            lanes.append(dict(pts=offset(pts, ps * shift), fam=r.get("name"), id=r["id"]))
        elif r.get("oneway"):
            lanes.append(dict(pts=pts, fam=r.get("name"), id=r["id"]))
        else:
            lanes.append(dict(pts=offset(pts, 1.5), fam=r.get("name"), id=r["id"]))
            lanes.append(dict(pts=offset(pts[::-1], 1.5), fam=r.get("name"), id=-r["id"]))
    return lanes


def road_paths(D, min_len=120.0):
    lanes = road_lanes(D)
    out = []; done = set()
    order = sorted(range(len(lanes)), key=lambda i: -plen(lanes[i]["pts"]))
    for i in order:
        if i in done: continue
        pts, used = chain(lanes, i, max_turn=40.0)
        done |= used
        if plen(pts) < min_len: continue
        out.append(dict(kind="road", fam=lanes[i]["fam"], pts=pts, length=round(plen(pts), 2),
                        ways=[lanes[j]["id"] for j in used]))
    return out


if __name__ == "__main__":
    import json, sys
    D = json.load(open(sys.argv[1], encoding="utf8"))
    for p in rail_paths(D): print("rail", p["fam"], p["length"], [round(v) for v in p["pts"][0]], [round(v) for v in p["pts"][-1]], p["ways"])
    for p in road_paths(D): print("road", p["fam"], p["length"], [round(v) for v in p["pts"][0][:2]], [round(v) for v in p["pts"][-1][:2]], len(p["ways"]))

"""Prepare simulated road and rail stops from the local Blender pipeline data.

Usage: python scripts/build-traffic.py <vehicles.json> <signals.json> <output.json>
Signal placement and station stop centres are estimates, not real-world timetables.
"""
import json
import math
import sys

vehicles_path, signals_path, output = sys.argv[1:]
with open(vehicles_path, encoding="utf-8") as f:
    data = json.load(f)
with open(signals_path, encoding="utf-8") as f:
    signals = [h for h in json.load(f)["heads"] if h["kind"] == "vehicle"]


def project(points, x, y, facing=None, height=None):
    best = None
    distance = 0.0
    for a, b in zip(points, points[1:]):
        dx, dy, dz = (b[i] - a[i] for i in range(3))
        xy2 = dx * dx + dy * dy
        length = math.sqrt(xy2 + dz * dz)
        if not xy2 or not length:
            continue
        t = max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / xy2))
        error = math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
        dot = (dx * facing[0] + dy * facing[1]) / math.sqrt(xy2) if facing else -1
        level_error = abs(height - (a[2] + t * dz)) if height is not None else 0
        if dot < -0.8 and level_error < 4 and (best is None or error < best[0]):
            best = (error, distance + t * length)
        distance += length
    return best


for path in data["paths"]:
    points = path["pts"]
    if path["kind"] == "road":
        candidates = {}
        for head in signals:
            match = project(points, *head["pos"][:2], facing=head["facing"], height=head["pos"][2] - 2.15)
            if match and match[0] < 5:
                key = (head["crossing"], head["group"])
                if key not in candidates or match[0] < candidates[key][0]:
                    candidates[key] = match
        path["stops"] = sorted(({"distance": round(max(0, match[1] - 3), 2), "group": key[1]} for key, match in candidates.items()), key=lambda s: s["distance"])
    else:
        # Approximate platform centre from the scene's Ochanomizu station platform polygons.
        centre = (-140, 95) if path["line"] == "marunouchi" else (-40, -20)
        match = project(points, *centre)
        path["stationCentre"] = round(match[1], 2) if match and match[0] < 40 else None

with open(output, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

"""Shared geo helpers: local ENU projection centred on Hijiribashi, GSI DEM5A sampler."""
import math, json, os, glob
import numpy as np
from PIL import Image

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
LAT0, LON0 = 35.69975, 139.76555          # 聖橋 centre (OSM way 31887158/31887176)
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 110574.0
# scene bounds in local metres (E, N) derived from the supplied screenshot extent
BOUNDS = (-480.0, -340.0, 310.0, 390.0)

def to_local(lat, lon):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)

def to_latlon(x, y):
    return (LAT0 + y / KY, LON0 + x / KX)

def _tile_lonlat(z, x, y):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon

class DEM:
    """GSI dem5a_png z15 mosaic (laser-survey ground surface, T.P. metres)."""
    def __init__(self):
        tiles = {}
        for f in glob.glob(os.path.join(DATA, "dem5a_png_15_*.png")):
            _, _, _, X, Y = os.path.basename(f)[:-4].split("_")
            tiles[(int(X), int(Y))] = f
        xs = sorted({k[0] for k in tiles}); ys = sorted({k[1] for k in tiles})
        self.x0, self.y0 = xs[0], ys[0]
        H = np.full((256 * len(ys), 256 * len(xs)), np.nan)
        for (X, Y), f in tiles.items():
            a = np.asarray(Image.open(f).convert("RGB")).astype(np.int64)
            v = a[..., 0] * 65536 + a[..., 1] * 256 + a[..., 2]
            h = np.where(v < 2 ** 23, v * 0.01, (v - 2 ** 24) * 0.01).astype(float)
            h[v == 2 ** 23] = np.nan
            H[(Y - self.y0) * 256:(Y - self.y0 + 1) * 256, (X - self.x0) * 256:(X - self.x0 + 1) * 256] = h
        self.raw = H.copy()
        # fill gaps (water / no-data) with iterative neighbour mean
        from scipy import ndimage
        mask = np.isnan(H)
        if mask.any():
            idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
            H = H[tuple(idx)]
        self.H = H
        self.nodata = mask

    def _pix(self, x, y):
        lat, lon = to_latlon(x, y)
        n = 2 ** 15
        px = ((lon + 180) / 360 * n - self.x0) * 256 - 0.5
        r = math.radians(lat)
        py = ((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n - self.y0) * 256 - 0.5
        return px, py

    def __call__(self, x, y):
        px, py = self._pix(x, y)
        i0, j0 = int(math.floor(py)), int(math.floor(px))
        fy, fx = py - i0, px - j0
        H = self.H
        i0 = min(max(i0, 0), H.shape[0] - 2); j0 = min(max(j0, 0), H.shape[1] - 2)
        return ((1 - fy) * ((1 - fx) * H[i0, j0] + fx * H[i0, j0 + 1]) +
                fy * ((1 - fx) * H[i0 + 1, j0] + fx * H[i0 + 1, j0 + 1]))

    def is_nodata(self, x, y):
        px, py = self._pix(x, y)
        return bool(self.nodata[int(round(py)), int(round(px))])

def load_osm():
    d = json.load(open(os.path.join(DATA, "osm.json"), encoding="utf8"))
    nodes = {e["id"]: to_local(e["lat"], e["lon"]) for e in d["elements"] if e["type"] == "node"}
    ways = [e for e in d["elements"] if e["type"] == "way"]
    rels = [e for e in d["elements"] if e["type"] == "relation"]
    return nodes, ways, rels

"""Export the Ochanomizu Blender scene for the web city.

Run headless (no network, no paid services):
  blender -b School.blend -S Ochanomizu --python scripts/blender/export-ochanomizu.py -- <out-dir>

Writes to <out-dir>:
  city.glb       static scenery; buildings keep `base_z` / `name_ja` as glTF extras
  vehicles.glb   trains and cars with their follow-path motion baked into one looping clip
  materials.json colours and pattern parameters of the procedural Blender materials
  nav.bin        1 m walk grid: uint8 class per cell, then int16 height in centimetres
  places.json    grid bounds plus shopfronts found from the awnings

Blender is Z-up with Y north; glTF/three.js is Y-up, so the web world uses x east, z south.
"""

import json
import math
import os
import struct
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)
scene = bpy.data.scenes["Ochanomizu"]
bpy.context.window.scene = scene if bpy.context.window else scene

HIDDEN = {"12_Walkable_Nav", "11_Underground", "13_Vehicle_Paths", "14_Vehicle_Controllers", "Collection"}
VEHICLES = {"14_Vehicles"}


def collection_objects(names):
    return [o for name in names for o in bpy.data.collections[name].all_objects]


# —— Materials: record the procedural patterns, then flatten base colours for glTF ——
def socket_value(socket):
    value = socket.default_value
    try:
        return [round(x, 4) for x in value][:3]
    except TypeError:
        return round(value, 4)


def upstream(node, seen=None):
    seen = seen if seen is not None else []
    for socket in node.inputs:
        for link in socket.links:
            if link.from_node not in seen:
                seen.append(link.from_node)
                upstream(link.from_node, seen)
    return seen


def describe(material):
    tree = material.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if tree else None
    if not bsdf:
        return None
    base = bsdf.inputs["Base Color"]
    info = {
        "roughness": socket_value(bsdf.inputs["Roughness"]) if not bsdf.inputs["Roughness"].is_linked else 0.85,
        "metallic": socket_value(bsdf.inputs["Metallic"]),
        "emission": socket_value(bsdf.inputs["Emission Color"]),
        "emissionStrength": socket_value(bsdf.inputs["Emission Strength"]),
    }
    if not base.is_linked:
        info.update(kind="flat", color=socket_value(base))
        return info
    nodes = upstream(bsdf)
    mixes = [n for n in nodes if n.type == "MIX" and n.data_type == "RGBA"]
    pairs = [
        [socket_value(n.inputs[k]) for k in ("A", "B") if not n.inputs[k].is_linked]
        for n in mixes
    ]
    noises = [round(n.inputs["Scale"].default_value, 4) for n in nodes if n.type == "TEX_NOISE"]
    bricks = [n for n in nodes if n.type == "TEX_BRICK"]
    info["pairs"] = [p for p in pairs if p]
    info["noise"] = noises
    if bricks:
        b = bricks[0]
        info["brick"] = {
            "a": socket_value(b.inputs["Color1"]),
            "b": socket_value(b.inputs["Color2"]),
            "mortar": socket_value(b.inputs["Mortar"]),
            "scale": socket_value(b.inputs["Scale"]),
            "width": round(b.inputs["Brick Width"].default_value, 3),
            "height": round(b.inputs["Row Height"].default_value, 3),
            "mortarSize": socket_value(b.inputs["Mortar Size"]),
        }
    if material.name.startswith("F_"):
        divides = [n.inputs[1].default_value for n in nodes if n.type == "MATH" and n.operation == "DIVIDE"]
        info["kind"] = "facade"
        info["grid"] = [round(v, 3) for v in divides[:2]]
    else:
        info["kind"] = "brick" if bricks else "noise"
    # A representative flat colour for the glTF factor.
    colours = info.get("brick", {}).get("a") and [info["brick"]["a"], info["brick"]["b"]] or (info["pairs"][0] if info["pairs"] else [[0.6, 0.6, 0.6]])
    info["color"] = [round(sum(c[i] for c in colours) / len(colours), 4) for i in range(3)]
    return info


materials = {}
for material in bpy.data.materials:
    described = describe(material)
    if not described:
        continue
    materials[material.name] = described
    # Signs use an image for both base colour and emission; retain both texture links.
    if material.name.startswith("SIGN_"):
        continue
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for name in ("Base Color", "Roughness", "Normal"):
        for link in list(bsdf.inputs[name].links):
            material.node_tree.links.remove(link)
    bsdf.inputs["Base Color"].default_value = (*described["color"], 1.0)
    bsdf.inputs["Roughness"].default_value = described["roughness"]
with open(os.path.join(OUT, "materials.json"), "w", encoding="utf-8") as f:
    json.dump(materials, f, ensure_ascii=False, separators=(",", ":"))


# —— glTF export ——
def export(path, objects, animated):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.hide_set(False)
        o.select_set(True)
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_texcoords=True,
        export_normals=True,
        export_animations=animated,
    )
    if animated:
        kwargs.update(
            export_animation_mode="SCENE",
            export_force_sampling=True,
            export_frame_step=2,
            export_optimize_animation_size=True,
        )
    bpy.ops.export_scene.gltf(**kwargs)


all_visible = [
    o
    for c in scene.collection.children_recursive
    if c.name not in HIDDEN | VEHICLES
    for o in c.objects
    if o.type == "MESH" and not o.hide_render
]
static = [o for o in dict.fromkeys(all_visible) if not o.name.startswith("Walkable_")]
vehicles = [o for o in collection_objects(VEHICLES) if o.type == "MESH"]
export(os.path.join(OUT, "city.glb"), static, False)
export(os.path.join(OUT, "vehicles.glb"), vehicles, True)
print("EXPORTED", len(static), "static", len(vehicles), "vehicles")


# —— Walk grid ——
def combined(objects, classify):
    verts, polys, classes = [], [], []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in objects:
        if o.type != "MESH":
            continue
        mesh = o.evaluated_get(depsgraph).to_mesh()
        offset = len(verts)
        matrix = o.matrix_world
        verts.extend(matrix @ v.co for v in mesh.vertices)
        for p in mesh.polygons:
            polys.append([offset + i for i in p.vertices])
            name = o.material_slots[p.material_index].name if o.material_slots else ""
            classes.append(classify(o, name))
        o.evaluated_get(depsgraph).to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys, all_triangles=False), classes


# 0 blocked · 1 footway/plaza/crossing · 2 open ground · 3 lawn · 4 side street · 5 major road
SURFACE_CLASS = {
    "WB_Footway": 1, "WB_Plaza": 1, "WB_PlazaPaving": 1, "WB_Steps": 1, "WB_RoadPaint": 1,
    "WB_Platform": 1, "NAV_Walkable": 1, "WB_Kerb": 1,
    "WB_Ground": 2, "WB_Bridge": 2,
    "WB_Green": 3,
    "WB_Road": 4,
    "WB_RoadMajor": 5,
}


def surface_class(o, material):
    if o.name in ("Walkable_SolaPlaza", "Walkable_StationForecourt") or o.name.startswith("SP_"):
        return 1
    if o.name.startswith(("Rail_", "Revetment", "LMX_River", "KandaRiver", "Tunnel")):
        return 0
    return SURFACE_CLASS.get(material, 2)


surface_names = {
    "Terrain_DEM5A", "KandaRiver_Water", "Roads", "Road_Kerbs", "Road_ZebraCrossings", "Bridges_Viaducts",
    "Rail_JR", "Rail_StoneWall_Niches", "Rail_RaisedBed_Walls", "Revetment_Walls", "LMX_River_Guardrails",
    "Walkable_SolaPlaza", "Walkable_StationForecourt", "SP_Floor_B1", "SP_Stairs_to_AwajiZaka",
    "SP_Escalator", "Bridge_Ochanomizubashi_SteelGirder",
}
surfaces, surface_classes = combined([bpy.data.objects[n] for n in surface_names], surface_class)
# Building volumes. Shop awnings and the station canopies overhang walkways, so they are left out.
blocker_objects = [
    o
    for o in collection_objects(["08_Buildings", "09_Landmarks"])
    if o.name != "Shops_GroundFloor" and not o.name.startswith("LMX_")
] + [bpy.data.objects[n] for n in ("SP_RetainingWalls_Parapets", "SP_Storefront_B1")]
blockers, _ = combined(blocker_objects, lambda o, m: 0)

terrain = bpy.data.objects["Terrain_DEM5A"]
corners = [terrain.matrix_world @ Vector(c) for c in terrain.bound_box]
x0 = math.floor(min(c.x for c in corners))
x1 = math.ceil(max(c.x for c in corners))
north = math.ceil(max(c.y for c in corners))
south = math.floor(min(c.y for c in corners))
width, depth = x1 - x0, north - south
cells = bytearray(width * depth)
heights = [0] * (width * depth)
up, down = Vector((0, 0, 1)), Vector((0, 0, -1))
for row in range(depth):
    y = north - row - 0.5  # rows run north → south, i.e. along +z in the web world
    for col in range(width):
        x = x0 + col + 0.5
        hit, normal, face, _ = surfaces.ray_cast(Vector((x, y, 400)), down)
        if hit is None:
            continue
        index = row * width + col
        heights[index] = max(-32000, min(32000, round(hit.z * 100)))
        kind = surface_classes[face]
        # The banks of 神田川 below the retaining walls are not somewhere to walk.
        if hit.z < 2.5:
            kind = 0
        if kind and normal.z > 0.5:
            # Anything of a building above the ground means the cell is inside or under it.
            if blockers.ray_cast(hit + Vector((0, 0, 0.15)), up, 300)[0] is not None:
                kind = 0
        cells[index] = kind
with open(os.path.join(OUT, "nav.bin"), "wb") as f:
    f.write(bytes(cells))
    f.write(struct.pack(f"<{len(heights)}h", *heights))
print("GRID", width, depth, "walkable", sum(1 for c in cells if c))


# —— Shopfronts from the awnings ——
CATEGORY = {
    "WB_Awning_food": "food", "WB_Awning_cafe": "cafe", "WB_Awning_bar": "bar", "WB_Awning_books": "books",
    "WB_Awning_music": "music", "WB_Awning_conv": "konbini", "WB_Awning_health": "health",
    "WB_Awning_sport": "sport", "WB_Awning_tech": "tech", "WB_Awning_other": "other",
}
shops_object = bpy.data.objects["Shops_GroundFloor"]
bm = bmesh.new()
bm.from_mesh(shops_object.data)
bm.transform(shops_object.matrix_world)
bm.faces.ensure_lookup_table()
seen, shops = set(), []
for face in bm.faces:
    name = shops_object.material_slots[face.material_index].name
    if face.index in seen or name not in CATEGORY:
        continue
    island, stack = [], [face]
    seen.add(face.index)
    while stack:
        f = stack.pop()
        island.append(f)
        for edge in f.edges:
            for other in edge.link_faces:
                if other.index not in seen and other.material_index == face.material_index:
                    seen.add(other.index)
                    stack.append(other)
    area = sum(f.calc_area() for f in island) or 1
    centre = sum((f.calc_center_median() * f.calc_area() for f in island), Vector()) / area
    normal = sum((f.normal * f.calc_area() for f in island), Vector())
    horizontal = Vector((normal.x, normal.y, 0))
    if horizontal.length < 1e-6:
        continue
    horizontal.normalize()
    shops.append({
        "kind": CATEGORY[name],
        "x": round(centre.x, 2), "z": round(-centre.y, 2), "y": round(centre.z, 2),
        "nx": round(horizontal.x, 3), "nz": round(-horizontal.y, 3),
    })
bm.free()

frames = scene.frame_end - scene.frame_start + 1
with open(os.path.join(OUT, "places.json"), "w", encoding="utf-8") as f:
    json.dump(
        {
            "grid": {"x0": x0, "z0": -north, "width": width, "depth": depth, "cell": 1},
            "vehicleLoopSeconds": frames / scene.render.fps,
            "shops": shops,
        },
        f,
        ensure_ascii=False,
        separators=(",", ":"),
    )
print("SHOPS", len(shops))

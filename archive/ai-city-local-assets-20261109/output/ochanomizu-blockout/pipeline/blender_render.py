"""Blender: camera/light/render setup for the Ochanomizu blockout. Call setup(view, res_x, samples)."""
import bpy, math
from mathutils import Vector, Euler

sc = bpy.data.scenes["Ochanomizu"]
B = (-480.0, -340.0, 310.0, 390.0)

def _cam(name):
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name)); sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"; cam.data.clip_start = 1; cam.data.clip_end = 6000
    return cam

def setup(view="iso", res_x=5120, samples=96, freestyle=True, line=1.15, focus=None, aspect=None):
    cx, cy = (B[0] + B[2]) / 2, (B[1] + B[3]) / 2
    if view.startswith("iso"):   # 2:1 game dimetric; iso_sw = camera in the SW looking NE, etc.
        az = {"iso": -45, "iso_sw": -45, "iso_se": 45, "iso_ne": 135, "iso_nw": -135}[view]
        rot = Euler((math.radians(60), 0, math.radians(az)))
        zr = (-12, 175)
    elif view == "plan":   # north-up orthographic plan (for checking against the satellite image)
        rot = Euler((0, 0, 0)); zr = (-12, 175)
    else:                  # north-up oblique from the south, matches the supplied screenshot framing
        rot = Euler((math.radians(50), 0, 0)); zr = (-12, 175)
    cam = _cam("CAM_" + view)
    cam.rotation_euler = rot
    fwd = rot.to_matrix() @ Vector((0, 0, -1)); right = rot.to_matrix() @ Vector((1, 0, 0)); up = rot.to_matrix() @ Vector((0, 1, 0))
    corners = [Vector((x, y, z)) for x in (B[0], B[2]) for y in (B[1], B[3]) for z in zr]
    us = [c.dot(right) for c in corners]; vs = [c.dot(up) for c in corners]
    w, h = max(us) - min(us), max(vs) - min(vs)
    m = 1.03
    centre = right * (max(us) + min(us)) / 2 + up * (max(vs) + min(vs)) / 2
    if focus:   # (x, y, z, width_m): close-up framing
        fx, fy, fz, fw = focus
        centre = Vector((fx, fy, fz)); w, h = fw, fw / (aspect or 1.6); m = 1.0
    cam.location = centre - fwd * 2500
    cam.data.ortho_scale = max(w, h) * m
    sc.camera = cam
    sc.render.resolution_x = res_x
    sc.render.resolution_y = int(round(res_x * h / w)) if w >= h else res_x
    if w < h:
        sc.render.resolution_y = res_x; sc.render.resolution_x = int(round(res_x * w / h))
    sc.render.resolution_percentage = 100
    # engine
    try: sc.render.engine = "CYCLES"
    except TypeError as e: print(e)
    cp = bpy.context.preferences.addons["cycles"].preferences
    cp.compute_device_type = "CUDA"   # OptiX kernel fails to compile on this install
    cp.refresh_devices()
    for d in cp.devices: d.use = d.type == "CUDA"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError: pass
    sc.view_settings.exposure = 0.25
    # world + sun
    world = bpy.data.worlds.get("WB_World") or bpy.data.worlds.new("WB_World")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.88, 0.84, 0.78, 1)   # autumn: warm sky fill; bg.inputs[1].default_value = 0.75
    sc.world = world
    sun = bpy.data.objects.get("SUN")
    if not sun:
        sun = bpy.data.objects.new("SUN", bpy.data.lights.new("SUN", "SUN")); sc.collection.objects.link(sun)
    sun.data.energy = 4.6; sun.data.angle = math.radians(2)
    sun.data.color = (1.0, 0.86, 0.68)   # autumn: low golden sun
    # from the south-west-ish (afternoon), high enough to keep the valley readable
    # Phase 3: autumn afternoon — sun 35° above the horizon from the south-west (longer shadows, warm light)
    sun.rotation_euler = Euler((math.radians(55), 0, math.radians(-35)))
    sc.render.film_transparent = False
    # freestyle outlines (勾繪)
    sc.render.use_freestyle = freestyle
    sc.render.line_thickness_mode = "ABSOLUTE"; sc.render.line_thickness = line
    vl = sc.view_layers[0]
    vl.use_freestyle = freestyle
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    if freestyle:
        for ls in list(fs.linesets): fs.linesets.remove(ls)
        ls = fs.linesets.new("WB_Lines")
        ls.select_by_visibility = True; ls.visibility = "VISIBLE"
        ls.select_by_edge_types = True
        ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
        ls.select_by_collection = True; ls.collection_negation = "EXCLUSIVE"
        ex = bpy.data.collections.get("FS_Exclude") or bpy.data.collections.new("FS_Exclude")
        ls.collection = ex
        for o in list(ex.objects): ex.objects.unlink(o)
        for n in ("Terrain_DEM5A", "Trees_Placeholder", "KandaRiver_Water", "Roads", "Walkable_Surfaces"):
            o = bpy.data.objects.get(n)
            if o: ex.objects.link(o)
        lst = ls.linestyle
        lst.color = (0.22, 0.22, 0.24); lst.thickness = line; lst.alpha = 0.9
    return sc.render.resolution_x, sc.render.resolution_y

GHOST_HIDE = ("08_Buildings", "09_Landmarks", "10_Vegetation", "03_Roads", "07_Platforms")

def xray(on):
    """Underground view: hide upper layers, ghost the terrain, show 11_Underground."""
    for c in bpy.data.collections:
        if c.name in GHOST_HIDE: c.hide_render = on
        if c.name == "11_Underground": c.hide_render = not on
    ter = bpy.data.objects["Terrain_DEM5A"]
    g = bpy.data.materials.get("WB_Ghost")
    if not g:
        g = bpy.data.materials.new("WB_Ghost"); g.use_nodes = True
        nt = g.node_tree; out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Base Color"].default_value = (0.85, 0.83, 0.79, 1)
        tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mx = nt.nodes.new("ShaderNodeMixShader")
        mx.inputs[0].default_value = 0.72
        nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs[0])
    if on:
        ter["orig_mats"] = [m.name if m else "" for m in ter.data.materials]
        for i in range(len(ter.data.materials)): ter.data.materials[i] = g
    elif "orig_mats" in ter:
        for i, n in enumerate(ter["orig_mats"]): ter.data.materials[i] = bpy.data.materials[n] if n else None

def render(path):
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True, scene=sc.name)

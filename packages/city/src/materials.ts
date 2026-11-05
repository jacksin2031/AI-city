// The Blender materials are procedural (noise, bricks, window grids), which glTF cannot carry.
// The export records their colours and pattern sizes in materials.json; here the same patterns
// are rebuilt as small shader additions on three.js standard materials. Colours are linear.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { landmarkForNode } from "./landmarks";

type Colour = [number, number, number];
export type MaterialSpec = {
  kind: "flat" | "noise" | "brick" | "facade";
  color: Colour;
  roughness: number;
  pairs?: Colour[][];
  noise?: number[];
  grid?: [number, number];
  brick?: {
    a: Colour;
    b: Colour;
    mortar: Colour;
    scale: number;
    width: number;
    height: number;
    mortarSize: number;
  };
};
export type MaterialSpecs = Record<string, MaterialSpec>;
export type BuildingFade = {
  center: { value: THREE.Vector2 };
  zoom: { value: number };
  selected?: { value: number };
  pulse?: { value: number };
};

/** Fade buildings near the view target as the orthographic camera zooms in. */
export function updateBuildingFade(fade: BuildingFade, x: number, y: number, zoom: number) {
  fade.center.value.set(x, -y);
  fade.zoom.value = zoom;
}

function enableBuildingFade(material: THREE.MeshStandardMaterial, fade: BuildingFade) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.transparent = true;
  material.customProgramCacheKey = () => `${cacheKey}-building-fade`;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.cityFadeCenter = fade.center;
    shader.uniforms.cityFadeZoom = fade.zoom;
    shader.uniforms.citySelectedLandmark = fade.selected ?? { value: 0 };
    shader.uniforms.cityLandmarkPulse = fade.pulse ?? { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 cityBounds;\nattribute float cityLandmark;\nvarying vec4 vCityBounds;\nvarying float vCityLandmark;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCityBounds = cityBounds;\nvCityLandmark = cityLandmark;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec4 vCityBounds;\nvarying float vCityLandmark;\nuniform vec2 cityFadeCenter;\nuniform float cityFadeZoom;\nuniform float citySelectedLandmark;\nuniform float cityLandmarkPulse;",
      )
      .replace(
        "#include <alphahash_fragment>",
        `
        vec2 nearest = clamp(cityFadeCenter, vCityBounds.xy, vCityBounds.zw);
        float nearby = 1.0 - smoothstep(8.0, 35.0, distance(cityFadeCenter, nearest));
        float closeZoom = smoothstep(8.0, 20.0, cityFadeZoom);
        diffuseColor.a *= 1.0 - 0.7 * nearby * closeZoom;
        #include <alphahash_fragment>`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        if (vCityLandmark > 0.5 && abs(vCityLandmark - citySelectedLandmark) < 0.25)
          outgoingLight = mix(outgoingLight, vec3(1.0), cityLandmarkPulse);
        #include <opaque_fragment>`,
      );
  };
}

const luminance = (c: Colour) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const vec3 = (c: Colour) => new THREE.Vector3(...c);

// Parameters from blender_materials.build_facades(); these cannot be inferred from colour pairs.
const facadeParameters: Record<
  string,
  { window: [number, number, number, number]; roof?: number; shop?: boolean }
> = {
  F_OfficeWhite: { window: [0.07, 0.93, 0.32, 0.82] },
  F_OfficeGrey: { window: [0.225, 0.775, 0.32, 0.8] },
  F_Residential: { window: [0.25, 0.75, 0.22, 0.77] },
  F_BrickTile: { window: [0.275, 0.725, 0.3, 0.8] },
  F_SmallShop: { window: [0.3, 0.7, 0.32, 0.77] },
  F_GlassTower: { window: [0.07, 1, 0.16, 1] },
  F_SolaCity: { window: [0.38, 1, 0.05, 1] },
  F_Waterras: { window: [0.05, 1, 0.08, 1] },
  F_Nikolai: { window: [0.36, 0.64, 0.3, 0.75], roof: 0.2, shop: false },
  F_Seido: { window: [0.15, 0.85, 0.12, 0.72], roof: 0.2, shop: false },
  F_JRStation: { window: [0.05, 0.95, 0.3, 0.85] },
};

const noiseChunk = /* glsl */ `
float cityHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cityNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cityHash(i), cityHash(i + vec3(1, 0, 0)), f.x),
        mix(cityHash(i + vec3(0, 1, 0)), cityHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(cityHash(i + vec3(0, 0, 1)), cityHash(i + vec3(1, 0, 1)), f.x),
        mix(cityHash(i + vec3(0, 1, 1)), cityHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float cityFbm(vec3 p) {
  return cityNoise(p) * 0.55 + cityNoise(p * 2.03) * 0.3 + cityNoise(p * 4.1) * 0.15;
}
// Wall coordinates: along the wall horizontally, and up.
vec2 cityWallUv(vec3 p, vec3 n) {
  vec3 t = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0));
  return vec2(dot(p, t), p.y);
}
`;

/** Patterns written into `diffuseColor` (and `roughnessFactor`) in the fragment shader. */
function pattern(name: string, spec: MaterialSpec) {
  const pairs = spec.pairs ?? [];
  const twos = pairs.filter((pair) => pair.length === 2);
  const singles = pairs.filter((pair) => pair.length === 1).map((pair) => pair[0] as Colour);
  const dirt = singles.sort((a, b) => luminance(a) - luminance(b))[0];
  const scales = [...(spec.noise ?? [])].sort((a, b) => a - b);
  if (spec.kind === "facade" && twos.length >= 3) {
    // Curtain walls (Sola City, the glass towers) are vertical glass bands, not punched windows.
    const facade = facadeParameters[name];
    const [wall, glass, roof, alt] = twos as [Colour[], Colour[], Colour[], Colour[] | undefined];
    const [across, storey] = spec.grid ?? [2.5, 3.6];
    return {
      uniforms: {
        wallA: vec3(wall[0] as Colour),
        wallB: vec3(wall[1] as Colour),
        glassA: vec3(glass[0] as Colour),
        glassB: vec3(glass[1] as Colour),
        roofA: vec3(roof[0] as Colour),
        roofB: vec3(roof[1] as Colour),
        altA: vec3((alt?.[0] ?? roof[0]) as Colour),
        altB: vec3((alt?.[1] ?? roof[1]) as Colour),
        dirt: vec3(dirt ?? (wall[0] as Colour)),
        cellSize: new THREE.Vector2(across, storey),
        windowBox: new THREE.Vector4(...(facade?.window ?? [0.12, 0.88, 0.32, 0.82])),
        roofThreshold: facade?.roof ?? 0.6,
        hasShop: facade?.shop === false ? 0 : 1,
      },
      code: /* glsl */ `
        vec3 n = normalize(vCityNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float seed = vCityBuilding.x;
        // Some exported horizontal faces have a normal opposite to their triangle winding.
        // Classify roofs by slope, independently of either face orientation.
        if (abs(n.y) > roofThreshold) {
          vec3 roofColour = mix(roofA, roofB, cityNoise(vCityPos * 1.6));
          vec3 altColour = seed > 0.85 ? vec3(0.262, 0.292, 0.242) : (seed > 0.55 ? altB : altA);
          diffuseColor.rgb = mix(roofColour, altColour, 0.55);
        } else {
          vec2 uv = cityWallUv(vCityPos, n) / cellSize;
          vec2 f = fract(uv);
          float rel = vCityPos.y - vCityBuilding.y;
          float upper = step(windowBox.x, f.x) * step(f.x, windowBox.y)
            * step(windowBox.z, f.y) * step(f.y, windowBox.w);
          float shopfront = step(0.05, f.x) * step(rel, 3.4);
          float window = mix(upper, shopfront, hasShop * step(0.15, rel) * step(rel, 4.2));
          vec3 wall = mix(wallA, wallB, seed);
          wall = mix(wall, dirt, cityFbm(vCityPos * 0.08) * 0.35);
          vec3 pane = mix(glassA, glassB, cityHash(vec3(floor(uv), seed * 97.0)));
          diffuseColor.rgb = mix(wall, pane, window);
          roughnessFactor = mix(roughnessFactor, 0.12, window);
        }`,
    };
  }
  if (spec.kind === "brick" && spec.brick) {
    const brick = spec.brick;
    return {
      uniforms: {
        brickA: vec3(brick.a),
        brickB: vec3(brick.b),
        mortar: vec3(brick.mortar),
        brickSize: new THREE.Vector2(brick.width / brick.scale, brick.height / brick.scale),
        mortarSize: brick.mortarSize / brick.scale,
        dirt: vec3(dirt ?? brick.b),
        dirtAmount: dirt ? 0.3 : 0,
      },
      code: /* glsl */ `
        vec3 n = normalize(vCityNormal);
        vec2 uv = abs(n.y) > 0.7 ? vCityPos.xz : cityWallUv(vCityPos, n);
        vec2 cell = uv / brickSize;
        cell.x += step(1.0, mod(floor(cell.y), 2.0)) * 0.5;
        vec2 f = fract(cell) * brickSize;
        float joint = step(f.x, mortarSize) + step(f.y, mortarSize);
        vec3 face = mix(brickA, brickB, cityHash(vec3(floor(cell), 3.0)));
        vec3 colour = mix(face, mortar, clamp(joint, 0.0, 1.0));
        diffuseColor.rgb = mix(colour, dirt, cityFbm(vCityPos * 0.4) * dirtAmount);`,
    };
  }
  if (spec.kind === "noise" && twos.length) {
    const main = twos[0] as Colour[];
    // Lawns carry fallen maple leaves in Blender; elsewhere the single colour is grime.
    const leaves = name === "WB_Green";
    return {
      uniforms: {
        noiseA: vec3(main[0] as Colour),
        noiseB: vec3(main[1] as Colour),
        dirt: vec3(dirt ?? (main[0] as Colour)),
        dirtAmount: dirt ? (leaves ? 0.55 : 0.3) : 0,
        largeScale: scales[0] ?? 0.4,
        smallScale: scales[scales.length - 1] ?? 1,
        leaves: leaves ? 1 : 0,
      },
      code: /* glsl */ `
        float large = cityFbm(vCityPos * largeScale);
        vec3 colour = mix(noiseA, noiseB, smoothstep(0.25, 0.75, large));
        float speck = cityFbm(vCityPos * max(smallScale, 2.2) + 11.0);
        float amount = leaves > 0.5 ? step(0.62, speck) : speck;
        diffuseColor.rgb = mix(colour, dirt, amount * dirtAmount);`,
    };
  }
  return null;
}

/** A standard material that draws `name`'s procedural pattern in world space. */
export function cityMaterial(
  name: string,
  spec: MaterialSpec | undefined,
  source: THREE.MeshStandardMaterial,
) {
  const material = source.clone();
  material.name = name;
  // Older exports retain the sign image only as emission; restore its original base colour.
  if (name.startsWith("SIGN_") && !material.map && material.emissiveMap) {
    material.map = material.emissiveMap;
    material.color.setRGB(1, 1, 1);
  }
  if (!spec) return { material, building: false };
  material.roughness = spec.roughness;
  const made = pattern(name, spec);
  if (!made) return { material, building: false };
  const uniforms = Object.fromEntries(
    Object.entries(made.uniforms).map(([key, value]) => [key, { value }]),
  );
  const declarations = Object.entries(made.uniforms)
    .map(([key, value]) => {
      const type =
        value instanceof THREE.Vector4
          ? "vec4"
          : value instanceof THREE.Vector3
            ? "vec3"
            : value instanceof THREE.Vector2
              ? "vec2"
              : "float";
      return `uniform ${type} ${key};`;
    })
    .join("\n");
  // Colours and sizes are uniforms, so every material of a kind shares one compiled program.
  material.customProgramCacheKey = () => `city-${spec.kind}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // Geometry is merged in world space, so the attributes already are world coordinates.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 cityBuilding;\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;\nvarying vec2 vCityBuilding;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCityPos = position;\nvCityNormal = normal;\nvCityBuilding = cityBuilding;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;\nvarying vec2 vCityBuilding;\n${declarations}\n${noiseChunk}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n{${made.code}\n}`,
      );
  };
  return { material, building: spec.kind === "facade" };
}

/** Stable 0–1 value per building, standing in for Blender's Object Info › Random. */
function randomFor(name: string) {
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  return ((hash >>> 0) % 10007) / 10007;
}

/** Drop corrupt, hundreds-of-metres-long triangles in this one exported building. */
function repairWaterrasGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex();
  if (!positions || !indices) return geometry;
  const valid: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i + 2 < indices.count; i += 3) {
    const ia = indices.getX(i),
      ib = indices.getX(i + 1),
      ic = indices.getX(i + 2);
    a.fromBufferAttribute(positions, ia);
    b.fromBufferAttribute(positions, ib);
    c.fromBufferAttribute(positions, ic);
    if (
      a.distanceToSquared(b) > 250 ** 2 ||
      b.distanceToSquared(c) > 250 ** 2 ||
      c.distanceToSquared(a) > 250 ** 2
    )
      continue;
    valid.push(ia, ib, ic);
  }
  if (valid.length === indices.count) return geometry;
  geometry.setIndex(valid);
  // Unreferenced bad vertices must not expand bounds used by culling and building fade.
  const cleaned = geometry.toNonIndexed();
  geometry.dispose();
  return cleaned;
}

/**
 * Bake every static mesh into world space and merge them by material, turning ~1,000 draw
 * calls into about a hundred. Buildings keep their seed and base height per vertex.
 */
export function mergeCity(
  root: THREE.Object3D,
  specs: MaterialSpecs,
  fade?: BuildingFade,
): THREE.Group {
  root.updateMatrixWorld(true);
  const groups = new Map<
    string,
    {
      name: string;
      source: THREE.MeshStandardMaterial;
      geometries: THREE.BufferGeometry[];
      building: boolean;
    }
  >();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    const name = source.name || "unnamed";
    let owner: THREE.Object3D | null = mesh;
    while (owner && owner.userData.base_z === undefined && owner !== root) owner = owner.parent;
    const base = owner?.userData.base_z;
    const isBuilding = typeof base === "number";
    const seed = randomFor(owner && owner !== root ? owner.name : mesh.name);
    let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (mesh.name === "LM_waterras_tower_7") geometry = repairWaterrasGeometry(geometry);
    // Station signs use emissive textures rather than a base-colour map.
    const keep = new Set([
      "position",
      "normal",
      ...(source.map || source.emissiveMap ? ["uv"] : []),
    ]);
    for (const attribute of Object.keys(geometry.attributes))
      if (!keep.has(attribute)) geometry.deleteAttribute(attribute);
    if (!geometry.index)
      geometry.setIndex([...Array(geometry.attributes.position?.count ?? 0).keys()]);
    const count = geometry.attributes.position?.count ?? 0;
    const building = new Float32Array(count * 2);
    // Blender's base_z is a height; three.js is Y-up, so it is the y of the building's foot.
    for (let index = 0; index < count; index++) {
      building[index * 2] = seed;
      building[index * 2 + 1] = typeof base === "number" ? base : -1000;
    }
    geometry.setAttribute("cityBuilding", new THREE.BufferAttribute(building, 2));
    if (isBuilding) {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      const values = new Float32Array(count * 4);
      if (bounds)
        for (let index = 0; index < count; index++)
          values.set([bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z], index * 4);
      geometry.setAttribute("cityBounds", new THREE.BufferAttribute(values, 4));
      const landmark = landmarkForNode(owner?.name ?? mesh.name);
      geometry.setAttribute(
        "cityLandmark",
        new THREE.BufferAttribute(new Float32Array(count).fill(landmark?.id ?? 0), 1),
      );
    }
    const key = `${name}:${isBuilding ? "building" : "other"}`;
    const group = groups.get(key) ?? { name, source, geometries: [], building: isBuilding };
    group.geometries.push(geometry);
    groups.set(key, group);
  });
  const city = new THREE.Group();
  city.name = "ochanomizu";
  for (const { name, source, geometries, building } of groups.values()) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const { material } = cityMaterial(name, specs[name], source);
    if (building && fade) enableBuildingFade(material, fade);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.castShadow =
      !/^(WB_Water|WB_Road|WB_RoadMajor|WB_RoadPaint|WB_Ground|WB_Footway|WB_Green|WB_Plaza)/.test(
        name,
      );
    city.add(mesh);
  }
  return city;
}

import type { DialoguePlace, DialogueResult, PublicResident } from "@ai-city/contracts";
import * as THREE from "three";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type AnimatedCharacter, animationFor, characterAspect } from "./animated-character";
import { createCityAudio } from "./audio";
import { autumnLighting } from "./autumn";
import { encounterPlace, findEncounter } from "./encounter";
import {
  clampCamera,
  DEFAULT_ZOOM,
  focusCamera,
  panCamera,
  project,
  projectResident,
  RESIDENT_HEIGHT,
  RESIDENT_METRES_PER_UNIT,
  SCREEN,
  type SceneCamera,
  type ScenePresentation,
  type ScenePresentationFrame,
  facingFor as sceneFacingFor,
  tourCamera,
  VIEW,
} from "./focus";
import { characterDataUrl, illustrationPalette } from "./illustrations";
import { LANDMARKS, type Landmark } from "./landmarks";
import { type MaterialSpecs, mergeCity, updateBuildingFade } from "./materials";
import { type PickTarget, pickResident } from "./picking";
import { SCENE_RESIDENT_LIMIT } from "./roster";
import {
  type Actor,
  type CityAction,
  commandActor,
  createActor,
  type Direction,
  describeActivity,
  stepActor,
} from "./simulation";
import { createTraffic, type TrafficData } from "./traffic-scene";
import {
  cityViewport,
  nextResidentTourIndex,
  nextVisibleTourIndex,
  pointInVisibleCity,
} from "./viewport";
import { type CityPlaces, createWorld, heightAt, parseGrid, tour, type World } from "./world";

export type IllustratedCity = {
  setResidents(residents: PublicResident[], addedIds?: string[]): void;
  /** Pick up newly loaded character art without rebuilding the scene. */
  refreshCharacters(): void;
  /** Recreate the animated player of every resident using one of these avatar versions. */
  rebuildCharacters(avatarVersions: readonly string[]): void;
  setMotionEnabled(enabled: boolean): void;
  select(id: string | null): void;
  selectLandmark(id: number | null): void;
  act(id: string, action: CityAction): void;
  present(presentation: ScenePresentation | null): void;
  /** Street sounds and music; start from a tap, as browsers block sound until then. */
  setSoundEnabled(enabled: boolean): Promise<void>;
  setSoundVolume(volume: number): void;
  destroy(): void;
};
type Label = { sprite: THREE.Sprite; set(text: string): void; aspect: number };
type Entry = {
  actor: Actor;
  resident: PublicResident;
  group: THREE.Group;
  sprite: THREE.Sprite;
  ghost: THREE.Sprite;
  ring: THREE.Mesh;
  bubble: Label;
  pulse: THREE.Mesh;
  /** Scene time when the arrival / departure animation began; 0 when none is running. */
  enterAt: number;
  leaveAt: number;
  welcomeUntil: number;
  hopUntil: number;
  facing: Direction;
  animated?: { source: AnimatedCharacter; texture: THREE.CanvasTexture; version: string };
};

const directions: Direction[] = ["front", "left", "back", "right"];
const poses = ["idle", "walk", "talk", "wave", "sit"] as const;
const versions = { sora: "fixture-sora-v1", haru: "fixture-haru-v1", guest: "placeholder-guest" };
const preset = "こんにちは。広場でひと休みしよう！";
const font = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
/** Character textures are rasterised at twice their 96×128 artwork size. */
const CHARACTER_PIXELS = 2;
const FRAME_SECONDS = 1 / 30;

const ARRIVE_SECONDS = 1.1;
const LEAVE_SECONDS = 0.9;
const easeOutBounce = (t: number) => {
  const n = 7.5625;
  const d = 2.75;
  const bounce = (offset: number, base: number) => n * (t - offset / d) ** 2 + base;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return bounce(1.5, 0.75);
  if (t < 2.5 / d) return bounce(2.25, 0.9375);
  return bounce(2.625, 0.984375);
};
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const mix = (a: SceneCamera, b: SceneCamera, t: number): SceneCamera => ({
  centerX: a.centerX + (b.centerX - a.centerX) * t,
  centerY: a.centerY + (b.centerY - a.centerY) * t,
  height: a.height + (b.height - a.height) * t,
  zoom: a.zoom + (b.zoom - a.zoom) * t,
});
/** World metres (x east, y south, height up) to three.js coordinates (x, y up, z south). */
const toThree = (x: number, y: number, height: number) => new THREE.Vector3(x, height, y);

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Character artwork could not be loaded"));
    image.src = source;
  });
}

async function fetchBuffer(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`City data could not be loaded: ${response.status}`);
  return response.arrayBuffer();
}

/** A camera-facing text plate drawn on a canvas; sized in screen units each frame. */
function textLabel(style: { background: string; color: string; size: number; wrap?: number }) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  const label: Label = {
    sprite,
    aspect: 1,
    set(text: string) {
      if (!context) return;
      const px = style.size * 4;
      context.font = `600 ${px}px ${font}`;
      const lines: string[] = [];
      const limit = (style.wrap ?? 1e6) * 4;
      let line = "";
      for (const char of text) {
        if (context.measureText(line + char).width > limit && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      lines.push(line);
      const pad = px * 0.45;
      const width = Math.ceil(
        Math.max(...lines.map((l) => context.measureText(l).width)) + pad * 2,
      );
      const height = Math.ceil(lines.length * px * 1.3 + pad * 1.2);
      canvas.width = width;
      canvas.height = height;
      context.font = `600 ${px}px ${font}`;
      context.fillStyle = style.background;
      context.beginPath();
      context.roundRect(0, 0, width, height, px * 0.5);
      context.fill();
      context.fillStyle = style.color;
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const [index, value] of lines.entries())
        context.fillText(value, width / 2, pad * 0.6 + px * 1.3 * (index + 0.5));
      texture.needsUpdate = true;
      label.aspect = width / height;
      sprite.userData.lines = lines.length;
    },
  };
  return label;
}

/** Browser only: the city scene exported from Blender and existing public residents. */
export async function createDevelopmentCity(
  parent: HTMLElement,
  options: {
    residents?: PublicResident[];
    motionEnabled?: boolean;
    /** Fill the viewport while keeping the scene aspect ratio. */
    fillViewport?: boolean;
    signal?: AbortSignal;
    /** Where the exported 3D city is served from (same origin). */
    assetBase?: string;
    onSelect?: (id: string) => void;
    onSelectLandmark?: (landmark: Landmark | null) => void;
    onEncounter?: (ids: [string, string], place: DialoguePlace) => Promise<DialogueResult | null>;
    onAction?: (id: string, action: CityAction) => void;
    onReady?: () => void;
    onPresentationFrame?: (frame: ScenePresentationFrame | null) => void;
    onClearSelection?: () => void;
    /** Optional locally supplied animation source; authorization remains with its caller. */
    createAnimatedCharacter?: (resident: PublicResident) => AnimatedCharacter | null;
  } = {},
): Promise<IllustratedCity> {
  const signal = options.signal;
  const base = options.assetBase ?? "/city3d/";
  const aborted = () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  // —— Renderer first, so the city's canvas takes its place while the scene loads ——
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  parent.append(canvas);
  const loaded = loadScene(base, signal)
    .then((scene) => {
      aborted();
      return scene;
    })
    .catch((error: unknown) => {
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      throw error;
    });
  const { cityModel, vehicleModel, characters, world, specs, trafficData } = await loaded;
  return startCity(
    parent,
    options,
    renderer,
    cityModel,
    vehicleModel,
    characters,
    world,
    specs,
    trafficData,
  );
}

/** Fetch and parse everything the city needs; nothing here touches the page. */
async function loadScene(base: string, signal?: AbortSignal) {
  const aborted = () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  const [cityBuffer, vehicleBuffer, gridBuffer, places, specs, trafficData] = await Promise.all([
    fetchBuffer(`${base}city.glb`, signal),
    fetchBuffer(`${base}vehicles.glb`, signal),
    fetchBuffer(`${base}nav.bin`, signal),
    fetchBuffer(`${base}places.json`, signal).then(
      (buffer) => JSON.parse(new TextDecoder().decode(buffer)) as CityPlaces,
    ),
    fetchBuffer(`${base}materials.json`, signal).then(
      (buffer) => JSON.parse(new TextDecoder().decode(buffer)) as MaterialSpecs,
    ),
    fetchBuffer(`${base}traffic.json`, signal).then(
      (buffer) => JSON.parse(new TextDecoder().decode(buffer)) as TrafficData,
    ),
  ]);
  aborted();
  const loader = new GLTFLoader();
  // Embedded textures become blob: URLs. The default ImageBitmapLoader fetches them, which the
  // CSP's connect-src forbids; an <img> load is covered by img-src instead.
  loader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: "city_image_textures" };
  });
  const [cityModel, vehicleModel] = await Promise.all([
    loader.parseAsync(cityBuffer, base),
    loader.parseAsync(vehicleBuffer, base),
  ]);
  const characters = new Map<string, THREE.Texture>();
  await Promise.all(
    Object.entries(versions).flatMap(([palette, version]) =>
      directions.flatMap((direction) =>
        poses.flatMap((pose) =>
          [0, 1].map(async (frame) => {
            const image = await loadImage(
              characterDataUrl(version, direction, pose, frame, CHARACTER_PIXELS),
            );
            const texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            characters.set(`${palette}-${direction}-${pose}-${frame}`, texture);
          }),
        ),
      ),
    ),
  );
  aborted();
  const world: World = createWorld(parseGrid(places.grid, gridBuffer), places.shops);
  return { cityModel, vehicleModel, characters, world, specs, trafficData };
}

type CityOptions = Parameters<typeof createDevelopmentCity>[1] & {};

function startCity(
  parent: HTMLElement,
  options: CityOptions,
  renderer: THREE.WebGLRenderer,
  cityModel: GLTF,
  vehicleModel: GLTF,
  characters: Map<string, THREE.Texture>,
  world: World,
  specs: MaterialSpecs,
  trafficData: TrafficData,
): IllustratedCity {
  const canvas = renderer.domElement;
  // —— Scene and light ——
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const ambient = new THREE.HemisphereLight();
  scene.add(ambient);
  const sun = new THREE.DirectionalLight();
  const sunDirection = new THREE.Vector3();
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // Read this before mergeCity bakes the source mesh transforms into the combined geometry.
  const metroRailHeightOffset =
    cityModel.scene.getObjectByName("Rail_Metro_Marunouchi")?.position.y ?? 0;
  const buildingFade = {
    center: { value: new THREE.Vector2() },
    zoom: { value: 0 },
    selected: { value: 0 },
    pulse: { value: 0 },
  };
  const city = mergeCity(cityModel.scene, specs, buildingFade);
  scene.add(city);
  const vehicles = vehicleModel.scene;
  vehicles.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  scene.add(vehicles);
  const traffic = createTraffic(trafficData, vehicles, city, metroRailHeightOffset);
  const audio = createCityAudio();
  let audioClock = 0;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const residentLayer = new THREE.Group();
  scene.add(residentLayer);
  const ringGeometry = new THREE.RingGeometry(0.5, 0.95, 40).rotateX(-Math.PI / 2);
  const nearer = toThree(VIEW.toCamera.x, VIEW.toCamera.y, VIEW.toCamera.height).multiplyScalar(
    2.5,
  );
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2c45a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  let residents = options.residents ?? [];
  let moving = options.motionEnabled ?? true;
  let selectedId: string | null = null;
  let exchange: {
    ids: [string, string];
    lines: DialogueResult["lines"];
    source: DialogueResult["source"];
    startedAt: number;
  } | null = null;
  let dialoguePending = false;
  let pendingPair: [string, string] | null = null;
  const lastSpoke = new Map<string, number>();
  let nextEncounter = 10;
  let presentation: ScenePresentation | null = null;
  let lastFrame = "";
  let destroyed = false;
  let clock = 0;
  let now = 0;
  let lastLightingMinute = -1;
  const entries = new Map<string, Entry>();

  function updateLighting() {
    const local = new Date();
    const minute = local.getHours() * 60 + local.getMinutes();
    if (minute === lastLightingMinute) return;
    lastLightingMinute = minute;
    const light = autumnLighting(local);
    ambient.color.copy(light.sky);
    ambient.groundColor.copy(light.ground);
    ambient.intensity = light.hemisphereIntensity;
    sun.color.copy(light.sun);
    sun.intensity = light.sunIntensity;
    sunDirection.copy(light.direction);
    (scene.background as THREE.Color).copy(light.background);
    renderer.toneMappingExposure = light.exposure;
  }

  // —— Camera: tour/user view, plus a glide whenever the target changes ——
  const groundAt = (x: number, y: number) => heightAt(world.grid, x, y);
  const start = tour[0] ?? { x: -90, y: 0 };
  let view: SceneCamera = clampCamera({
    centerX: start.x,
    centerY: start.y,
    height: groundAt(start.x, start.y),
    zoom: DEFAULT_ZOOM,
  });
  let shown: SceneCamera = view;
  let glide: { from: SceneCamera; startedAt: number; duration: number } | null = null;
  let tourStep = 0;
  let tourWait = 9;
  let tourResidentId: string | null = null;
  let tourGlide: { from: SceneCamera; to: SceneCamera; t: number } | null = null;
  let userHoldUntil = 0;

  function placeCamera(target: SceneCamera) {
    const halfW = SCREEN.width / 2 / target.zoom;
    const halfH = SCREEN.height / 2 / target.zoom;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    const look = toThree(target.centerX, target.centerY, target.height);
    const away = toThree(VIEW.toCamera.x, VIEW.toCamera.y, VIEW.toCamera.height).multiplyScalar(
      1500,
    );
    camera.position.copy(look).add(away);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    // Shadows cover what is on screen, a little beyond it, at whatever zoom.
    const reach = Math.max(halfW, halfH) * 1.6 + 30;
    const shadow = sun.shadow.camera;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.near = 1;
    shadow.far = 1200;
    shadow.updateProjectionMatrix();
    sun.target.position.copy(look);
    sun.position.copy(look).addScaledVector(sunDirection, 500);
  }

  function resize() {
    const width = parent.clientWidth || SCREEN.width;
    const height = parent.clientHeight || (width * SCREEN.height) / SCREEN.width;
    const layout = cityViewport(width, height, options.fillViewport ?? false);
    renderer.setSize(Math.max(1, layout.width), Math.max(1, layout.height), false);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    canvas.style.marginLeft = `${layout.left}px`;
    canvas.style.marginTop = parent.clientHeight ? `${layout.top}px` : "0";
  }
  const resizer = new ResizeObserver(resize);
  resizer.observe(parent);
  resize();

  /** Which drawing faces the viewer: a heading relative to the fixed camera. */
  const facingFor = sceneFacingFor;

  function textureFor(entry: Entry, presenting: boolean) {
    const action = entry.actor.waitingForSignal ? "idle" : entry.actor.action;
    const pose = presenting
      ? presentation?.kind === "welcome"
        ? "wave"
        : action === "sit"
          ? "sit"
          : "idle"
      : action === "turn" || action === "visit"
        ? "idle"
        : action;
    const frame = moving ? Math.floor(entry.actor.elapsed * 4) % 2 : 0;
    return `${illustrationPalette(entry.resident.avatarVersion)}-${presenting ? "front" : entry.facing}-${pose}-${frame}`;
  }

  function removeEntry(id: string, entry: Entry) {
    entry.animated?.source.dispose();
    entry.animated?.texture.dispose();
    residentLayer.remove(entry.group);
    entry.bubble.sprite.material.map?.dispose();
    entry.sprite.material.dispose();
    entry.ghost.material.dispose();
    (entry.pulse.material as THREE.Material).dispose();
    entries.delete(id);
  }

  function animatedFor(resident: PublicResident): Entry["animated"] {
    const source = options.createAnimatedCharacter?.(resident);
    if (!source) return undefined;
    const texture = new THREE.CanvasTexture(source.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { source, texture, version: resident.avatarVersion };
  }

  function sync(addedIds: string[] = []) {
    if (destroyed) return;
    const visible = residents.slice(0, SCENE_RESIDENT_LIMIT);
    const focused = residents.find((resident) => resident.residentId === presentation?.id);
    if (focused && !visible.includes(focused)) visible.push(focused);
    const ids = new Set(visible.map((resident) => resident.residentId));
    for (const [id, entry] of entries)
      if (!ids.has(id)) {
        // Residents who leave float away; with motion off they simply vanish.
        if (moving && entry.leaveAt === 0) entry.leaveAt = now;
        else if (!moving) removeEntry(id, entry);
      }
    for (const [index, resident] of visible.entries()) {
      const existing = entries.get(resident.residentId);
      if (existing) {
        if (existing.resident.avatarVersion !== resident.avatarVersion) {
          existing.animated?.source.dispose();
          existing.animated?.texture.dispose();
          existing.animated = animatedFor(resident);
        }
        existing.resident = resident;
        existing.leaveAt = 0;
        continue;
      }
      const actor = createActor(world, focused === resident ? residents.indexOf(resident) : index);
      const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05 });
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0.04);
      // Seen faintly through buildings, so nobody disappears behind a tower.
      const ghost = new THREE.Sprite(
        new THREE.SpriteMaterial({
          transparent: true,
          opacity: 0.45,
          depthTest: false,
          depthWrite: false,
        }),
      );
      ghost.center.set(0.5, 0.04);
      ghost.renderOrder = 10;
      ghost.userData.residentId = resident.residentId;
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.renderOrder = 5;
      const bubble = textLabel({ background: "#ffffff", color: "#2c3a33", size: 24, wrap: 300 });
      bubble.sprite.center.set(0.5, 0);
      const pulse = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      pulse.renderOrder = 5;
      pulse.visible = false;
      const group = new THREE.Group();
      group.add(ring, pulse, sprite, ghost, bubble.sprite);
      residentLayer.add(group);
      entries.set(resident.residentId, {
        actor,
        resident,
        group,
        sprite,
        ghost,
        ring,
        pulse,
        bubble,
        facing: "front",
        animated: animatedFor(resident),
        hopUntil: 0,
        enterAt: moving && addedIds.includes(resident.residentId) ? now : 0,
        leaveAt: 0,
        welcomeUntil: addedIds.includes(resident.residentId) ? now + 1.8 : 0,
      });
      options.onAction?.(resident.residentId, "idle");
    }
  }

  // —— Input: drag to pan, pinch or wheel to zoom, tap a resident to select ——
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: {
    x: number;
    y: number;
    moved: boolean;
    from: SceneCamera;
    /** Who was under the finger on touch-down; residents keep walking before release. */
    grabbed: string | null;
  } | null = null;
  let pinch: { distance: number; zoom: number } | null = null;
  const toScreen = (event: PointerEvent | WheelEvent) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * SCREEN.width,
      y: ((event.clientY - bounds.top) / bounds.height) * SCREEN.height,
    };
  };
  const hold = () => {
    userHoldUntil = clock + 25;
    tourGlide = null;
  };
  const raycaster = new THREE.Raycaster();
  /** Smallest tap target, in CSS pixels, so a distant or moving resident is still easy to hit. */
  const MIN_TAP_PX = 56;
  const toSceneScreen = (world: THREE.Vector3) => {
    const projected = world.clone().project(camera);
    return {
      x: ((projected.x + 1) / 2) * SCREEN.width,
      y: ((1 - projected.y) / 2) * SCREEN.height,
    };
  };
  function residentTargets(): PickTarget[] {
    camera.updateMatrixWorld();
    const targets: PickTarget[] = [];
    for (const [id, entry] of entries) {
      if (!entry.ghost.visible || entry.leaveAt > 0) continue;
      const { x: sx, y: sy } = entry.ghost.scale;
      if (sx <= 0 || sy <= 0) continue;
      // The sprite is anchored near its feet, standing on the group position.
      const { x, z } = entry.group.position;
      const baseY = entry.group.position.y + entry.ghost.position.y;
      const bottom = toSceneScreen(new THREE.Vector3(x, baseY, z));
      const top = toSceneScreen(new THREE.Vector3(x, baseY + sy, z));
      const height = Math.abs(bottom.y - top.y);
      targets.push({
        id,
        x: bottom.x,
        y: (bottom.y + top.y) / 2,
        width: height * (sx / sy),
        height,
      });
    }
    return targets;
  }
  function residentAt(point: { x: number; y: number }) {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return pickResident(residentTargets(), point, {
      minWidth: (MIN_TAP_PX * SCREEN.width) / bounds.width,
      minHeight: (MIN_TAP_PX * SCREEN.height) / bounds.height,
      // Buildings keep their own taps: the enlarged area only applies on open ground.
      exactOnly: landmarkAt(point) !== null,
    });
  }
  function landmarkAt(point: { x: number; y: number }): Landmark | null {
    raycaster.setFromCamera(
      new THREE.Vector2((point.x / SCREEN.width) * 2 - 1, -(point.y / SCREEN.height) * 2 + 1),
      camera,
    );
    const hit = raycaster.intersectObjects(city.children, false)[0];
    if (!hit?.face) return null;
    const attribute = (hit.object as THREE.Mesh).geometry.getAttribute("cityLandmark");
    const id = attribute?.getX(hit.face.a) ?? 0;
    return LANDMARKS.find((item) => item.id === id) ?? null;
  }
  function onPointerDown(event: PointerEvent) {
    canvas.setPointerCapture(event.pointerId);
    const point = toScreen(event);
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
      if (drag) drag.moved = true;
      return;
    }
    drag = { ...point, moved: false, from: view, grabbed: residentAt(point) };
  }
  function onPointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const point = toScreen(event);
    pointers.set(event.pointerId, point);
    if (presentation) return;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      view = clampCamera({
        ...view,
        zoom: pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance)),
      });
      hold();
      return;
    }
    if (!drag) return;
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 12) return;
    drag.moved = true;
    view = panCamera(drag.from, dx, dy);
    hold();
  }
  function onPointerUp(event: PointerEvent) {
    const point = toScreen(event);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && !pointers.size) {
      // A resident who walked on between touch and release is still the one that was tapped.
      const id = residentAt(point) ?? drag.grabbed;
      const entry = id ? entries.get(id) : undefined;
      if (id && entry) {
        buildingFade.selected.value = 0;
        options.onSelectLandmark?.(null);
        // A quick hop acknowledges the tap before the camera moves.
        if (moving) entry.hopUntil = now + 0.28;
        options.onSelect?.(id);
      } else {
        const landmark = landmarkAt(point);
        buildingFade.selected.value = landmark?.id ?? 0;
        options.onSelectLandmark?.(landmark);
        if (landmark) hold();
        else options.onClearSelection?.();
      }
    }
    if (!pointers.size) drag = null;
  }
  function onWheel(event: WheelEvent) {
    event.preventDefault();
    if (presentation) return;
    view = clampCamera({ ...view, zoom: view.zoom * (event.deltaY > 0 ? 0.9 : 1.1) });
    hold();
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function inView(point: { x: number; y: number }, cameraView: SceneCamera): boolean {
    const screen = project({ ...point, height: groundAt(point.x, point.y) }, cameraView);
    return pointInVisibleCity(
      screen,
      parent.clientWidth || SCREEN.width,
      parent.clientHeight || SCREEN.height,
      options.fillViewport ?? false,
    );
  }

  /** Frame a resident for the automatic tour, using the scene's shared composition rules. */
  function residentView(actor: Actor): SceneCamera {
    return tourCamera({ x: actor.x, y: actor.y, height: groundAt(actor.x, actor.y) });
  }

  function stepTour(seconds: number) {
    if (presentation || selectedId || clock < userHoldUntil || !moving) return;
    if (tourGlide) {
      tourGlide.t = Math.min(1, tourGlide.t + seconds / 4.5);
      view = mix(tourGlide.from, tourGlide.to, ease(tourGlide.t));
      if (tourGlide.t >= 1) tourGlide = null;
      return;
    }
    tourWait -= seconds;
    if (tourWait > 0) return;
    // Participants first: the tour looks at a resident whenever one is on screen, and only
    // falls back to a landmark when the street is empty.
    const present = [...entries.entries()].filter(
      ([, entry]) => !entry.leaveAt && entry.enterAt === 0,
    );
    const guidedIndex = present.length
      ? nextResidentTourIndex(
          present.map(([id]) => id),
          tourResidentId,
        )
      : null;
    const guided = guidedIndex === null ? undefined : present[guidedIndex];
    if (guided) {
      const [guidedId, guidedEntry] = guided;
      tourResidentId = guidedId;
      tourStep = (tourStep + 1) % tour.length;
      tourGlide = { from: view, to: residentView(guidedEntry.actor), t: 0 };
      tourWait = 10;
      return;
    }
    tourResidentId = null;
    const viewFor = (point: { x: number; y: number }) =>
      clampCamera({
        centerX: point.x,
        centerY: point.y,
        height: groundAt(point.x, point.y),
        zoom: DEFAULT_ZOOM,
      });
    const nextVisible = nextVisibleTourIndex(tourStep, tour.length, (index) => {
      const point = tour[index];
      return Boolean(point && present.some(([, entry]) => inView(entry.actor, viewFor(point))));
    });
    tourStep = nextVisible ?? (tourStep + 1) % tour.length;
    tourGlide = {
      from: view,
      to: viewFor(tour[tourStep] ?? start),
      t: 0,
    };
    tourWait = 10;
  }

  function update(seconds: number) {
    updateLighting();
    if (moving) {
      clock += seconds;
      traffic.update(seconds);
    }
    stepTour(seconds);
    // The camera keeps looking at street level as it pans over the slopes of 駿河台.
    if (!tourGlide) {
      const ground = groundAt(view.centerX, view.centerY);
      view = { ...view, height: view.height + (ground - view.height) * Math.min(1, seconds * 3) };
    }
    const focusedEntry = presentation ? entries.get(presentation.id) : undefined;
    const focused = focusedEntry?.leaveAt ? undefined : focusedEntry;
    const placed = (actor: Actor) => ({ ...actor, height: groundAt(actor.x, actor.y) });
    const target = focused
      ? focusCamera(placed(focused.actor), presentation?.kind ?? null, view)
      : view;
    if (glide && moving) {
      const t = Math.min(1, (now - glide.startedAt) / glide.duration);
      shown = mix(glide.from, target, ease(t));
      if (t >= 1) glide = null;
    } else {
      glide = null;
      shown = target;
    }
    placeCamera(shown);
    updateBuildingFade(buildingFade, shown.centerX, shown.centerY, shown.zoom);
    buildingFade.pulse.value = moving ? 0.3 + 0.25 * (1 + Math.sin(now * 4)) : 0.45;
    parent.dataset.cameraZoom = String(Math.round((shown.zoom / DEFAULT_ZOOM) * 100) / 100);
    audioClock += seconds;
    if (audioClock >= 0.1 && audio.isPlaying()) {
      audioClock = 0;
      // With motion off nothing moves, so the street goes quiet and only the music plays.
      const sources = moving ? traffic.soundSources() : { time: clock, signals: [], vehicles: [] };
      audio.update({
        ...sources,
        listener: { x: shown.centerX, y: shown.centerY },
        zoomRatio: shown.zoom / DEFAULT_ZOOM,
      });
    }
    const screenUnit = 1 / shown.zoom;
    const lineIndex = exchange ? Math.floor((now - exchange.startedAt) / 3.5) : -1;
    if (
      exchange &&
      (lineIndex >= exchange.lines.length || !moving || exchange.ids.some((id) => !entries.has(id)))
    ) {
      for (const id of exchange.ids) {
        const entry = entries.get(id);
        if (entry?.actor.action === "talk") entry.actor = commandActor(world, entry.actor, "idle");
      }
      exchange = null;
    }
    let index = 0;
    for (const [id, entry] of entries) {
      const leaving = entry.leaveAt > 0;
      const leaveT = leaving ? (now - entry.leaveAt) / LEAVE_SECONDS : 0;
      if (leaveT >= 1) {
        removeEntry(id, entry);
        continue;
      }
      const arriveT = entry.enterAt > 0 ? Math.min(1, (now - entry.enterAt) / ARRIVE_SECONDS) : 1;
      if (arriveT >= 1) entry.enterAt = 0;
      const previousAction = entry.actor.action;
      const presenting = id === presentation?.id && !leaving;
      // Keep the underlying route position. Camera focus never relocates the original sprite.
      const conversing = Boolean(exchange?.ids.includes(id));
      entry.actor = pendingPair?.includes(id)
        ? entry.actor
        : conversing
          ? {
              ...entry.actor,
              action: "talk",
              elapsed: entry.actor.elapsed + (moving ? seconds : 0),
            }
          : presenting
            ? { ...entry.actor, elapsed: entry.actor.elapsed + (moving ? seconds : 0) }
            : leaving
              ? entry.actor
              : stepActor(world, entry.actor, seconds, moving, {
                  signals: trafficData.pedestrianSignals,
                  time: clock,
                });
      if (
        moving &&
        !leaving &&
        id !== selectedId &&
        !presenting &&
        entry.actor.action === "idle" &&
        entry.actor.elapsed > 2.6 + index * 0.7
      )
        entry.actor = commandActor(world, entry.actor, "walk", (point) => inView(point, shown));
      if (previousAction !== entry.actor.action) options.onAction?.(id, entry.actor.action);
      entry.facing = facingFor(
        entry.actor.heading,
        entry.actor.action === "walk" && !entry.actor.waitingForSignal,
      );
      const ground = groundAt(entry.actor.x, entry.actor.y);
      const size = RESIDENT_HEIGHT;
      const hopBase =
        entry.hopUntil > now ? Math.sin(((entry.hopUntil - now) / 0.28) * Math.PI) * 0.45 : 0;
      // Arrival: drops in from above and bounces; departure: floats up, shrinks and fades.
      const drop = arriveT < 1 ? (1 - easeOutBounce(arriveT)) * size * 2.4 : 0;
      const lift = leaving ? ease(leaveT) * size * 1.3 : 0;
      const hop = hopBase + drop + lift;
      const fade = leaving ? 1 - ease(leaveT) : Math.min(1, arriveT * 4);
      const pop = leaving ? 1 - 0.55 * ease(leaveT) : 0.6 + 0.4 * Math.min(1, arriveT * 3);
      // Nudged towards the camera along its own axis: the same spot on screen, but the
      // upright drawing no longer cuts into the wall the resident stands beside.
      entry.group.position.copy(toThree(entry.actor.x, entry.actor.y, ground)).add(nearer);
      if (entry.animated) {
        const direction = presenting ? "front" : entry.facing;
        entry.animated.source.advance(
          animationFor(entry.actor.action, direction, presenting),
          direction,
          moving ? seconds : 0,
        );
        entry.animated.texture.needsUpdate = true;
      }
      const texture = entry.animated?.texture ?? characters.get(textureFor(entry, presenting));
      for (const sprite of [entry.sprite, entry.ghost]) {
        if (texture && sprite.material.map !== texture) {
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }
        sprite.scale.set(
          size * characterAspect(entry.animated?.source.canvas) * pop,
          size * pop,
          1,
        );
        sprite.position.y = hop;
        // Destinations are placed on the public footway, so arrivals stay visible.
        sprite.visible = true;
      }
      entry.sprite.material.opacity = fade;
      entry.ghost.material.opacity = 0.45 * fade;
      if (leaving) entry.ghost.visible = false;
      // A ripple on the ground marks the spot where someone lands or lifts off.
      const rippleT = leaving ? leaveT : arriveT > 0.55 ? (arriveT - 0.55) / 0.45 : -1;
      entry.pulse.visible = rippleT >= 0 && rippleT < 1;
      if (entry.pulse.visible) {
        entry.pulse.scale.setScalar((size / RESIDENT_HEIGHT) * (0.8 + rippleT * 2.6));
        entry.pulse.position.y = 0.05;
        const pulse = entry.pulse.material as THREE.MeshBasicMaterial;
        pulse.color.set(leaving ? 0xbcd3c6 : 0xf2c45a);
        pulse.opacity = 0.75 * (1 - rippleT);
      }
      // The resident being shown is drawn over walls and trees, never behind them.
      if (entry.sprite.material.depthTest === presenting) {
        entry.sprite.material.depthTest = !presenting;
        entry.sprite.renderOrder = presenting ? 15 : 0;
      }
      entry.ring.visible = (id === selectedId || presenting) && !leaving;
      entry.ring.scale.setScalar(size / RESIDENT_HEIGHT);
      entry.ring.position.y = 0.06;
      const currentLine = exchange?.lines[lineIndex];
      const speech = conversing
        ? currentLine?.residentId === id
          ? `${exchange?.source === "PRESET" ? "定型" : "AI"}：${currentLine.text}`
          : ""
        : entry.actor.action === "talk"
          ? preset
          : now < entry.welcomeUntil
            ? "ようこそ！"
            : "";
      if (entry.bubble.sprite.userData.text !== speech) {
        entry.bubble.sprite.userData.text = speech;
        if (speech) entry.bubble.set(speech);
      }
      const bubbleHeight = 13 * ((entry.bubble.sprite.userData.lines as number) || 1) * screenUnit;
      entry.bubble.sprite.scale.set(bubbleHeight * entry.bubble.aspect, bubbleHeight, 1);
      entry.bubble.sprite.position.y = size + 0.3 + hop;
      entry.bubble.sprite.visible = !presenting && !leaving && Boolean(speech);
      if (presenting && presentation) {
        const projected = projectResident(
          { ...entry.actor, height: ground },
          shown,
          RESIDENT_METRES_PER_UNIT,
        );
        const frame: ScenePresentationFrame = {
          ...presentation,
          x: Math.round(projected.x * 100) / 100,
          y: Math.round(projected.y * 100) / 100,
          scale: Math.round(projected.scale * 100) / 100,
          worldX: Math.round(entry.actor.x * 100) / 100,
          worldY: Math.round(entry.actor.y * 100) / 100,
          cameraZoom: Math.round((shown.zoom / DEFAULT_ZOOM) * 100) / 100,
          pose:
            presentation.kind === "welcome"
              ? "wave"
              : entry.actor.action === "sit"
                ? "sit"
                : "idle",
          frame: moving ? Math.floor(entry.actor.elapsed * 4) % 2 : 0,
          activity: describeActivity(world, entry.actor),
        };
        const signature = JSON.stringify(frame);
        if (signature !== lastFrame) {
          lastFrame = signature;
          options.onPresentationFrame?.(frame);
        }
      }
      index++;
    }
    if (
      moving &&
      options.onEncounter &&
      !exchange &&
      !dialoguePending &&
      now >= nextEncounter &&
      !presentation
    ) {
      nextEncounter = now + 2;
      const pair = findEncounter(
        [...entries.values()].map((entry) => ({
          id: entry.resident.residentId,
          actor: entry.actor,
          personality: entry.resident.personalityLabel,
        })),
        selectedId,
        groundAt,
        now,
        lastSpoke,
      );
      if (pair) {
        const ids = pair;
        const first = entries.get(ids[0]);
        const second = entries.get(ids[1]);
        if (!first || !second) return;
        const place = encounterPlace(first.actor, second.actor, world.pois);
        for (const entry of [first, second]) {
          // Individual cooldowns remain bounded and never shorten the global request interval.
          lastSpoke.set(entry.resident.residentId, now);
        }
        nextEncounter = now + 45;
        dialoguePending = true;
        pendingPair = ids;
        void options
          .onEncounter(ids, place)
          .then((result) => {
            if (
              !destroyed &&
              moving &&
              !presentation &&
              !ids.includes(selectedId ?? "") &&
              result?.safety === "PASSED" &&
              (result.source === "LIVE" || result.source === "PRESET") &&
              ids.every((id) => entries.has(id)) &&
              result.lines.every((line) => ids.includes(line.residentId))
            )
              exchange = { ids, lines: result.lines, source: result.source, startedAt: now };
          })
          .catch(() => {})
          .finally(() => {
            dialoguePending = false;
            pendingPair = null;
          });
      }
    }
  }

  let raf = 0;
  let previous = performance.now();
  let pending = 0;
  // Adaptive quality: a device that cannot keep up first loses shadows, then resolution and
  // frame rate, so the page around the city stays responsive.
  let frameBudget = FRAME_SECONDS;
  let quality = 3;
  let lastRender = previous;
  let slow = 0;
  let rendered = 0;
  function degrade() {
    quality--;
    slow = 0;
    if (quality === 2) {
      renderer.shadowMap.enabled = false;
      sun.castShadow = false;
      scene.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.Material | undefined;
        if (material && !Array.isArray(material)) material.needsUpdate = true;
      });
    } else if (quality === 1) {
      renderer.setPixelRatio(1);
      resize();
      frameBudget = 1 / 10;
    } else frameBudget = 1 / 5;
  }
  // Without a GPU (a software rasteriser), start in the lightest mode straight away.
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "";
  if (/SwiftShader|llvmpipe|softpipe|Software/i.test(gpu)) while (quality > 0) degrade();
  function loop(time: number) {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    pending += Math.min(0.1, (time - previous) / 1000);
    previous = time;
    if (pending < frameBudget) return;
    const seconds = pending;
    pending = 0;
    now += seconds;
    // Ignore the first frames, which compile shaders.
    if (++rendered > 20 && quality > 0) {
      slow = time - lastRender > frameBudget * 3000 ? slow + 1 : Math.max(0, slow - 1);
      if (slow >= 8) degrade();
    }
    lastRender = time;
    update(seconds);
    renderer.render(scene, camera);
  }
  sync();
  update(0);
  renderer.render(scene, camera);
  options.onReady?.();
  raf = requestAnimationFrame(loop);

  return {
    setResidents(next, addedIds = []) {
      residents = next;
      sync(addedIds);
    },
    /**
     * Re-attempt the animated artwork for residents that are still on the fallback drawing.
     * Called after a Spine bundle finishes loading, so a character that appeared before its
     * assets were ready picks them up without the scene being rebuilt.
     */
    refreshCharacters() {
      if (destroyed) return;
      for (const entry of entries.values()) {
        if (entry.animated || entry.leaveAt) continue;
        const animated = animatedFor(entry.resident);
        if (!animated) continue;
        entry.animated = animated;
      }
    },
    rebuildCharacters(avatarVersions) {
      if (destroyed) return;
      for (const entry of entries.values()) {
        if (entry.leaveAt || !avatarVersions.includes(entry.resident.avatarVersion)) continue;
        const animated = animatedFor(entry.resident);
        if (!animated) continue;
        entry.animated?.source.dispose();
        entry.animated?.texture.dispose();
        entry.animated = animated;
      }
    },
    setMotionEnabled(enabled) {
      moving = enabled;
    },
    async setSoundEnabled(enabled) {
      if (destroyed) return;
      if (enabled) await audio.start();
      else audio.stop();
    },
    setSoundVolume(volume) {
      audio.setVolume(volume);
    },
    select(id) {
      selectedId = id;
    },
    selectLandmark(id) {
      buildingFade.selected.value = id ?? 0;
    },
    present(next) {
      if (presentation?.id === next?.id && presentation?.kind === next?.kind) return;
      presentation = next;
      lastFrame = "";
      sync();
      const entry = next ? entries.get(next.id) : undefined;
      // A resident inside a shop steps out to the door to be shown.
      if (entry?.actor.action === "visit") entry.actor = commandActor(world, entry.actor, "idle");
      glide = { from: shown, startedAt: now, duration: 0.7 };
      if (!next || !entry) options.onPresentationFrame?.(null);
    },
    act(id, action) {
      const entry = entries.get(id);
      if (!entry || destroyed) return;
      if (action === "talk")
        for (const [otherId, other] of entries)
          if (otherId !== id && other.actor.action === "talk") {
            other.actor = commandActor(world, other.actor, "idle");
            options.onAction?.(otherId, "idle");
          }
      entry.actor = commandActor(world, entry.actor, action, (point) => inView(point, shown));
      options.onAction?.(id, entry.actor.action);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      audio.destroy();
      cancelAnimationFrame(raf);
      resizer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh || (object as THREE.Sprite).isSprite) {
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) material?.dispose();
        }
      });
      for (const texture of characters.values()) texture.dispose();
      for (const entry of entries.values()) {
        entry.animated?.source.dispose();
        entry.animated?.texture.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      entries.clear();
    },
  };
}

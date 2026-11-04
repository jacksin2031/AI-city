import type { DialoguePlace, DialogueResult, PublicResident } from "@ai-city/contracts";
import * as THREE from "three";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { autumnLighting } from "./autumn";
import { encounterPlace, findEncounter, postDialogueAction } from "./encounter";
import {
  clampCamera,
  DEFAULT_ZOOM,
  focusCamera,
  panCamera,
  projectResident,
  RESIDENT_HEIGHT,
  RESIDENT_METRES_PER_UNIT,
  SCREEN,
  type SceneCamera,
  type ScenePresentation,
  type ScenePresentationFrame,
  VIEW,
} from "./focus";
import { characterDataUrl, illustrationPalette } from "./illustrations";
import { type MaterialSpecs, mergeCity, updateBuildingFade } from "./materials";
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
import { cityViewport } from "./viewport";
import { type CityPlaces, createWorld, heightAt, parseGrid, tour, type World } from "./world";

export type IllustratedCity = {
  setResidents(residents: PublicResident[], addedIds?: string[]): void;
  setMotionEnabled(enabled: boolean): void;
  select(id: string | null): void;
  act(id: string, action: CityAction): void;
  present(presentation: ScenePresentation | null): void;
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
  welcomeUntil: number;
  hopUntil: number;
  facing: Direction;
};

const directions: Direction[] = ["front", "left", "back", "right"];
const poses = ["idle", "walk", "talk", "wave", "sit"] as const;
const versions = { sora: "fixture-sora-v1", haru: "fixture-haru-v1", guest: "placeholder-guest" };
const preset = "こんにちは。広場でひと休みしよう！";
const font = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
/** Character textures are rasterised at twice their 96×128 artwork size. */
const CHARACTER_PIXELS = 2;
const FRAME_SECONDS = 1 / 30;

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
    onEncounter?: (ids: [string, string], place: DialoguePlace) => Promise<DialogueResult | null>;
    onAction?: (id: string, action: CityAction) => void;
    onReady?: () => void;
    onPresentationFrame?: (frame: ScenePresentationFrame | null) => void;
    onClearSelection?: () => void;
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const buildingFade = { center: { value: new THREE.Vector2() }, zoom: { value: 0 } };
  const city = mergeCity(cityModel.scene, specs, buildingFade);
  scene.add(city);
  const vehicles = vehicleModel.scene;
  vehicles.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  scene.add(vehicles);
  const traffic = createTraffic(trafficData, vehicles, city, metroRailHeightOffset);

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
    actions: DialogueResult["actions"];
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
  function facingFor(heading: number, walking: boolean): Direction {
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const right = fx * VIEW.right.x + fy * VIEW.right.y;
    const length = Math.hypot(VIEW.toCamera.x, VIEW.toCamera.y);
    const toward = (fx * VIEW.toCamera.x + fy * VIEW.toCamera.y) / length;
    // Walkers show their profile unless they head almost straight at or away from the viewer.
    if (Math.abs(right) > (walking ? 0.3 : 0.7)) return right > 0 ? "right" : "left";
    return toward > 0 ? "front" : "back";
  }

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

  function sync(addedIds: string[] = []) {
    if (destroyed) return;
    const visible = residents.slice(0, 20);
    const focused = residents.find((resident) => resident.residentId === presentation?.id);
    if (focused && !visible.includes(focused)) visible.push(focused);
    const ids = new Set(visible.map((resident) => resident.residentId));
    for (const [id, entry] of entries)
      if (!ids.has(id)) {
        residentLayer.remove(entry.group);
        entry.bubble.sprite.material.map?.dispose();
        entries.delete(id);
      }
    for (const [index, resident] of visible.entries()) {
      const existing = entries.get(resident.residentId);
      if (existing) {
        existing.resident = resident;
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
      const group = new THREE.Group();
      group.add(ring, sprite, ghost, bubble.sprite);
      residentLayer.add(group);
      entries.set(resident.residentId, {
        actor,
        resident,
        group,
        sprite,
        ghost,
        ring,
        bubble,
        facing: "front",
        hopUntil: 0,
        welcomeUntil: addedIds.includes(resident.residentId) ? now + 1.8 : 0,
      });
      options.onAction?.(resident.residentId, "idle");
    }
  }

  // —— Input: drag to pan, pinch or wheel to zoom, tap a resident to select ——
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; moved: boolean; from: SceneCamera } | null = null;
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
  function residentAt(point: { x: number; y: number }) {
    raycaster.setFromCamera(
      new THREE.Vector2((point.x / SCREEN.width) * 2 - 1, -(point.y / SCREEN.height) * 2 + 1),
      camera,
    );
    const ghosts = [...entries.values()].filter((entry) => entry.ghost.visible).map((e) => e.ghost);
    const hit = raycaster.intersectObjects(ghosts, false)[0];
    return hit ? (hit.object.userData.residentId as string) : null;
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
    drag = { ...point, moved: false, from: view };
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
      const id = residentAt(point);
      const entry = id ? entries.get(id) : undefined;
      if (id && entry) {
        // A quick hop acknowledges the tap before the camera moves.
        if (moving) entry.hopUntil = now + 0.28;
        options.onSelect?.(id);
      } else options.onClearSelection?.();
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
    tourStep = (tourStep + 1) % tour.length;
    const next = tour[tourStep] ?? start;
    tourGlide = {
      from: view,
      to: clampCamera({
        centerX: next.x,
        centerY: next.y,
        height: groundAt(next.x, next.y),
        zoom: DEFAULT_ZOOM,
      }),
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
    const focused = presentation ? entries.get(presentation.id) : undefined;
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
    parent.dataset.cameraZoom = String(Math.round((shown.zoom / DEFAULT_ZOOM) * 100) / 100);
    const screenUnit = 1 / shown.zoom;
    const lineIndex = exchange ? Math.floor((now - exchange.startedAt) / 3.5) : -1;
    if (
      exchange &&
      (lineIndex >= exchange.lines.length || !moving || exchange.ids.some((id) => !entries.has(id)))
    ) {
      for (const id of exchange.ids) {
        const entry = entries.get(id);
        if (entry?.actor.action === "talk") {
          const choice = postDialogueAction(
            id,
            exchange.actions,
            lineIndex >= exchange.lines.length && moving,
            presentation?.id ?? null,
          );
          entry.actor = commandActor(world, entry.actor, choice);
        }
      }
      exchange = null;
    }
    let index = 0;
    for (const [id, entry] of entries) {
      const previousAction = entry.actor.action;
      const presenting = id === presentation?.id;
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
            : stepActor(world, entry.actor, seconds, moving, {
                signals: trafficData.pedestrianSignals,
                time: clock,
              });
      if (
        moving &&
        id !== selectedId &&
        !presenting &&
        entry.actor.action === "idle" &&
        entry.actor.elapsed > 2.6 + index * 0.7
      )
        entry.actor = commandActor(world, entry.actor, "walk");
      if (previousAction !== entry.actor.action) options.onAction?.(id, entry.actor.action);
      entry.facing = facingFor(
        entry.actor.heading,
        entry.actor.action === "walk" && !entry.actor.waitingForSignal,
      );
      const ground = groundAt(entry.actor.x, entry.actor.y);
      const inside = entry.actor.action === "visit" && !presenting;
      const size = RESIDENT_HEIGHT;
      const hop =
        entry.hopUntil > now ? Math.sin(((entry.hopUntil - now) / 0.28) * Math.PI) * 0.45 : 0;
      // Nudged towards the camera along its own axis: the same spot on screen, but the
      // upright drawing no longer cuts into the wall the resident stands beside.
      entry.group.position.copy(toThree(entry.actor.x, entry.actor.y, ground)).add(nearer);
      const texture = characters.get(textureFor(entry, presenting));
      for (const sprite of [entry.sprite, entry.ghost]) {
        if (texture && sprite.material.map !== texture) {
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }
        sprite.scale.set(size * 0.75, size, 1);
        sprite.position.y = hop;
        sprite.visible = !inside;
      }
      // The resident being shown is drawn over walls and trees, never behind them.
      if (entry.sprite.material.depthTest === presenting) {
        entry.sprite.material.depthTest = !presenting;
        entry.sprite.renderOrder = presenting ? 15 : 0;
      }
      entry.ring.visible = (id === selectedId || presenting) && !inside;
      entry.ring.scale.setScalar(size / RESIDENT_HEIGHT);
      entry.ring.position.y = 0.06;
      const currentLine = exchange?.lines[lineIndex];
      const speech = conversing
        ? currentLine?.residentId === id
          ? `AI：${currentLine.text}`
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
      entry.bubble.sprite.visible = !presenting && !inside && Boolean(speech);
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
              result.source === "LIVE" &&
              ids.every((id) => entries.has(id)) &&
              result.lines.every((line) => ids.includes(line.residentId))
            )
              exchange = { ids, lines: result.lines, actions: result.actions, startedAt: now };
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
    setMotionEnabled(enabled) {
      moving = enabled;
    },
    select(id) {
      selectedId = id;
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
      entry.actor = commandActor(world, entry.actor, action);
      options.onAction?.(id, entry.actor.action);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
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
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      entries.clear();
    },
  };
}

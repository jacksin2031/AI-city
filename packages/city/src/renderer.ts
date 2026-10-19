import type { PublicResident } from "@ai-city/contracts";
import type { GameObjects, Scene } from "phaser";
import { characterDataUrl, illustrationPalette, townIllustration } from "./illustrations";
import {
  type Actor,
  type CityAction,
  commandActor,
  createActor,
  type Direction,
  stepActor,
} from "./simulation";

export type IllustratedCity = {
  setResidents(residents: PublicResident[], addedIds?: string[]): void;
  setMotionEnabled(enabled: boolean): void;
  select(id: string | null): void;
  act(id: string, action: CityAction): void;
  destroy(): void;
};
type Entry = {
  actor: Actor;
  resident: PublicResident;
  container: GameObjects.Container;
  sprite: GameObjects.Image;
  ring: GameObjects.Ellipse;
  label: GameObjects.Text;
  bubble: GameObjects.Text;
  welcomeUntil: number;
};
const directions: Direction[] = ["front", "left", "back", "right"];
const poses = ["idle", "walk", "talk", "wave"] as const;
const versions = { sora: "fixture-sora-v1", haru: "fixture-haru-v1", guest: "placeholder-guest" };
const preset = "こんにちは。広場でひと休みしよう！";

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Placeholder illustration could not be loaded"));
    image.src = source;
  });
}

/** Browser only: local SVG artwork and existing public residents; no model/asset HTTP calls. */
export async function createDevelopmentCity(
  parent: HTMLElement,
  options: {
    residents?: PublicResident[];
    motionEnabled?: boolean;
    signal?: AbortSignal;
    onSelect?: (id: string) => void;
    onAction?: (id: string, action: CityAction) => void;
    onReady?: () => void;
  } = {},
): Promise<IllustratedCity> {
  const Phaser = await import("phaser");
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const textures: { key: string; source: string }[] = [
    {
      key: "town",
      source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(townIllustration)}`,
    },
  ];
  for (const [palette, version] of Object.entries(versions))
    for (const direction of directions)
      for (const pose of poses)
        for (const frame of [0, 1]) {
          textures.push({
            key: `${palette}-${direction}-${pose}-${frame}`,
            source: characterDataUrl(version, direction, pose, frame),
          });
        }
  const images = await Promise.all(
    textures.map(async (texture) => ({ key: texture.key, image: await loadImage(texture.source) })),
  );
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  let residents = options.residents ?? [];
  let moving = options.motionEnabled ?? true;
  let selectedId: string | null = null;
  let scene: Scene | undefined;
  let destroyed = false;
  const entries = new Map<string, Entry>();

  function textureFor(entry: Entry) {
    const pose = entry.actor.action === "turn" ? "idle" : entry.actor.action;
    const frame = moving ? Math.floor(entry.actor.elapsed * 4) % 2 : 0;
    return `${illustrationPalette(entry.resident.avatarVersion)}-${entry.actor.direction}-${pose}-${frame}`;
  }
  function sync(addedIds: string[] = []) {
    if (!scene || destroyed) return;
    const currentScene = scene;
    const visible = residents.slice(0, 20);
    const ids = new Set(visible.map((resident) => resident.residentId));
    for (const [id, entry] of entries)
      if (!ids.has(id)) {
        currentScene.tweens.killTweensOf(entry.sprite);
        entry.container.destroy(true);
        entries.delete(id);
      }
    for (const [index, resident] of visible.entries()) {
      const existing = entries.get(resident.residentId);
      const nickname =
        [...resident.nickname].slice(0, 12).join("") +
        ([...resident.nickname].length > 12 ? "…" : "");
      if (existing) {
        existing.resident = resident;
        existing.label.setText(nickname);
        continue;
      }
      const actor = createActor(index);
      const ring = currentScene.add
        .ellipse(0, -6, 58, 18, 0xe7bd67, 0.65)
        .setVisible(resident.residentId === selectedId);
      const sprite = currentScene.add
        .image(0, 0, `${illustrationPalette(resident.avatarVersion)}-front-idle-0`)
        .setOrigin(0.5, 1)
        .setScale(0.9)
        .setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => options.onSelect?.(resident.residentId));
      const label = currentScene.add
        .text(0, 7, nickname, {
          fontFamily: '"Noto Sans JP", sans-serif',
          fontSize: "16px",
          color: "#243b30",
          backgroundColor: "#ffffff",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5, 0);
      const bubble = currentScene.add
        .text(0, -126, "", {
          fontFamily: '"Noto Sans JP", sans-serif',
          fontSize: "17px",
          color: "#243b30",
          backgroundColor: "#ffffff",
          padding: { x: 12, y: 9 },
          wordWrap: { width: 200 },
          align: "center",
        })
        .setOrigin(0.5, 1)
        .setVisible(false);
      const container = currentScene.add
        .container(actor.x, actor.y, [ring, sprite, label, bubble])
        .setDepth(actor.y);
      entries.set(resident.residentId, {
        actor,
        resident,
        container,
        sprite,
        ring,
        label,
        bubble,
        welcomeUntil: addedIds.includes(resident.residentId) ? currentScene.time.now + 1800 : 0,
      });
      options.onAction?.(resident.residentId, "idle");
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 600,
    backgroundColor: "#e2eedc",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 30 },
    scene: {
      create(this: Scene) {
        scene = this;
        for (const item of images) this.textures.addImage(item.key, item.image);
        this.add.image(0, 0, "town").setOrigin(0);
        for (const [x, y, text] of [
          [167, 176, "カフェ"],
          [472, 166, "図書室"],
          [794, 188, "花や"],
        ] as const) {
          this.add
            .text(x, y, text, {
              fontFamily: '"Noto Sans JP", sans-serif',
              fontSize: "22px",
              color: "#34443c",
              backgroundColor: "#fff8e6",
              padding: { x: 10, y: 3 },
            })
            .setOrigin(0.5);
        }
        sync();
        options.onReady?.();
      },
      update(this: Scene, _time: number, delta: number) {
        if (destroyed) return;
        let index = 0;
        for (const [id, entry] of entries) {
          const previousAction = entry.actor.action;
          entry.actor = stepActor(entry.actor, Math.min(delta, 60) / 1000, moving);
          if (
            moving &&
            id !== selectedId &&
            entry.actor.action === "idle" &&
            entry.actor.elapsed > 2.6 + index * 0.7
          )
            entry.actor = commandActor(entry.actor, "walk");
          if (previousAction !== entry.actor.action) options.onAction?.(id, entry.actor.action);
          entry.container.setPosition(entry.actor.x, entry.actor.y).setDepth(entry.actor.y);
          const texture = textureFor(entry);
          if (entry.sprite.texture.key !== texture) entry.sprite.setTexture(texture);
          entry.ring.setVisible(id === selectedId);
          const text =
            entry.actor.action === "talk"
              ? preset
              : this.time.now < entry.welcomeUntil
                ? "ようこそ！"
                : "";
          entry.bubble.setText(text).setVisible(Boolean(text));
          index++;
        }
      },
    },
  });
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
    act(id, action) {
      const entry = entries.get(id);
      if (!entry || destroyed) return;
      if (action === "talk")
        for (const [otherId, other] of entries)
          if (otherId !== id && other.actor.action === "talk") {
            other.actor = commandActor(other.actor, "idle");
            options.onAction?.(otherId, "idle");
          }
      entry.actor = commandActor(entry.actor, action);
      options.onAction?.(id, action);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      game.destroy(true);
      game.canvas?.remove();
      entries.clear();
    },
  };
}

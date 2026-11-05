import type { PublicResident } from "@ai-city/contracts";
import { developmentResidents } from "@ai-city/contracts/fixtures";

export function getDevelopmentResidents(): PublicResident[] {
  return structuredClone(developmentResidents);
}

const residentColors = [0x467a65, 0x6b73a1, 0xb57c35];

/** Browser-only integration sample; these shapes are not generated avatars. */
export async function createDevelopmentCity(parent: HTMLElement) {
  const { default: Phaser } = await import("phaser");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 800,
    height: 360,
    backgroundColor: "#edf2e8",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      create() {
        // Backdrop: simple blocks for scale, not real map tiles.
        (
          [
            [70, 90, 110],
            [180, 70, 150],
            [600, 80, 130],
            [710, 70, 100],
          ] as const
        ).forEach(([x, w, h]) => {
          this.add.rectangle(x, 230 - h / 2, w, h, 0xd5e1d6).setStrokeStyle(2, 0xc4d3c6);
        });
        this.add.rectangle(400, 270, 800, 180, 0xdce5d2);
        this.add.rectangle(400, 250, 800, 56, 0xe9ede2);

        getDevelopmentResidents().forEach((resident, index) => {
          const x = 200 + index * 300;
          const y = 240;
          const color = residentColors[index % residentColors.length];
          const shadow = this.add.ellipse(x, y + 26, 44, 10, 0x1d3129, 0.15);
          const dot = this.add.circle(x, y, 24, color).setStrokeStyle(3, 0xffffff);
          const label = this.add
            .text(x, y - 46, resident.nickname, {
              color: "#20342c",
              backgroundColor: "#ffffff",
              padding: { x: 10, y: 4 },
              fontSize: "18px",
              fontFamily: "sans-serif",
            })
            .setOrigin(0.5);
          if (reduceMotion) return;
          this.tweens.add({
            targets: [dot, label, shadow],
            x: x + 80,
            duration: 2400 + index * 400,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
          this.tweens.add({
            targets: dot,
            y: y - 6,
            duration: 300,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
        });
      },
    },
  });
}

export type LiveResident = { residentId: string; nickname: string; avatarUrl: string };

export type LiveCity = {
  sync(residents: LiveResident[]): void;
  say(residentId: string, text: string, durationMs?: number): void;
  destroy(): void;
};

/** Tablet city: shows real resident sprites (one image per resident) and speech bubbles. */
export async function createLiveCity(parent: HTMLElement): Promise<LiveCity> {
  const { default: Phaser } = await import("phaser");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  type Entry = {
    container: import("phaser").GameObjects.Container;
    bubble: import("phaser").GameObjects.Text;
    timer?: import("phaser").Time.TimerEvent;
    hideAt?: import("phaser").Time.TimerEvent;
  };
  const entries = new Map<string, Entry>();
  let scene!: import("phaser").Scene;
  const ready = new Promise<void>((resolve) => {
    new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: 1280,
      height: 720,
      backgroundColor: "#edf2e8",
      pixelArt: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: {
        create() {
          scene = this;
          this.add.rectangle(640, 560, 1280, 320, 0xdce5d2);
          this.add.rectangle(640, 520, 1280, 110, 0xe9ede2);
          resolve();
        },
      },
    });
  });
  await ready;
  const game = scene.game;

  const wander = (entry: Entry) => {
    if (reduceMotion) return;
    entry.timer?.remove();
    entry.timer = scene.time.addEvent({
      delay: 3000 + Math.random() * 3000,
      loop: true,
      callback: () => {
        const x = 120 + Math.random() * 1040;
        const y = 470 + Math.random() * 90;
        scene.tweens.add({
          targets: entry.container,
          x,
          y,
          duration: 2500,
          ease: "Sine.easeInOut",
        });
      },
    });
  };

  function add(resident: LiveResident) {
    const key = `avatar-${resident.residentId}`;
    const x = 160 + Math.random() * 960;
    const y = 470 + Math.random() * 90;
    const container = scene.add.container(x, y).setDepth(y);
    const label = scene.add
      .text(0, -190, resident.nickname, {
        color: "#20342c",
        backgroundColor: "#ffffff",
        padding: { x: 10, y: 4 },
        fontSize: "22px",
        fontFamily: "sans-serif",
      })
      .setOrigin(0.5);
    const bubble = scene.add
      .text(0, -240, "", {
        color: "#20342c",
        backgroundColor: "#fffbe8",
        padding: { x: 12, y: 8 },
        fontSize: "22px",
        fontFamily: "sans-serif",
        wordWrap: { width: 360 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    container.add([scene.add.ellipse(0, 4, 90, 18, 0x1d3129, 0.18), label, bubble]);
    const entry: Entry = { container, bubble };
    entries.set(resident.residentId, entry);
    const place = () => {
      const image = scene.add.image(0, 0, key).setOrigin(0.5, 1);
      image.setScale(170 / image.height);
      container.add(image);
      container.sendToBack(image);
      wander(entry);
    };
    if (scene.textures.exists(key)) place();
    else {
      scene.load.image(key, resident.avatarUrl);
      scene.load.once(`filecomplete-image-${key}`, place);
      scene.load.start();
    }
  }

  return {
    sync(residents) {
      const live = new Set(residents.map((r) => r.residentId));
      for (const resident of residents) if (!entries.has(resident.residentId)) add(resident);
      for (const [id, entry] of entries) {
        if (live.has(id)) continue;
        entry.timer?.remove();
        entry.container.destroy();
        entries.delete(id);
      }
    },
    say(residentId, text, durationMs = 4500) {
      const entry = entries.get(residentId);
      if (!entry) return;
      entry.hideAt?.remove();
      entry.bubble.setText(text).setVisible(true);
      entry.container.setDepth(1000);
      entry.hideAt = scene.time.delayedCall(durationMs, () => entry.bubble.setVisible(false));
    },
    destroy() {
      game.destroy(true);
    },
  };
}

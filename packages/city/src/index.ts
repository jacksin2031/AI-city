import type { PublicResident } from "@ai-city/contracts";
import { developmentResidents } from "@ai-city/contracts/fixtures";

export function getDevelopmentResidents(): PublicResident[] {
  return structuredClone(developmentResidents);
}

/** Browser-only integration sample; these shapes are not generated avatars. */
export async function createDevelopmentCity(parent: HTMLElement) {
  const { default: Phaser } = await import("phaser");
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 800,
    height: 360,
    backgroundColor: "#edf2e8",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      create() {
        this.add.rectangle(400, 180, 760, 90, 0xd8dfd2);
        getDevelopmentResidents().forEach((resident, index) => {
          const x = 200 + index * 300;
          const dot = this.add.circle(x, 170, 24, index === 0 ? 0x467a65 : 0x6b73a1);
          const label = this.add
            .text(x, 215, resident.nickname, {
              color: "#20342c",
              fontSize: "22px",
              fontFamily: "sans-serif",
            })
            .setOrigin(0.5);
          this.tweens.add({
            targets: [dot, label],
            x: x + 60,
            duration: 1800,
            yoyo: true,
            repeat: -1,
          });
        });
      },
    },
  });
}

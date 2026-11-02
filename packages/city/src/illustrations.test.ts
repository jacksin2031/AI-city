import { describe, expect, it } from "vitest";
import { characterIllustration, head } from "./illustrations";

describe("visible welcome gesture", () => {
  it.each(
    ["fixture-sora-v1", "fixture-haru-v1", "placeholder-guest"].flatMap((version) =>
      [0, 1].map((frame) => ({ version, frame })),
    ),
  )(
    "keeps the waving palm outside the head and inside the artwork: $version frame $frame",
    ({ version, frame }) => {
      const svg = characterIllustration(version, "front", "wave", frame);
      // The waving arm is the last rotated arm group in the figure.
      const arms = [
        ...svg.matchAll(
          /<g transform="rotate\(([-\d.]+) ([\d.]+) ([\d.]+)\)">.*?<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g,
        ),
      ];
      const arm = arms.at(-1);
      if (!arm) throw new Error("Wave arm geometry missing");
      const [angle, pivotX, pivotY, cx, cy, radius] = arm.slice(1, 7).map(Number) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const radians = (angle * Math.PI) / 180;
      const x = pivotX + (cx - pivotX) * Math.cos(radians) - (cy - pivotY) * Math.sin(radians);
      const y = pivotY + (cx - pivotX) * Math.sin(radians) + (cy - pivotY) * Math.cos(radians);
      // Outside the head ellipse (drawn `offsetY` lower), with room for the palm itself.
      const dx = (x - head.cx) / (head.rx + radius);
      const dy = (y - head.cy - head.offsetY) / (head.ry + radius);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(1);
      expect(x - radius).toBeGreaterThanOrEqual(0);
      expect(x + radius).toBeLessThanOrEqual(96);
      expect(y - radius).toBeGreaterThanOrEqual(0);
    },
  );
});

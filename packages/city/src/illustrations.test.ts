import { describe, expect, it } from "vitest";
import { characterIllustration } from "./illustrations";

describe("visible welcome gesture", () => {
  it.each(
    ["fixture-sora-v1", "fixture-haru-v1", "placeholder-guest"].flatMap((version) =>
      [0, 1].map((frame) => ({ version, frame })),
    ),
  )(
    "keeps the waving palm outside the occluding head and inside the artwork: $version frame $frame",
    ({ version, frame }) => {
      const svg = characterIllustration(version, "front", "wave", frame);
      const arm = svg.match(
        /<g transform="rotate\(([-\d.]+) (\d+) (\d+)\)">.*?<circle cx="(\d+)" cy="(\d+)" r="(\d+)"/,
      );
      if (!arm) throw new Error("Wave arm geometry missing");
      const angle = Number(arm[1]);
      const pivotX = Number(arm[2]);
      const pivotY = Number(arm[3]);
      const cx = Number(arm[4]);
      const cy = Number(arm[5]);
      const radius = Number(arm[6]);
      const radians = (angle * Math.PI) / 180;
      const x = pivotX + (cx - pivotX) * Math.cos(radians) - (cy - pivotY) * Math.sin(radians);
      const y = pivotY + (cx - pivotX) * Math.sin(radians) + (cy - pivotY) * Math.cos(radians);
      // The head (48,36,r25) is drawn later and would completely hide the old palm.
      expect(Math.hypot(x - 48, y - 36)).toBeGreaterThan(25 + radius + 4);
      expect(x - radius - 1.25).toBeGreaterThanOrEqual(0);
      expect(x + radius + 1.25).toBeLessThanOrEqual(96);
      expect(y - radius - 1.25).toBeGreaterThanOrEqual(0);
      expect(y + radius).toBeLessThan(58);
    },
  );
});

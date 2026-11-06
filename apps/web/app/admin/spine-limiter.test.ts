import { describe, expect, it } from "vitest";
import { createLimiter } from "./spine-limiter";

describe("createLimiter", () => {
  it("never runs more than the limit at once and finishes every job", async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return i;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("keeps going after a failing job", async () => {
    const run = createLimiter(1);
    await expect(run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(run(async () => 7)).resolves.toBe(7);
  });
});

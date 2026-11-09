import { describe, expect, it } from "vitest";
import { initialWatch, observeVersion } from "./version-watch";

describe("observeVersion", () => {
  it("remembers the first answer without reloading", () => {
    const first = observeVersion(initialWatch, "rev-1");
    expect(first.reload).toBe(false);
    expect(first.state.known).toBe("rev-1");
  });
  it("stays quiet while the version is unchanged", () => {
    let state = observeVersion(initialWatch, "rev-1").state;
    for (let i = 0; i < 5; i++) {
      const next = observeVersion(state, "rev-1");
      expect(next.reload).toBe(false);
      state = next.state;
    }
  });
  it("reloads only after the new version repeats", () => {
    const known = observeVersion(initialWatch, "rev-1").state;
    const once = observeVersion(known, "rev-2");
    expect(once.reload).toBe(false);
    expect(observeVersion(once.state, "rev-2").reload).toBe(true);
  });
  it("ignores a single stray answer from an old instance during a rollout", () => {
    const known = observeVersion(initialWatch, "rev-2").state;
    const stray = observeVersion(known, "rev-1");
    expect(stray.reload).toBe(false);
    const back = observeVersion(stray.state, "rev-2");
    expect(back.state.pending).toBeNull();
    expect(observeVersion(back.state, "rev-1").reload).toBe(false);
  });
});

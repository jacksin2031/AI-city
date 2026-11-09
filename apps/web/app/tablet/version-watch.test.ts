import { describe, expect, it } from "vitest";
import { initialWatch, observeVersion, watchForRenderedVersion } from "./version-watch";

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

describe("server-rendered tablet revision", () => {
  it("identifies a stale page even when its FIRST poll reaches the new deployment", () => {
    const oldPage = watchForRenderedVersion("ai-city-web-00041-old");
    expect(oldPage.known).toBe("ai-city-web-00041-old");
    const firstPoll = observeVersion(oldPage, "ai-city-web-00042-new");
    expect(firstPoll.reload).toBe(false);
    expect(firstPoll.state.pending).toBe("ai-city-web-00042-new");
    expect(observeVersion(firstPoll.state, "ai-city-web-00042-new").reload).toBe(true);
  });

  it("does not reload an already-current page", () => {
    const initial = watchForRenderedVersion("ai-city-web-00042-new");
    expect(observeVersion(initial, "ai-city-web-00042-new").reload).toBe(false);
  });

  it("uses first-poll baselining for local builds without a Cloud Run revision", () => {
    expect(watchForRenderedVersion("dev")).toEqual(initialWatch);
    expect(watchForRenderedVersion("")).toEqual(initialWatch);
  });
});

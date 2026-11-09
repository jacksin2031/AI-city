import type { ParticipationView } from "@ai-city/contracts/development";
import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifySample,
  classifySpine,
  closeExistingParticipation,
  phaseSummary,
  pickExisting,
  probeExisting,
  restartWarning,
  SpineRequestFailure,
} from "./existing-participation";

function sampleView(
  state: string,
  publication: "PRIVATE" | "PUBLISHED" | "REMOVED" = "PRIVATE",
): ParticipationView {
  return { job: { jobId: "j", state }, publication } as unknown as ParticipationView;
}

afterEach(() => vi.unstubAllGlobals());

describe("existing participation classification", () => {
  it("surfaces published, preparing, review and failed sample participations", () => {
    expect(classifySample(sampleView("READY", "PUBLISHED"))).toEqual({
      kind: "sample",
      phase: "published",
    });
    expect(classifySample(sampleView("READY"))?.phase).toBe("review");
    expect(classifySample(sampleView("PREPARING"))?.phase).toBe("preparing");
    expect(classifySample(sampleView("FAILED"))?.phase).toBe("attention");
  });
  it("does not block on a removed, cancelled or absent sample participation", () => {
    expect(classifySample(null)).toBeNull();
    expect(classifySample(sampleView("READY", "REMOVED"))).toBeNull();
    expect(classifySample(sampleView("CANCELLED"))).toBeNull();
  });
  it("classifies Spine jobs and ignores a withdrawn one", () => {
    expect(classifySpine({ task: "t", state: "PUBLISHED" })?.phase).toBe("published");
    expect(classifySpine({ task: "t", state: "RUNNING" })?.phase).toBe("preparing");
    expect(classifySpine({ task: "t", state: "REQUIRES_REVIEW" })?.phase).toBe("attention");
    expect(classifySpine({ task: "t", state: "WITHDRAWN" })).toBeNull();
    expect(classifySpine(null)).toBeNull();
  });
  it("prefers the published character when both flows hold something", () => {
    const sample = classifySample(sampleView("PREPARING"));
    const spine = classifySpine({ task: "t", state: "PUBLISHED" });
    expect(pickExisting(sample, spine)).toBe(spine);
    expect(pickExisting(sample, classifySpine({ task: "t", state: "QUEUED" }))).toBe(sample);
    expect(pickExisting(null, null)).toBeNull();
  });
  it("never puts a name or card in the guard wording", () => {
    for (const phase of ["published", "review", "attention", "preparing"] as const) {
      expect(phaseSummary({ kind: "spine", phase })).not.toMatch(/さん|ニックネーム/);
    }
    expect(restartWarning({ kind: "spine", phase: "published" })).toContain("写真の消去");
    expect(restartWarning({ kind: "sample", phase: "published" })).not.toContain("写真");
  });
});

describe("probing both current-session APIs", () => {
  const apiError = (status: number) => new DevelopmentApiError("X", status, "x");
  it("finds a participation held by the other flow", async () => {
    const probe = await probeExisting({
      sample: async () => null,
      spine: async () => ({ task: "t", state: "PUBLISHED" }),
    });
    expect(probe.existing).toEqual({ kind: "spine", phase: "published" });
    expect(probe.unreadable).toBe(false);
  });
  it("treats no session and an unconfigured Spine endpoint as nothing there", async () => {
    const probe = await probeExisting({
      sample: async () => {
        throw apiError(401);
      },
      spine: async () => {
        throw new SpineRequestFailure(404, "none");
      },
    });
    expect(probe).toMatchObject({ existing: null, unreadable: false });
  });
  it("does not treat a first-visit photo-flow 401 as a broken connection", async () => {
    class PhotoRequestFailure extends Error {
      constructor(public status: number) {
        super("SESSION_REQUIRED");
      }
    }
    const probe = await probeExisting({
      sample: async () => null,
      spine: async () => {
        throw new PhotoRequestFailure(401);
      },
    });
    expect(probe).toMatchObject({ existing: null, unreadable: false });
  });
  it("reports unreadable when a flow fails for any other reason but still shows the other", async () => {
    const probe = await probeExisting({
      sample: async () => sampleView("READY", "PUBLISHED"),
      spine: async () => {
        throw new SpineRequestFailure(500, "boom");
      },
    });
    expect(probe.unreadable).toBe(true);
    expect(probe.existing?.kind).toBe("sample");
  });
});

describe("ending the earlier participation", () => {
  it("withdraws a live Spine job before the session is closed", async () => {
    const order: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        order.push(`fetch ${url}`);
        return new Response(
          JSON.stringify({
            mode: "LOCAL_PRIVATE_TEST",
            state: "WITHDRAWN",
            photoCleanup: "PENDING",
          }),
          { status: 200 },
        );
      }),
    );
    await closeExistingParticipation({ spine: { task: "abc", state: "PUBLISHED" } }, async () => {
      order.push("close");
    });
    expect(order).toEqual(["fetch /api/visitor/spine/jobs/abc/withdraw", "close"]);
  });
  it("only closes the session for a sample or already withdrawn participation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const close = vi.fn(async () => {});
    await closeExistingParticipation({ spine: null }, close);
    await closeExistingParticipation({ spine: { task: "abc", state: "WITHDRAWN" } }, close);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(2);
  });
  it("keeps the session open when the withdrawal fails, so the choice can be retried", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "X", message: "x" } }), { status: 500 }),
      ),
    );
    const close = vi.fn(async () => {});
    await expect(
      closeExistingParticipation({ spine: { task: "abc", state: "RUNNING" } }, close),
    ).rejects.toBeInstanceOf(SpineRequestFailure);
    expect(close).not.toHaveBeenCalled();
  });
});

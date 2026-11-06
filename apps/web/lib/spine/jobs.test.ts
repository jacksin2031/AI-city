import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { makeCloudSpineJob, makeSpineJob, SpineJobs } from "./jobs";

const owner = "a".repeat(64);
const other = "b".repeat(64);
const consent = {
  processing: true,
  automaticPublication: true,
  version: 1,
  recordedAt: "2026-11-05T00:00:00.000Z",
} as const;
const visitorInput = {
  requestId: "ordinary-1",
  eventId: "fixture-event" as const,
  nickname: "テストそら",
  sampleId: "aoi" as const,
  answers: null,
  scenario: "SUCCESS" as const,
};
const visitorConsent = {
  avatarPublicConsent: true as const,
  consentVersion: 2 as const,
  publicationScope: "HOSTED_PREVIEW" as const,
  fields: { nickname: true, personality: true, interests: true },
};
const spineConsent = {
  processing: true,
  externalModelUpload: true,
  automaticPublication: true,
  version: 2,
} as const;

function candidate() {
  const bytes = (s: string) => Buffer.from(s);
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  const assets = {
    "skeleton.json": bytes("{}"),
    "skeleton.atlas": bytes("atlas"),
    "orientation-policy.json": bytes("{}"),
    "page.png": bytes("png"),
  };
  const manifest = bytes(
    JSON.stringify({
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, hash(data)])),
    }),
  );
  const base = "/avatars/person/v1/";
  return {
    descriptor: {
      runtime: "4.3" as const,
      skeleton: `${base}skeleton.json`,
      atlas: `${base}skeleton.atlas`,
      pages: [`${base}page.png`],
      orientationPolicy: `${base}orientation-policy.json`,
      buildManifest: `${base}build-manifest.json`,
      sha256: hash(manifest),
    },
    manifest,
    assets,
    reviewApproved: true,
  };
}

describe("Spine job stateSince", () => {
  it("stamps creation and every state change with the injected clock", async () => {
    let now = 1_000;
    const store = new MemoryVisitorStore();
    const jobs = new SpineJobs(store, () => now);
    await jobs.create("task1", owner, "c".repeat(64), consent);
    expect((await jobs.get("task1", owner)).stateSince).toBe(1_000);
    now = 2_000;
    expect((await jobs.claim("task1", "worker1")).stateSince).toBe(2_000);
    now = 3_000;
    expect((await jobs.markUnknown("task1", "worker1")).stateSince).toBe(3_000);
    now = 4_000;
    expect((await jobs.withdraw("task1", owner)).stateSince).toBe(4_000);
  });
  it("stamps new jobs at creation and still parses records without it", async () => {
    const store = new MemoryVisitorStore();
    const jobs = new SpineJobs(store, () => 7_000);
    const record = makeSpineJob(owner, "c".repeat(64), consent, undefined, 5_000);
    expect(record.stateSince).toBe(5_000);
    const { stateSince: _drop, ...legacy } = record;
    await store.run(async (tx) => tx.set("jobs/spine-old", legacy));
    expect((await jobs.get("old", owner)).state).toBe("QUEUED");
  });
});

describe("Spine jobs transaction boundary", () => {
  it("binds job to owner and prevents duplicate claims", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await expect(jobs.get("task1", other)).rejects.toThrow("NOT_FOUND");
    const claims = await Promise.allSettled([
      jobs.claim("task1", "worker1"),
      jobs.claim("task1", "worker2"),
    ]);
    expect(claims.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await jobs.get("task1", owner)).state).toBe("RUNNING");
  });
  it("withdraws atomically, rejecting late worker results", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await jobs.withdraw("task1", owner);
    await expect(jobs.markUnknown("task1", "worker1")).rejects.toThrow();
    expect((await jobs.get("task1", owner)).state).toBe("WITHDRAWN");
  });
  it("records unknown results without granting another attempt", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await expect(jobs.markUnknown("task1", "worker2")).rejects.toThrow();
    await jobs.markUnknown("task1", "worker1");
    await expect(jobs.claim("task1", "worker2")).rejects.toThrow();
    expect((await jobs.get("task1", owner)).state).toBe("UNKNOWN");
  });
  it("binds a tool flow to the claimed task and exact photo without allowing replacement", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    const flow = `flow-${"d".repeat(32)}`;
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await expect(jobs.bindToolFlow("task1", "worker1", flow, "e".repeat(64))).rejects.toThrow(
      "TOOL_FLOW_MISMATCH",
    );
    await expect(jobs.bindToolFlow("task1", "worker2", flow, "c".repeat(64))).rejects.toThrow(
      "WORKER_MISMATCH",
    );
    await jobs.bindToolFlow("task1", "worker1", flow, "c".repeat(64));
    await jobs.bindToolFlow("task1", "worker1", flow, "c".repeat(64));
    await expect(
      jobs.bindToolFlow("task1", "worker1", `flow-${"f".repeat(32)}`, "c".repeat(64)),
    ).rejects.toThrow("TOOL_FLOW_MISMATCH");
    await jobs.withdraw("task1", owner);
    await expect(jobs.bindToolFlow("task1", "worker1", flow, "c".repeat(64))).rejects.toThrow();
    expect((await jobs.get("task1", owner)).toolFlow).toBe(flow);
  });
  it("rejects missing consent and preserves existing tasks", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await expect(
      jobs.create("task1", owner, "c".repeat(64), { ...consent, processing: false }),
    ).rejects.toThrow();
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await expect(jobs.create("task1", other, "d".repeat(64), consent)).rejects.toThrow();
    expect((await jobs.get("task1", owner)).state).toBe("QUEUED");
  });
  it("does not publish unchecked or damaged candidates, and can publish after review", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    const output = candidate();
    await expect(
      jobs.publish("task1", "worker1", { ...output, reviewApproved: false }),
    ).rejects.toThrow("BUNDLE_NOT_APPROVED");
    await expect(
      jobs.publish("task1", "worker1", {
        ...output,
        assets: { ...output.assets, "page.png": Buffer.from("changed") },
      }),
    ).rejects.toThrow("BUNDLE_NOT_APPROVED");
    await jobs.markReview("task1", "worker1");
    expect(await jobs.publishedBundle("task1")).toBeNull();
    await expect(jobs.publish("task1", "other", output)).rejects.toThrow("WORKER_MISMATCH");
    await jobs.publish("task1", "worker1", output);
    expect(await jobs.publishedBundle("task1")).toEqual(output.descriptor);
    await jobs.withdraw("task1", owner);
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
  it("prevents a late result from becoming public after withdrawal", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await jobs.withdraw("task1", owner);
    await expect(jobs.publish("task1", "worker1", candidate())).rejects.toThrow();
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
  it("withdrawal wins against a concurrent publication transaction", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await Promise.allSettled([
      jobs.publish("task1", "worker1", candidate()),
      jobs.withdraw("task1", owner),
    ]);
    expect((await jobs.get("task1", owner)).state).toBe("WITHDRAWN");
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
  it("counts each owner once across ordinary and Spine publication, including after a counter reset", async () => {
    let now = Date.parse("2026-11-05T00:00:00Z");
    const store = new MemoryVisitorStore();
    const visitor = new VisitorService(store, () => now);
    const jobs = new SpineJobs(store, () => now);
    const newSession = async () =>
      visitor.createSession(undefined, (await visitor.createInvitation()).code);

    const ordinaryFirst = await newSession();
    const firstJob = await visitor.createJob(ordinaryFirst.token, visitorInput);
    now += 1200;
    const ready = await visitor.getJob(ordinaryFirst.token, firstJob.job.jobId);
    await visitor.confirm(ordinaryFirst.token, ready.job.jobId, visitorConsent);
    expect(await visitor.joinedTotal()).toBe(1);

    const firstSpineTask = "spine-11111111-1111-4111-8111-111111111111";
    await visitor.createSpineJob(ordinaryFirst.token, firstSpineTask, "d".repeat(64), spineConsent);
    await jobs.claim(firstSpineTask, "worker1");
    await jobs.publish(firstSpineTask, "worker1", candidate());
    expect(await visitor.joinedTotal()).toBe(1);

    await visitor.resetJoinedTotal();
    expect(await visitor.joinedTotal()).toBe(0);
    expect((await visitor.snapshot()).residents).toHaveLength(2);

    const spineFirst = await newSession();
    const secondSpineTask = "spine-22222222-2222-4222-8222-222222222222";
    await visitor.createSpineJob(spineFirst.token, secondSpineTask, "e".repeat(64), spineConsent);
    await jobs.claim(secondSpineTask, "worker2");
    await jobs.publish(secondSpineTask, "worker2", candidate());
    expect(await visitor.joinedTotal()).toBe(1);

    const secondJob = await visitor.createJob(spineFirst.token, {
      ...visitorInput,
      requestId: "ordinary-after-spine",
    });
    now += 1200;
    const secondReady = await visitor.getJob(spineFirst.token, secondJob.job.jobId);
    await visitor.confirm(spineFirst.token, secondReady.job.jobId, visitorConsent);
    expect(await visitor.joinedTotal()).toBe(1);
    expect((await visitor.snapshot()).residents).toHaveLength(4);
  });
});

describe("Spine admin requeue and cancel", () => {
  const cloudTask = "spine-12345678-1234-4123-8123-123456789abc";
  const live = {
    processing: true,
    externalModelUpload: true,
    automaticPublication: true,
    version: 2,
    recordedAt: "2026-11-05T00:00:00.000Z",
  } as const;
  async function failedCloudJob(now = () => 9_000) {
    const store = new MemoryVisitorStore();
    const jobs = new SpineJobs(store, now);
    await store.run(async (tx) => {
      tx.set(
        `jobs/spine-${cloudTask}`,
        makeCloudSpineJob(owner, "c".repeat(64), live, 99_999_999, "5", 1_000),
      );
      tx.set("meta/spine-live-budget", { maxTasks: 5, reserved: 2 });
      tx.set(`requests/spine-live-${cloudTask}`, { task: cloudTask, reserved: true });
    });
    await store.run(async (tx) => {
      const raw = await tx.get(`jobs/spine-${cloudTask}`);
      tx.set(`jobs/spine-${cloudTask}`, {
        ...raw,
        state: "FAILED",
        worker: "worker1",
        toolFlow: `flow-${"d".repeat(32)}`,
        liveIntent: true,
      });
    });
    return { store, jobs };
  }
  it("requeues a failed cloud task without touching the budget counter", async () => {
    const { store, jobs } = await failedCloudJob(() => 9_000);
    await jobs.requeue(cloudTask);
    const record = await store.run((tx) => tx.get(`jobs/spine-${cloudTask}`));
    expect(record).toMatchObject({
      state: "QUEUED",
      worker: null,
      toolFlow: null,
      liveIntent: false,
      stateSince: 9_000,
    });
    expect(await store.run((tx) => tx.get(`requests/spine-live-${cloudTask}`))).toBeNull();
    expect(await store.run((tx) => tx.get("meta/spine-live-budget"))).toEqual({
      maxTasks: 5,
      reserved: 2,
    });
  });
  it("lets only one of two concurrent requeues win", async () => {
    const { jobs } = await failedCloudJob();
    const results = await Promise.allSettled([jobs.requeue(cloudTask), jobs.requeue(cloudTask)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as Error).message).toBe("INVALID_TRANSITION");
  });
  it("refuses published and non-cloud tasks", async () => {
    const { jobs, store } = await failedCloudJob();
    await store.run(async (tx) => {
      const raw = await tx.get(`jobs/spine-${cloudTask}`);
      tx.set(`jobs/spine-${cloudTask}`, { ...raw, state: "PUBLISHED", bundle: undefined });
    });
    await expect(jobs.requeue(cloudTask)).rejects.toThrow();
    const local = new SpineJobs(new MemoryVisitorStore());
    await local.create("task1", owner, "c".repeat(64), consent);
    await local.claim("task1", "worker1");
    await local.markFailed("task1", "worker1");
    await expect(local.requeue("task1")).rejects.toThrow("NOT_CLOUD_PHOTO");
    expect((await local.get("task1", owner)).state).toBe("FAILED");
  });
  it("withdraws on behalf of the stored owner", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore(), () => 5_000);
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await jobs.adminWithdraw("task1");
    const record = await jobs.get("task1", owner);
    expect(record).toMatchObject({
      state: "WITHDRAWN",
      cleanupPending: true,
      toolCleanupPending: true,
      photoSha256: null,
      stateSince: 5_000,
    });
    await expect(jobs.adminWithdraw("missing")).rejects.toThrow("NOT_FOUND");
  });
});

import { randomUUID } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { submitCloudPhoto } from "../../apps/web/lib/spine/cloud-photo-intake";
import { SpineJobs } from "../../apps/web/lib/spine/jobs";
import { FirestoreVisitorStore } from "../../apps/web/lib/visitor/firestore";
import { VisitorService } from "../../apps/web/lib/visitor/service";

let db: Firestore;
const namespaces: string[] = [];
function store() {
  const namespace = `test-${randomUUID()}`;
  namespaces.push(namespace);
  return { namespace, store: new FirestoreVisitorStore(db, namespace) };
}
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080")
    throw new Error("Requires the loopback demo emulator, never cloud");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/ai-city-emulator-must-not-use-adc.json";
  db = new Firestore({ projectId: "demo-ai-city", preferRest: false });
});
afterAll(async () => {
  for (const namespace of namespaces)
    await db.recursiveDelete(db.doc(`visitorExhibitions/${namespace}`));
  await db.terminate();
});
const input = {
  eventId: "fixture-event" as const,
  requestId: "persistent-1",
  nickname: "架空の住民",
  sampleId: "aoi" as const,
  answers: [1, 1, 1, 1, 1, 1] as [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
  scenario: "SUCCESS" as const,
};
const consent = {
  avatarPublicConsent: true as const,
  consentVersion: 2 as const,
  publicationScope: "HOSTED_PREVIEW" as const,
  fields: { nickname: true, personality: false, interests: false },
};

describe("real Firestore transaction persistence", () => {
  it("queues a verified synthetic cloud photo through persistent reservations", async () => {
    const { namespace, store: repository } = store();
    const service = new VisitorService(repository);
    const { token } = await service.createOpenSession();
    const photo = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==",
      "base64",
    );
    let saved = new Uint8Array();
    const storage = {
      write: async (_task: string, bytes: Uint8Array) => {
        saved = Uint8Array.from(bytes);
        return "123";
      },
      read: async (_task: string, _max: number, generation?: string) =>
        generation === "123" ? saved : null,
    };
    const result = await submitCloudPhoto(service, storage, token, photo, {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    });
    const snapshot = await db
      .doc(`visitorExhibitions/${namespace}/jobs/spine-${result.task}`)
      .get();
    expect(snapshot.data()).toMatchObject({
      state: "QUEUED",
      photoStorage: "CLOUD_PRIVATE",
      photoGeneration: "123",
    });
  });
  it("allows only one concurrent cloud photo reservation per visitor", async () => {
    const { namespace, store: repository } = store();
    const service = new VisitorService(repository);
    const second = new VisitorService(new FirestoreVisitorStore(db, namespace));
    const { token } = await service.createOpenSession();
    const consent = {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    };
    const result = await Promise.allSettled([
      service.reserveCloudPhotoUpload(token, `spine-${randomUUID()}`, "a".repeat(64), consent),
      second.reserveCloudPhotoUpload(token, `spine-${randomUUID()}`, "b".repeat(64), consent),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((item) => item.status === "rejected")).toHaveLength(1);
    const rejected = result.find((item) => item.status === "rejected");
    if (rejected?.status !== "rejected") throw new Error("expected rejected admission");
    expect(rejected.reason.code).toBe("ACTIVE_JOB_EXISTS");
  });
  it("serializes cloud completion and cancellation across independent service instances", async () => {
    const { namespace, store: repository } = store();
    const first = new VisitorService(repository);
    const second = new VisitorService(new FirestoreVisitorStore(db, namespace));
    const { token } = await first.createOpenSession();
    const task = `spine-${randomUUID()}`;
    const consent = {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    };
    await first.reserveCloudPhotoUpload(token, task, "a".repeat(64), consent);
    await first.beginCloudPhotoUpload(token, task);
    const [completed, cancelled] = await Promise.allSettled([
      first.completeCloudPhotoUpload(token, task, "a".repeat(64), "123"),
      second.cancelCloudPhotoUpload(token, task),
    ]);
    expect(completed.status === "fulfilled").not.toBe(cancelled.status === "fulfilled");
    const snapshot = await db.doc(`visitorExhibitions/${namespace}/jobs/spine-${task}`).get();
    expect(snapshot.exists).toBe(completed.status === "fulfilled");
  });
  it("serializes orphan cleanup against simultaneous admission", async () => {
    const { namespace, store: repository } = store();
    const service = new VisitorService(repository);
    const jobs = new SpineJobs(new FirestoreVisitorStore(db, namespace));
    const { token } = await service.createOpenSession();
    const [cleanup, admission] = await Promise.allSettled([
      jobs.reserveOrphanCleanup("race"),
      service.createSpineJob(token, "race", "a".repeat(64), {
        processing: true,
        externalModelUpload: true,
        automaticPublication: true,
        version: 2,
      }),
    ]);
    expect(cleanup.status).toBe("fulfilled");
    if (cleanup.status !== "fulfilled") throw new Error("reservation failed");
    expect(cleanup.value).toBe(admission.status === "rejected");
    if (admission.status === "rejected") expect(admission.reason.code).toBe("ACTIVE_JOB_EXISTS");
  });
  it("preserves simultaneous focus requests across independent clients and service restart", async () => {
    const { namespace, store: repository } = store();
    let now = Date.now();
    const first = new VisitorService(repository, () => now);
    const otherClient = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const second = new VisitorService(
        new FirestoreVisitorStore(otherClient, namespace),
        () => now,
      );
      async function publish(name: string) {
        const session = await first.createSession(undefined, (await first.createInvitation()).code);
        const job = await first.createJob(session.token, {
          ...input,
          requestId: name,
          nickname: name,
        });
        now += 1200;
        await first.getJob(session.token, job.job.jobId);
        await first.confirm(session.token, job.job.jobId, consent);
        return session.token;
      }
      const a = await publish("first");
      const b = await publish("second");
      const idA = randomUUID();
      const idB = randomUUID();
      await Promise.all([first.requestFocus(a, idA), second.requestFocus(b, idB)]);
      const restarted = new VisitorService(new FirestoreVisitorStore(db, namespace), () => now);
      const firstRequest = await restarted.nextFocus();
      expect([idA, idB]).toContain(firstRequest?.requestId);
      if (!firstRequest) throw new Error("Missing first focus request");
      await restarted.ackFocus(firstRequest.requestId);
      const secondRequest = await restarted.nextFocus();
      expect(secondRequest?.requestId).toBe(firstRequest?.requestId === idA ? idB : idA);
      if (!secondRequest) throw new Error("Missing second focus request");
      await second.ackFocus(secondRequest.requestId);
      expect(await first.nextFocus()).toBeNull();
    } finally {
      await otherClient.terminate();
    }
  });
  it("atomically bounds code-free admission across SDK clients and preserves invited-mode metadata", async () => {
    const { namespace, store: repository } = store();
    const first = new VisitorService(repository);
    const otherClient = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const second = new VisitorService(new FirestoreVisitorStore(otherClient, namespace));
      for (let i = 0; i < 11; i++) await first.createOpenSession();
      const results = await Promise.allSettled([
        first.createOpenSession(),
        second.createOpenSession(),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r) => r.status === "rejected");
      expect(failed?.status === "rejected" ? failed.reason : null).toMatchObject({
        code: "RATE_LIMITED",
        status: 429,
      });
      expect(
        (await db.doc(`visitorExhibitions/${namespace}/meta/open-admission`).get()).get("count"),
      ).toBe(12);
      expect((await db.collection(`visitorExhibitions/${namespace}/sessions`).get()).size).toBe(12);
      expect(
        (await db.doc(`visitorExhibitions/${namespace}/meta/state`).get()).get("openAdmission"),
      ).toBeUndefined();
    } finally {
      await otherClient.terminate();
    }
  });
  it("redeems one invitation only once across independent Firestore clients", async () => {
    const { namespace, store: repository } = store();
    const first = new VisitorService(repository);
    const otherClient = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const second = new VisitorService(new FirestoreVisitorStore(otherClient, namespace));
      const invitation = await first.createInvitation();
      const results = await Promise.allSettled([
        first.createSession(undefined, invitation.code),
        second.createSession(undefined, invitation.code),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((result) => result.status === "rejected");
      expect(failed?.status === "rejected" ? failed.reason : null).toMatchObject({
        code: "INVITATION_REQUIRED",
        status: 401,
      });
      const sessions = await db.collection(`visitorExhibitions/${namespace}/sessions`).get();
      expect(sessions.size).toBe(1);
    } finally {
      await otherClient.terminate();
    }
  });
  it("commits read-your-writes atomically and rolls back failed callbacks", async () => {
    const { store: repository } = store();
    await repository.run(async (tx) => {
      tx.set("meta/state", { count: 1 });
      expect(await tx.get("meta/state")).toEqual({ count: 1 });
    });
    await expect(
      repository.run(async (tx) => {
        tx.set("meta/state", { count: 2 });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await repository.run((tx) => tx.get("meta/state"))).toEqual({ count: 1 });
    await expect(
      repository.run(async (tx) => {
        tx.set("meta/../../other", {});
      }),
    ).rejects.toThrow();
  });
  it("recovers visitor, job, consent and public snapshot through a new service and SDK client", async () => {
    const { namespace, store: repository } = store();
    let now = Date.parse("2026-10-19T00:00:00Z");
    const original = new VisitorService(repository, () => now);
    const a = await original.createSession(undefined, (await original.createInvitation()).code);
    const b = await original.createSession(undefined, (await original.createInvitation()).code);
    const created = await original.createJob(a.token, input);
    now += 1200;
    await original.getJob(a.token, created.job.jobId);
    const otherClient = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const restored = new VisitorService(
        new FirestoreVisitorStore(otherClient, namespace),
        () => now,
      );
      expect((await restored.current(a.token))?.job.state).toBe("READY");
      await expect(restored.getJob(b.token, created.job.jobId)).rejects.toMatchObject({
        status: 404,
      });
      await Promise.all([
        restored.confirm(a.token, created.job.jobId, consent),
        original.confirm(a.token, created.job.jobId, consent),
      ]);
      const snapshot = await restored.snapshot();
      expect(snapshot.residents).toHaveLength(1);
      expect(snapshot.residents[0]).toMatchObject({
        nickname: "架空の住民",
        personalityLabel: "非公開",
        interests: [],
      });
      expect(JSON.stringify(snapshot)).not.toMatch(/answers|ownerDigest|token|recordedAt/);
      expect((await original.snapshot()).streamId).toBe(snapshot.streamId);
      const documents = await db.getAll(db.doc(`visitorExhibitions/${namespace}/meta/state`));
      const jobs = await db.collection(`visitorExhibitions/${namespace}/jobs`).get();
      const sessions = await db.collection(`visitorExhibitions/${namespace}/sessions`).get();
      expect(
        JSON.stringify([...documents, ...jobs.docs, ...sessions.docs].map((d) => d.data())),
      ).not.toContain(a.token);
      await restored.remove(a.token, created.job.jobId);
      await expect(original.confirm(a.token, created.job.jobId, consent)).rejects.toMatchObject({
        status: 409,
      });
      expect((await original.snapshot()).residents).toHaveLength(0);
      await restored.closeSession(a.token);
      await expect(original.current(a.token)).rejects.toMatchObject({ status: 401 });
    } finally {
      await otherClient.terminate();
    }
  });
  it("rejects conflicting concurrent consent rather than changing public permissions", async () => {
    const { store: repository } = store();
    let now = Date.now();
    const service = new VisitorService(repository, () => now);
    const { token } = await service.createSession(
      undefined,
      (await service.createInvitation()).code,
    );
    const job = await service.createJob(token, input);
    now += 1200;
    await service.getJob(token, job.job.jobId);
    const results = await Promise.allSettled([
      service.confirm(token, job.job.jobId, consent),
      service.confirm(token, job.job.jobId, {
        ...consent,
        fields: { nickname: false, personality: false, interests: false },
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await service.snapshot()).residents).toHaveLength(1);
  });
});

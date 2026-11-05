import { describe, expect, it } from "vitest";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const consent = {
  avatarPublicConsent: true as const,
  consentVersion: 2 as const,
  publicationScope: "HOSTED_PREVIEW" as const,
  fields: { nickname: true, personality: false, interests: false },
};

describe("reliable visitor focus requests", () => {
  it("retains concurrent requests in order and acknowledges only the selected request", async () => {
    let now = 100000;
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store, () => now);
    async function visitor(name: string) {
      const session = await service.createSession(
        undefined,
        (await service.createInvitation()).code,
      );
      const job = await service.createJob(session.token, {
        eventId: "fixture-event",
        requestId: `job-${name}`,
        nickname: name,
        sampleId: "sora",
        answers: null,
        scenario: "SUCCESS",
      });
      now += 1200;
      await service.getJob(session.token, job.job.jobId);
      const published = await service.confirm(session.token, job.job.jobId, consent);
      return { token: session.token, residentId: published.resident?.residentId };
    }
    const first = await visitor("first");
    const second = await visitor("second");
    const id1 = "11111111-1111-4111-8111-111111111111";
    const id2 = "22222222-2222-4222-8222-222222222222";
    const [one, two] = await Promise.all([
      service.requestFocus(first.token, id1),
      service.requestFocus(second.token, id2),
    ]);
    expect(one.status).toBe("PENDING");
    expect(two.status).toBe("PENDING");
    expect((await service.requestFocus(first.token, id1)).requestId).toBe(id1);
    await expect(service.focusStatus(second.token, id1)).rejects.toMatchObject({ status: 404 });
    await expect(service.requestFocus(second.token, id1)).rejects.toMatchObject({ status: 409 });
    const restarted = new VisitorService(store, () => now);
    expect(await restarted.nextFocus()).toMatchObject({
      requestId: id1,
      residentId: first.residentId,
    });
    await restarted.ackFocus(id1);
    await restarted.ackFocus(id1);
    expect((await service.focusStatus(first.token, id1)).status).toBe("APPLIED");
    expect(await service.nextFocus()).toMatchObject({
      requestId: id2,
      residentId: second.residentId,
    });
    await service.ackFocus(id2);
    expect(await service.nextFocus()).toBeNull();
  });
  it("expires requests and does not display or acknowledge withdrawn residents", async () => {
    let now = 100000;
    const service = new VisitorService(new MemoryVisitorStore(), () => now);
    const session = await service.createSession(undefined, (await service.createInvitation()).code);
    const job = await service.createJob(session.token, {
      eventId: "fixture-event",
      requestId: "job-one",
      nickname: "架空",
      sampleId: "sora",
      answers: null,
      scenario: "SUCCESS",
    });
    now += 1200;
    await service.getJob(session.token, job.job.jobId);
    await service.confirm(session.token, job.job.jobId, consent);
    const id = "33333333-3333-4333-8333-333333333333";
    await service.requestFocus(session.token, id);
    now += 60_001;
    expect((await service.focusStatus(session.token, id)).status).toBe("EXPIRED");
    expect(await service.nextFocus()).toBeNull();
    await expect(service.ackFocus(id)).rejects.toMatchObject({ status: 409 });
    const withdrawn = "44444444-4444-4444-8444-444444444444";
    await service.requestFocus(session.token, withdrawn);
    await service.remove(session.token, job.job.jobId);
    expect(await service.nextFocus()).toBeNull();
    expect((await service.focusStatus(session.token, withdrawn)).status).toBe("CANCELLED");
    await expect(service.ackFocus(withdrawn)).rejects.toMatchObject({ status: 409 });
  });
});

/** Pure transition rules only. Callers must validate identity, record consent and use a transaction. */
export type ProductionJob = {
  state:
    | "QUEUED"
    | "RUNNING"
    | "UNKNOWN"
    | "REQUIRES_REVIEW"
    | "FAILED"
    | "PUBLISHED"
    | "WITHDRAWN";
  processingConsent: boolean;
  publicationConsent: boolean;
};

type Event =
  | { type: "START" }
  | { type: "UNKNOWN" }
  | { type: "REVIEW" }
  | { type: "FAIL" }
  | { type: "PUBLISH"; verified: boolean; approved: boolean }
  | { type: "WITHDRAW" };

export function createProductionJob(consent: {
  processing: boolean;
  automaticPublication: boolean;
}): ProductionJob {
  if (!consent.processing || !consent.automaticPublication) throw new Error("CONSENT_REQUIRED");
  return { state: "QUEUED", processingConsent: true, publicationConsent: true };
}

export function transitionProductionJob(job: ProductionJob, event: Event): ProductionJob {
  if (event.type === "WITHDRAW")
    return { ...job, state: "WITHDRAWN", processingConsent: false, publicationConsent: false };
  if (!job.processingConsent || !job.publicationConsent) throw new Error("CONSENT_REQUIRED");
  if (event.type === "START" && job.state === "QUEUED") return { ...job, state: "RUNNING" };
  if (event.type === "UNKNOWN" && job.state === "RUNNING") return { ...job, state: "UNKNOWN" };
  if (event.type === "REVIEW" && job.state === "RUNNING")
    return { ...job, state: "REQUIRES_REVIEW" };
  if (event.type === "FAIL" && job.state === "RUNNING") return { ...job, state: "FAILED" };
  if (
    event.type === "PUBLISH" &&
    (job.state === "RUNNING" || job.state === "REQUIRES_REVIEW") &&
    event.verified &&
    event.approved
  )
    return { ...job, state: "PUBLISHED" };
  throw new Error("INVALID_TRANSITION");
}

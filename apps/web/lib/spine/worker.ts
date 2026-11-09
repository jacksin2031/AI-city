import type { SpineFailureCode } from "@ai-city/contracts/spine";
import type { SpineJobs } from "./jobs";

type Candidate = Parameters<SpineJobs["publish"]>[2];

/** A trusted tool adapter must bind its task to the stored consent and verify its own review evidence. */
export type ToolOutcome =
  | { status: "APPROVED"; candidate: Candidate }
  | {
      status: "PREPARED" | "REQUIRES_REVIEW" | "FAILED" | "UNKNOWN";
      failureCode?: SpineFailureCode;
    };

/**
 * Claims once before invoking an external tool. An unknown result is never retried here.
 * The caller is responsible for authenticated admission, private storage and durable dispatch.
 */
export async function runSpineWorker(
  jobs: SpineJobs,
  task: string,
  owner: string,
  worker: string,
  execute: () => Promise<ToolOutcome>,
) {
  await jobs.get(task, owner);
  await jobs.claim(task, worker);
  let outcome: ToolOutcome;
  try {
    outcome = await execute();
  } catch {
    outcome = { status: "UNKNOWN", failureCode: "WORKER_EXECUTION_ERROR" };
  }
  try {
    if (outcome.status === "APPROVED") {
      try {
        return await jobs.publish(task, worker, outcome.candidate);
      } catch (error) {
        if (error instanceof Error && error.message === "BUNDLE_NOT_APPROVED")
          return await jobs.markFailed(task, worker);
        throw error;
      }
    }
    if (outcome.status === "PREPARED") return await jobs.markPrepared(task, worker);
    if (outcome.status === "REQUIRES_REVIEW") return await jobs.markReview(task, worker);
    if (outcome.status === "FAILED") return await jobs.markFailed(task, worker);
    return await jobs.markUnknown(task, worker, outcome.failureCode ?? null);
  } catch (error) {
    const current = await jobs.get(task, owner);
    if (current.state === "WITHDRAWN") return current;
    throw error;
  }
}

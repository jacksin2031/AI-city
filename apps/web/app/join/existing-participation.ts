import type { ParticipationView } from "@ai-city/contracts/development";
import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import {
  SpineCurrentResponseSchema,
  SpineWithdrawalResponseSchema,
} from "@ai-city/contracts/spine";

/**
 * What an earlier participation on this browser looks like to the next person holding the phone.
 * Deliberately carries no nickname, photo or card: only which flow it belongs to and how far it got.
 */
export type ExistingParticipation = {
  kind: "sample" | "spine";
  phase: "preparing" | "review" | "published" | "attention";
};

export type SpineJobRef = { task: string; state: string };

export function classifySample(view: ParticipationView | null): ExistingParticipation | null {
  if (!view) return null;
  // A removed or cancelled sample no longer blocks a new one and shows nothing public.
  if (view.publication === "REMOVED" || view.job.state === "CANCELLED") return null;
  if (view.publication === "PUBLISHED") return { kind: "sample", phase: "published" };
  if (view.job.state === "READY") return { kind: "sample", phase: "review" };
  if (view.job.state === "FAILED") return { kind: "sample", phase: "attention" };
  return { kind: "sample", phase: "preparing" };
}

export function classifySpine(job: SpineJobRef | null): ExistingParticipation | null {
  if (!job || job.state === "WITHDRAWN") return null;
  if (job.state === "PUBLISHED") return { kind: "spine", phase: "published" };
  if (["REQUIRES_REVIEW", "FAILED", "UNKNOWN"].includes(job.state))
    return { kind: "spine", phase: "attention" };
  return { kind: "spine", phase: "preparing" };
}

/** A published character is the most important thing to surface when both flows hold something. */
export function pickExisting(
  sample: ExistingParticipation | null,
  spine: ExistingParticipation | null,
): ExistingParticipation | null {
  if (sample && spine) return spine.phase === "published" ? spine : sample;
  return sample ?? spine;
}

export type ExistingProbe = {
  existing: ExistingParticipation | null;
  sample: ParticipationView | null;
  spine: SpineJobRef | null;
  /** True when an answer other than "nothing there" came back, so absence is not proven. */
  unreadable: boolean;
};

/** "No session" and "photo intake not configured here" both mean there is nothing to surface. */
function isAbsent(failure: unknown): boolean {
  if (failure instanceof DevelopmentApiError)
    return failure.status === 401 || failure.status === 404;
  // Both the hosted photo flow and the shared session probe use status-bearing request errors.
  // No session (401) is expected on first visit, and must not show a red connection warning.
  return (
    failure instanceof Error &&
    "status" in failure &&
    (failure.status === 401 || failure.status === 404)
  );
}

export async function probeExisting(deps: {
  sample: () => Promise<ParticipationView | null>;
  spine: () => Promise<SpineJobRef | null>;
}): Promise<ExistingProbe> {
  let unreadable = false;
  const settle = async <T>(read: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await read();
    } catch (failure) {
      if (!isAbsent(failure)) unreadable = true;
      return null;
    }
  };
  const [sample, spine] = await Promise.all([settle(deps.sample), settle(deps.spine)]);
  return {
    existing: pickExisting(classifySample(sample), classifySpine(spine)),
    sample,
    spine,
    unreadable,
  };
}

export class SpineRequestFailure extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function spineRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/visitor/${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new SpineRequestFailure(
      response.status,
      body?.error?.message ?? "操作できませんでした。しばらくしてからお試しください。",
      body?.error?.code,
    );
  return body;
}

export async function readSpineCurrent(): Promise<SpineJobRef | null> {
  return SpineCurrentResponseSchema.parse(await spineRequest("spine/jobs/current")).job;
}

export async function withdrawSpineJob(task: string): Promise<void> {
  SpineWithdrawalResponseSchema.parse(
    await spineRequest(`spine/jobs/${encodeURIComponent(task)}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
}

/**
 * Retire whatever the earlier visitor left: a live Spine character is withdrawn (which also asks for
 * the uploaded photo to be erased) before the session itself ends, so nothing public is left behind.
 */
export async function closeExistingParticipation(
  probe: Pick<ExistingProbe, "spine">,
  closeSession: () => Promise<unknown>,
): Promise<void> {
  if (probe.spine && probe.spine.state !== "WITHDRAWN") await withdrawSpineJob(probe.spine.task);
  await closeSession();
}

/** Messages for the guard; none of them name or describe the earlier participant. */
export function phaseSummary(existing: ExistingParticipation): string {
  switch (existing.phase) {
    case "published":
      return "街に公開されているキャラクターがあります。";
    case "review":
      return "公開前の確認待ちの参加があります。";
    case "attention":
      return "確認が必要な参加が残っています。";
    default:
      return "キャラクターを準備中の参加があります。";
  }
}

export function restartWarning(existing: ExistingParticipation): string {
  const gone =
    existing.phase === "published"
      ? "街に公開されているキャラクターを取り消し、"
      : "準備中のキャラクターを中止し、";
  const photo = existing.kind === "spine" ? "送信済みの写真の消去を依頼して、" : "";
  return `${gone}${photo}前の参加情報を削除します。元に戻せません。前の方の参加を終えてよいか確認してください。`;
}

import { z } from "zod";
import {
  CityEventPageSchema,
  CitySnapshotSchema,
  type CreateJobRequest,
  CreateJobRequestSchema,
  DevelopmentErrorSchema,
  developmentEventId,
  ParticipationViewSchema,
  type PublishRequest,
  PublishRequestSchema,
} from "./development";
import { FocusRequestInputSchema, FocusStatusResponseSchema } from "./focus-link";

export class DevelopmentApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Same-origin browser client; Node tooling supplies an explicit loopback baseUrl. */
export function createDevelopmentClient(
  options: { baseUrl?: string; fetch?: typeof fetch; apiPath?: "/api/dev" | "/api/visitor" } = {},
) {
  const base = options.baseUrl?.replace(/\/$/, "") ?? "";
  const apiPath = options.apiPath ?? "/api/dev";
  const transport = options.fetch ?? fetch;
  const nodeCookies = Boolean(base && typeof window === "undefined");
  let sessionCookie = "";
  async function read<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (nodeCookies && sessionCookie) headers.Cookie = sessionCookie;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      if (base) headers.Origin = new URL(base).origin;
    }
    const response = await transport(`${base}${apiPath}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value: unknown = await response.json();
    if (nodeCookies) {
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      const name = apiPath === "/api/visitor" ? "ai-city-visitor=" : "ai-city-local-session=";
      if (cookie?.startsWith(name)) sessionCookie = cookie;
    }
    if (!response.ok) {
      const error = DevelopmentErrorSchema.parse(value).error;
      throw new DevelopmentApiError(error.code, response.status, error.message);
    }
    return schema.parse(value);
  }
  const id = (value: string) => encodeURIComponent(value);
  const empty = z.strictObject({ mode: z.literal("MOCK") });
  let initializing: ReturnType<typeof read<{ mode: "MOCK" }>> | null = null;
  return {
    createSession: (invitation?: string) => {
      initializing ??= read("session", empty, invitation ? { invitation } : {}).finally(() => {
        initializing = null;
      });
      return initializing;
    },
    closeSession: () => read("logout", empty, {}),
    focus: () => read("focus", empty, {}),
    requestFocus: (requestId: string) =>
      read(
        "focus-requests",
        FocusStatusResponseSchema,
        FocusRequestInputSchema.parse({ requestId }),
      ),
    focusStatus: (requestId: string) =>
      read(
        `focus-requests/${id(FocusRequestInputSchema.parse({ requestId }).requestId)}`,
        FocusStatusResponseSchema,
      ),
    createJob: (input: CreateJobRequest) =>
      read("jobs", ParticipationViewSchema, CreateJobRequestSchema.parse(input)),
    current: () => read("jobs/current", ParticipationViewSchema.nullable()),
    job: (jobId: string) => read(`jobs/${id(jobId)}`, ParticipationViewSchema),
    confirm: (jobId: string, consent: PublishRequest) =>
      read(
        `jobs/${id(jobId)}/confirm`,
        ParticipationViewSchema,
        PublishRequestSchema.parse(consent),
      ),
    cancel: (jobId: string) => read(`jobs/${id(jobId)}/cancel`, ParticipationViewSchema, {}),
    retry: (jobId: string) => read(`jobs/${id(jobId)}/retry`, ParticipationViewSchema, {}),
    remove: (jobId: string) => read(`jobs/${id(jobId)}/remove`, ParticipationViewSchema, {}),
    snapshot: () => read(`city/snapshot?eventId=${developmentEventId}`, CitySnapshotSchema),
    events: (streamId: string, afterSeq: number) =>
      read(
        `city/events?eventId=${developmentEventId}&streamId=${id(streamId)}&afterSeq=${afterSeq}`,
        CityEventPageSchema,
      ),
  };
}

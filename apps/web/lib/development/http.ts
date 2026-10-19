import {
  type CreateJobRequest,
  developmentEventId,
  EmptyDevelopmentRequestSchema,
  isDevelopmentValidationError,
  PublishRequestSchema,
} from "@ai-city/contracts/development";
import { DevelopmentServiceError, type LocalParticipationService } from "./service";

const cookieName = "ai-city-local-session";
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
const messages: Record<string, string> = {
  SESSION_REQUIRED: "参加情報の有効期限が切れました。最初からお試しください。",
  JOB_NOT_FOUND: "この参加情報は見つかりませんでした。",
  JOB_NOT_READY: "プレビューの準備ができてから確認してください。",
  RETRY_EXHAUSTED: "再試行できません。中止して新しいサンプルをお試しください。",
  ACTIVE_JOB_EXISTS: "進行中の参加を確認するか、中止してください。",
  STREAM_RESET: "接続が更新されました。街の情報を読み直してください。",
  CURSOR_AHEAD: "街の情報を読み直してください。",
  LOCAL_CAPACITY: "サンプルの上限に達しました。開発サーバーを再起動してください。",
  LOCAL_ONLY: "このサンプルはローカル環境でのみ利用できます。",
  MOCK_DISABLED: "ローカル連携サンプルは有効になっていません。",
  INVALID_REQUEST: "入力内容を確認してください。",
  BODY_TOO_LARGE: "送信する内容が大きすぎます。",
  NOT_FOUND: "指定されたサンプルは見つかりませんでした。",
  CONSENT_SCOPE_REQUIRED: "展示サイトで公開する範囲を確認してから同意してください。",
  ADMIN_REQUIRED: "この接続サンプルは管理者専用です。スマホの管理画面から接続してください。",
};
function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DevelopmentServiceError("INVALID_REQUEST", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new DevelopmentServiceError("BODY_TOO_LARGE", 413);
      }
      parts.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new DevelopmentServiceError("INVALID_REQUEST", 400);
  }
}
function query(url: URL, keys: string[]) {
  if (
    [...url.searchParams.keys()].some(
      (key) => !keys.includes(key) || url.searchParams.getAll(key).length !== 1,
    )
  )
    throw new DevelopmentServiceError("INVALID_REQUEST", 400);
}

export function validateRequestOrigin(request: Request, remoteOrigin?: string): URL {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  let browserUrl: URL;
  try {
    browserUrl = new URL(`${url.protocol}//${host}`);
  } catch {
    throw new DevelopmentServiceError("LOCAL_ONLY", 403);
  }
  if (remoteOrigin) {
    let configured: URL;
    try {
      configured = new URL(remoteOrigin);
    } catch {
      throw new DevelopmentServiceError("LOCAL_ONLY", 403);
    }
    if (
      configured.protocol !== "https:" ||
      configured.origin !== remoteOrigin ||
      configured.username ||
      configured.password ||
      loopback.has(configured.hostname) ||
      host !== configured.host
    )
      throw new DevelopmentServiceError("LOCAL_ONLY", 403);
    // HTTPS terminates at the configured host. Never derive allowed origins from forwarded headers.
    browserUrl = configured;
  } else if (
    browserUrl.host !== host ||
    browserUrl.port !== url.port ||
    !loopback.has(url.hostname) ||
    !loopback.has(browserUrl.hostname)
  ) {
    throw new DevelopmentServiceError("LOCAL_ONLY", 403);
  }
  if (
    request.method === "POST" &&
    (request.headers.get("origin") !== browserUrl.origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    throw new DevelopmentServiceError("LOCAL_ONLY", 403);
  return browserUrl;
}

export async function handleDevelopmentRequest(
  request: Request,
  service: LocalParticipationService,
  enabled: boolean,
  remoteOrigin?: string,
  remoteAuthorized = false,
): Promise<Response> {
  try {
    if (!enabled) throw new DevelopmentServiceError("MOCK_DISABLED", 404);
    const url = new URL(request.url);
    const browserUrl = validateRequestOrigin(request, remoteOrigin);
    if (remoteOrigin && !remoteAuthorized) throw new DevelopmentServiceError("ADMIN_REQUIRED", 403);
    const path = url.pathname.replace(/^\/api\/dev\//, "");
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (request.method === "GET" && path.startsWith("city/")) {
      query(url, path === "city/events" ? ["eventId", "streamId", "afterSeq"] : ["eventId"]);
      if (url.searchParams.get("eventId") !== developmentEventId)
        throw new DevelopmentServiceError("NOT_FOUND", 404);
      if (path === "city/snapshot") return json(service.snapshot());
      if (path === "city/events") {
        const after = url.searchParams.get("afterSeq") ?? "";
        const streamId = url.searchParams.get("streamId");
        if (!/^\d{1,6}$/.test(after) || !streamId)
          throw new DevelopmentServiceError("INVALID_REQUEST", 400);
        return json(service.events(streamId, Number(after)));
      }
    }
    query(url, []);
    if (request.method === "POST" && path === "session") {
      EmptyDevelopmentRequestSchema.parse(await readJsonBody(request));
      const token = service.hasSession(cookie) ? cookie : service.createSession();
      return json({ mode: "MOCK" }, 200, {
        "Set-Cookie": `${cookieName}=${token}; Path=/api/dev; HttpOnly; SameSite=Strict; Max-Age=3600${browserUrl.protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    if (!service.hasSession(cookie)) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    if (request.method === "POST" && path === "jobs")
      return json(
        service.createJob(cookie, (await readJsonBody(request)) as CreateJobRequest),
        201,
      );
    if (request.method === "GET" && path === "jobs/current") return json(service.current(cookie));
    const match = /^jobs\/([A-Za-z0-9_-]{1,128})(?:\/(confirm|cancel|retry|remove))?$/.exec(path);
    if (match?.[1]) {
      const jobId = match[1];
      const action = match[2];
      if (request.method === "GET" && !action) return json(service.getJob(cookie, jobId));
      if (request.method === "POST" && action) {
        const input = await readJsonBody(request);
        if (action === "confirm") {
          const consent = PublishRequestSchema.parse(input);
          if (
            remoteOrigin &&
            (consent.consentVersion !== 2 || consent.publicationScope !== "HOSTED_PREVIEW")
          )
            throw new DevelopmentServiceError("CONSENT_SCOPE_REQUIRED", 403);
          return json(service.confirm(cookie, jobId, consent));
        }
        EmptyDevelopmentRequestSchema.parse(input);
        if (action === "cancel") return json(service.cancel(cookie, jobId));
        if (action === "retry") return json(service.retry(cookie, jobId));
        if (action === "remove") return json(service.remove(cookie, jobId));
      }
    }
    throw new DevelopmentServiceError("NOT_FOUND", 404);
  } catch (error) {
    const code = isDevelopmentValidationError(error)
      ? "INVALID_REQUEST"
      : error instanceof DevelopmentServiceError
        ? error.code
        : "INTERNAL_ERROR";
    const status = isDevelopmentValidationError(error)
      ? 400
      : error instanceof DevelopmentServiceError
        ? error.status
        : 500;
    return json(
      {
        mode: "MOCK",
        error: {
          code,
          message: messages[code] ?? "操作を完了できませんでした。参加情報を読み直してください。",
        },
      },
      status,
    );
  }
}

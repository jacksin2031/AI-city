import {
  type CreateJobRequest,
  EmptyDevelopmentRequestSchema,
  isDevelopmentValidationError,
  PublishRequestSchema,
} from "@ai-city/contracts/development";
import { FocusRequestInputSchema, FocusStatusResponseSchema } from "@ai-city/contracts/focus-link";
import { PhotoUploadPublicSettingsSchema } from "@ai-city/contracts/spine";
import { VisitorSessionRequestSchema } from "@ai-city/contracts/visitor";
import { readJsonBody, validateRequestOrigin } from "../development/http";
import { DevelopmentServiceError } from "../development/service";
import type { CloudAssetStorage } from "../spine/cloud-asset-storage";
import { submitCloudPhoto, withdrawCloudPhoto } from "../spine/cloud-photo-intake";
import type { CloudPhotoStorage } from "../spine/cloud-photo-storage";
import type { LocalSpineStorage } from "../spine/local-storage";
import { submitSpinePhoto, withdrawSpinePhoto } from "../spine/photo-intake";
import type { VisitorBoundary } from "./credentials";
import { focusTarget } from "./focus";
import { focusBroker } from "./focus-runtime";
import type { VisitorService } from "./service";

const messages: Record<string, string> = {
  SESSION_REQUIRED: "参加情報の有効期限が切れました。最初からお試しください。",
  JOB_NOT_FOUND: "この参加情報は見つかりませんでした。",
  JOB_NOT_READY: "プレビューの準備ができてから確認してください。",
  ACTIVE_JOB_EXISTS: "進行中の参加を確認するか、中止してください。",
  LOCAL_ONLY: "接続先を確認してください。指定の安全なURLで開いてください。",
  INVALID_REQUEST: "入力内容を確認してください。",
  CONSENT_SCOPE_REQUIRED: "展示サイトで公開する範囲を確認してから同意してください。",
  BODY_TOO_LARGE: "送信する内容が大きすぎます。",
  INVITATION_REQUIRED:
    "管理者から受け取った参加用コードを確認してください。コードは3分間・1回だけ有効です。",
  LOCAL_CAPACITY: "ただいま参加が集中しています。しばらく待ってお試しください。",
  RATE_LIMITED: "ただいま参加が集中しています。1分ほど待って、もう一度お試しください。",
  PHOTO_INVALID: "写真を読み取れません。JPEG、PNG または WebP を選んでください。",
  PHOTO_SIZE: "写真の容量を確認してください。",
  PHOTO_UPLOAD_DISABLED:
    "現在、写真の受付を停止しています。「写真なし」の用意されたキャラクターでご参加ください。",
  PHOTO_CONSENT_REQUIRED:
    "写真の処理、外部AIへの送信、完成したキャラクターの公開について同意を確認してください。",
};

async function readPhoto(request: Request) {
  const limit = 8 * 1024 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new DevelopmentServiceError("BODY_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) throw new DevelopmentServiceError("BODY_TOO_LARGE", 413);
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return bytes;
}
function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export async function handleVisitorRequest(
  request: Request,
  service: VisitorService | null,
  enabled: boolean,
  remoteOrigin?: string,
  security?: VisitorBoundary | null,
  codeFree = false,
  spineStorage?: LocalSpineStorage | null,
  spineCloud?: {
    photos: Pick<CloudPhotoStorage, "write" | "read" | "remove">;
    assets: Pick<CloudAssetStorage, "removeTask">;
  } | null,
): Promise<Response> {
  try {
    if (!enabled || !service)
      return json(
        {
          mode: "MOCK",
          error: { code: "VISITORS_DISABLED", message: "この参加方法はまだ公開されていません。" },
        },
        404,
      );
    const browser = validateRequestOrigin(request, remoteOrigin);
    if (!security) throw new Error("Visitor signing configuration is unavailable");
    const url = new URL(request.url);
    if (url.search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
    const path = url.pathname.replace(/^\/api\/visitor\//, "");
    const cookies = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith("ai-city-visitor="));
    if (cookies.length > 1) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
    const rawCredential = cookies[0]?.slice("ai-city-visitor=".length);
    const token = security.readSession(rawCredential);
    const cookie = (value: string, age: number) => ({
      "Set-Cookie": `ai-city-visitor=${value}; Path=/api/visitor; HttpOnly; SameSite=Strict; Max-Age=${age}${browser.protocol === "https:" ? "; Secure" : ""}`,
    });
    if (request.method === "POST" && path === "session") {
      const input = VisitorSessionRequestSchema.parse(await readJsonBody(request));
      const invitation = security.readInvitation(input.invitation);
      if (input.invitation && !invitation)
        throw new DevelopmentServiceError("INVITATION_REQUIRED", 401);
      if (!token && !invitation && !codeFree)
        throw new DevelopmentServiceError("INVITATION_REQUIRED", 401);
      // One process-wide admission bucket: rotating cookies or network headers cannot bypass it.
      if (codeFree && !invitation && !token) security.allow("open-admission", 12);
      if (token || invitation)
        security.allow(token ? `session:${rawCredential}` : `invite:${input.invitation}`);
      const session =
        codeFree && !invitation
          ? await service.createOpenSession(token ?? undefined)
          : await service.createSession(token ?? undefined, invitation ?? undefined);
      return json({ mode: "MOCK" }, 200, cookie(security.signSession(session.token), 86400));
    }
    if (path.startsWith("city/")) throw new DevelopmentServiceError("NOT_FOUND", 404);
    // Public, session-less, read-only: one effective boolean. Unreadable settings mean "not allowed".
    if (path === "photo-upload-settings") {
      if (request.method !== "GET") throw new DevelopmentServiceError("NOT_FOUND", 404);
      return json(
        PhotoUploadPublicSettingsSchema.parse({
          allowed: Boolean(spineCloud) && (await service.photoUploadAllowed()),
        }),
      );
    }
    if (!token) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    security.allow(`session:${rawCredential}`);
    if (request.method === "POST" && path === "focus-requests") {
      const input = FocusRequestInputSchema.parse(await readJsonBody(request));
      return json(
        FocusStatusResponseSchema.parse({
          mode: "MOCK",
          ...(await service.requestFocus(token, input.requestId)),
        }),
      );
    }
    const focusMatch = /^focus-requests\/([A-Za-z0-9-]+)$/.exec(path);
    if (request.method === "GET" && focusMatch?.[1]) {
      return json(
        FocusStatusResponseSchema.parse({
          mode: "MOCK",
          ...(await service.focusStatus(token, focusMatch[1])),
        }),
      );
    }
    if (path === "spine/jobs" && request.method === "POST" && (spineStorage || spineCloud)) {
      if (
        request.headers.get("x-spine-processing-consent") !== "1" ||
        request.headers.get("x-spine-model-upload-consent") !== "1" ||
        request.headers.get("x-spine-publication-consent") !== "1"
      )
        throw new DevelopmentServiceError("PHOTO_CONSENT_REQUIRED", 400);
      if (!/^(image\/(jpeg|png|webp))$/i.test(request.headers.get("content-type") ?? ""))
        throw new DevelopmentServiceError("PHOTO_INVALID", 400);
      // Refuse before the body is read or any photo is stored. The cloud reservation re-checks
      // inside its transaction to close the race with an administrator turning uploads off.
      // Local loopback intake is an isolated private test and is not gated.
      if (spineCloud && !(await service.photoUploadAllowed()))
        throw new DevelopmentServiceError("PHOTO_UPLOAD_DISABLED", 403);
      const bytes = await readPhoto(request);
      try {
        const consent = {
          processing: true,
          externalModelUpload: true,
          automaticPublication: true,
          version: 2,
        };
        const job = spineCloud
          ? await submitCloudPhoto(service, spineCloud.photos, token, bytes, consent)
          : await submitSpinePhoto(
              service,
              spineStorage as LocalSpineStorage,
              token,
              bytes,
              consent,
            );
        return json({ mode: "LOCAL_PRIVATE_TEST", ...job }, 202);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "PHOTO_INVALID" || error.message === "PHOTO_SIZE")
        )
          throw new DevelopmentServiceError(error.message, 400);
        throw error;
      }
    }
    if ((spineStorage || spineCloud) && path === "spine/profile" && request.method === "POST") {
      await service.setSpineProfile(token, await readJsonBody(request));
      return json({ mode: "LOCAL_PRIVATE_TEST" });
    }
    if ((spineStorage || spineCloud) && path === "spine/profile" && request.method === "GET")
      return json({
        mode: "LOCAL_PRIVATE_TEST",
        profile: await service.currentSpineProfile(token),
      });
    if ((spineStorage || spineCloud) && path === "spine/jobs/current" && request.method === "GET")
      return json({ mode: "LOCAL_PRIVATE_TEST", job: await service.currentSpineJob(token) });
    // The participant's own character, so the summary card can draw the finished figure.
    if ((spineStorage || spineCloud) && path === "spine/bundle" && request.method === "GET")
      return json({
        mode: "LOCAL_PRIVATE_TEST",
        bundle: await service.currentSpineBundle(token),
      });
    const spineMatch = /^spine\/jobs\/([A-Za-z0-9_-]{1,96})(?:\/(withdraw))?$/.exec(path);
    if ((spineStorage || spineCloud) && spineMatch?.[1]) {
      if (request.method === "GET" && !spineMatch[2])
        return json({
          mode: "LOCAL_PRIVATE_TEST",
          ...(await service.spineJobStatus(token, spineMatch[1])),
        });
      if (request.method === "POST" && spineMatch[2]) {
        EmptyDevelopmentRequestSchema.parse(await readJsonBody(request));
        return json({
          mode: "LOCAL_PRIVATE_TEST",
          ...(spineCloud
            ? await withdrawCloudPhoto(
                service,
                spineCloud.photos,
                spineCloud.assets,
                token,
                spineMatch[1],
              )
            : await withdrawSpinePhoto(
                service,
                spineStorage as LocalSpineStorage,
                token,
                spineMatch[1],
              )),
        });
      }
    }
    if (request.method === "POST" && path === "focus") {
      EmptyDevelopmentRequestSchema.parse(await readJsonBody(request));
      const view = await service.current(token);
      const snapshot = await service.snapshot();
      const target = focusTarget(
        view,
        snapshot.residents.map((resident) => resident.residentId),
      );
      if (!target) throw new DevelopmentServiceError("JOB_NOT_READY", 409);
      focusBroker.publish(target);
      return json({ mode: "MOCK" });
    }
    if (request.method === "POST" && path === "logout") {
      EmptyDevelopmentRequestSchema.parse(await readJsonBody(request));
      await service.closeSession(token);
      return json({ mode: "MOCK" }, 200, cookie("", 0));
    }
    if (request.method === "POST" && path === "jobs")
      return json(
        await service.createJob(token, (await readJsonBody(request)) as CreateJobRequest),
        201,
      );
    if (request.method === "GET" && path === "jobs/current")
      return json(await service.current(token));
    const match = /^jobs\/([A-Za-z0-9_-]{1,128})(?:\/(confirm|cancel|retry|remove))?$/.exec(path);
    if (match?.[1]) {
      const id = match[1],
        action = match[2];
      if (request.method === "GET" && !action) return json(await service.getJob(token, id));
      if (request.method === "POST" && action) {
        const input = await readJsonBody(request);
        if (action === "confirm")
          return json(await service.confirm(token, id, PublishRequestSchema.parse(input)));
        EmptyDevelopmentRequestSchema.parse(input);
        if (action === "cancel") return json(await service.cancel(token, id));
        if (action === "retry") return json(await service.retry(token, id));
        if (action === "remove") return json(await service.remove(token, id));
      }
    }
    throw new DevelopmentServiceError("NOT_FOUND", 404);
  } catch (error) {
    const invalid = isDevelopmentValidationError(error);
    const known = error instanceof DevelopmentServiceError;
    const code = invalid ? "INVALID_REQUEST" : known ? error.code : "STORE_UNAVAILABLE";
    return json(
      {
        mode: "MOCK",
        error: {
          code,
          message:
            messages[code] ??
            "操作を完了できませんでした。しばらく待ってから参加情報を読み直してください。",
        },
      },
      invalid ? 400 : known ? error.status : 503,
    );
  }
}

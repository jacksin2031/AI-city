import {
  EmptyDevelopmentRequestSchema,
  isDevelopmentValidationError,
} from "@ai-city/contracts/development";
import {
  DeviceParticipantCounterResetSchema,
  DeviceRemoveSchema,
} from "@ai-city/contracts/device-link";
import {
  FocusNextResponseSchema,
  FocusRequestInputSchema,
  FocusStatusResponseSchema,
} from "@ai-city/contracts/focus-link";
import {
  PhotoUploadAdminSettingsSchema,
  PhotoUploadSettingsUpdateSchema,
  SpineAdminActionSchema,
} from "@ai-city/contracts/spine";
import { readJsonBody, validateRequestOrigin } from "../development/http";
import { DevelopmentServiceError } from "../development/service";
import { evaluateChatWorkerHeartbeat } from "../link/chat-worker-health";
import { handleLinkRequest } from "../link/http";
import { DeviceLinkError, type DeviceLinkService } from "../link/service";
import type { VisitorBoundary } from "./credentials";
import { focusBroker } from "./focus-runtime";
import type { SpineAdminDeps, VisitorService } from "./service";

/** Safe Japanese text per code the admin recovery actions can raise; nothing internal leaks. */
const SPINE_ADMIN_MESSAGES: Record<string, string> = {
  COST_UNCONFIRMED: "再生成の費用を確認してください。",
  JOB_NOT_FOUND: "対象のタスクが見つかりません。",
  INVALID_TRANSITION: "このタスクの現在の状態ではその操作はできません。",
  PHOTO_GONE: "写真が残っていないため再生成できません。",
  CLOUD_PHOTO_UNAVAILABLE: "写真の保管先に接続できません。しばらくしてからお試しください。",
  SESSION_REQUIRED: "参加者のセッションが終了しているため操作できません。",
  ACTIVE_JOB_EXISTS: "この参加者には別の処理が残っているため操作できません。",
  LOCAL_CAPACITY: "街の収容上限に達しているため操作できません。",
};

/** Keep existing device authentication; replace only authorized public data reads. */
export async function handlePersistentDeviceRequest(
  request: Request,
  device: DeviceLinkService,
  visitor: VisitorService | null,
  enabled: boolean,
  remoteOrigin?: string,
  localBootstrap = false,
  security?: VisitorBoundary | null,
  photos?: () => SpineAdminDeps["photos"],
  cloudIntakeAvailable?: () => boolean,
): Promise<Response> {
  try {
    const focusPath = new URL(request.url).pathname;
    if (enabled && focusPath === "/api/link/chat-worker") {
      validateRequestOrigin(request, remoteOrigin);
      if (new URL(request.url).search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      if (request.method !== "GET") throw new DeviceLinkError("NOT_FOUND", 404);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      device.authorizeParticipant(token);
      return Response.json(
        visitor
          ? await visitor.chatWorkerStatus()
          : evaluateChatWorkerHeartbeat(null, Date.now(), false),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      enabled &&
      ((request.method === "GET" && focusPath === "/api/link/focus-next") ||
        (request.method === "POST" && focusPath === "/api/link/focus-ack"))
    ) {
      validateRequestOrigin(request, remoteOrigin);
      if (new URL(request.url).search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      const display = device.display(token);
      if (request.method === "GET") {
        const focus =
          visitor && display.control.displayMode === "LIVE" ? await visitor.nextFocus() : null;
        return Response.json(FocusNextResponseSchema.parse({ mode: "MOCK", focus }), {
          headers: { "Cache-Control": "no-store" },
        });
      }
      const input = FocusRequestInputSchema.parse(await readJsonBody(request));
      if (!visitor || display.control.displayMode !== "LIVE")
        throw new DevelopmentServiceError("FOCUS_UNAVAILABLE", 409);
      return Response.json(
        FocusStatusResponseSchema.parse({
          mode: "MOCK",
          ...(await visitor.ackFocus(input.requestId)),
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      enabled &&
      request.method === "GET" &&
      new URL(request.url).pathname === "/api/link/focus"
    ) {
      validateRequestOrigin(request, remoteOrigin);
      if (new URL(request.url).search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      const display = device.display(token);
      const command = focusBroker.current();
      const snapshot =
        display.control.displayMode === "LIVE" && command && visitor
          ? await visitor.snapshot()
          : null;
      const focus = snapshot?.residents.some(
        (resident) => resident.residentId === command?.residentId,
      )
        ? command
        : null;
      return Response.json({ mode: "MOCK", focus }, { headers: { "Cache-Control": "no-store" } });
    }
    if (
      enabled &&
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/link/participant-counter-reset"
    ) {
      validateRequestOrigin(request, remoteOrigin);
      const url = new URL(request.url);
      if (url.search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      device.authorizeParticipant(token);
      EmptyDevelopmentRequestSchema.parse(await readJsonBody(request));
      if (!visitor) throw new DevelopmentServiceError("VISITORS_DISABLED", 503);
      const totalParticipants = await visitor.resetJoinedTotal();
      return Response.json(
        DeviceParticipantCounterResetSchema.parse({ mode: "MOCK", totalParticipants }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      enabled &&
      ["GET", "POST"].includes(request.method) &&
      focusPath === "/api/link/photo-upload-settings"
    ) {
      validateRequestOrigin(request, remoteOrigin);
      if (new URL(request.url).search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      // Administrator only: the participant (visitor) cookie never reaches this branch's checks.
      device.authorizeParticipant(token);
      const update =
        request.method === "POST"
          ? PhotoUploadSettingsUpdateSchema.parse(await readJsonBody(request))
          : null;
      if (!visitor) throw new DevelopmentServiceError("VISITORS_DISABLED", 503);
      if (update) await visitor.setPhotoUploadAllowed(update.allowUpload);
      // Report what is stored right now, never what the request asked for.
      const allowUpload = await visitor.photoUploadAllowed();
      let available = false;
      try {
        available = cloudIntakeAvailable?.() ?? false;
      } catch {
        available = false;
      }
      return Response.json(
        PhotoUploadAdminSettingsSchema.parse({
          allowUpload,
          available,
          effective: available && allowUpload && (await visitor.photoUploadReady()),
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      enabled &&
      ["GET", "POST"].includes(request.method) &&
      new URL(request.url).pathname === "/api/link/spine-admin"
    ) {
      validateRequestOrigin(request, remoteOrigin);
      if (new URL(request.url).search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      device.authorizeParticipant(token);
      const action =
        request.method === "POST"
          ? SpineAdminActionSchema.parse(await readJsonBody(request))
          : null;
      if (!visitor) throw new DevelopmentServiceError("VISITORS_DISABLED", 503);
      if (action) {
        try {
          await visitor.spineAdminAction(action, {
            // Resolved only when a requeue checks the photo; a config error becomes a 503 there.
            photos: {
              exists: async (task) => {
                const storage = photos?.();
                return storage ? storage.exists(task) : false;
              },
            },
          });
        } catch (error) {
          // The participant's session ending is not the administrator's session ending.
          if (error instanceof DevelopmentServiceError && error.status === 401)
            throw new DevelopmentServiceError(error.code, 409);
          throw error;
        }
      }
      return Response.json(await visitor.spineAdminView(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!visitor) return handleLinkRequest(request, device, enabled, remoteOrigin, localBootstrap);
    if (
      enabled &&
      request.method === "POST" &&
      ["/api/link/remove", "/api/link/visitor-invitation"].includes(new URL(request.url).pathname)
    ) {
      validateRequestOrigin(request, remoteOrigin);
      const url = new URL(request.url);
      if (url.search) throw new DevelopmentServiceError("INVALID_REQUEST", 400);
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("ai-city-link="))
        ?.slice("ai-city-link=".length);
      device.authorizeParticipant(token);
      if (url.pathname === "/api/link/visitor-invitation") {
        EmptyDevelopmentRequestSchema.parse(await readJsonBody(request));
        if (!security) throw new Error("Visitor signing configuration is unavailable");
        const invitation = await visitor.createInvitation();
        return Response.json(
          {
            code: security.signInvitation(invitation.code),
            expiresAt: new Date(invitation.expiresAt).toISOString(),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const input = DeviceRemoveSchema.parse(await readJsonBody(request));
      await visitor.removeResident(input.residentId);
      const state = device.adminState(token);
      state.snapshot = await visitor.snapshot();
      state.totalParticipants = await visitor.joinedTotal();
      return Response.json(state, { headers: { "Cache-Control": "no-store" } });
    }
    const response = await handleLinkRequest(
      request,
      device,
      enabled,
      remoteOrigin,
      localBootstrap,
    );
    if (!response.ok) return response;
    const payload = await response.clone().json();
    if (
      payload.snapshot &&
      ("pairedDisplays" in payload || payload.control?.displayMode === "LIVE")
    ) {
      const snapshot = await visitor.snapshot();
      payload.snapshot =
        "pairedDisplays" in payload ? snapshot : device.withPresets(snapshot, "LIVE");
      payload.totalParticipants = await visitor.joinedTotal();
      return Response.json(payload, { status: response.status, headers: response.headers });
    }
    return response;
  } catch (error) {
    const known = error instanceof DeviceLinkError || error instanceof DevelopmentServiceError;
    const invalid = isDevelopmentValidationError(error);
    return Response.json(
      {
        mode: "MOCK",
        error: {
          code: invalid ? "INVALID_REQUEST" : known ? error.code : "STORE_UNAVAILABLE",
          message:
            known && error.code === "VISITORS_DISABLED"
              ? "永続参加機能の保存先を利用できません。設定を確認してください。"
              : (known && SPINE_ADMIN_MESSAGES[error.code]) ||
                "操作を完了できませんでした。接続と入力内容を確認してください。",
        },
      },
      {
        status: invalid ? 400 : known ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

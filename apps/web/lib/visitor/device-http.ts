import {
  EmptyDevelopmentRequestSchema,
  isDevelopmentValidationError,
} from "@ai-city/contracts/development";
import { DeviceRemoveSchema } from "@ai-city/contracts/device-link";
import { readJsonBody, validateRequestOrigin } from "../development/http";
import { DevelopmentServiceError } from "../development/service";
import { handleLinkRequest } from "../link/http";
import { DeviceLinkError, type DeviceLinkService } from "../link/service";
import type { VisitorBoundary } from "./credentials";
import { focusBroker } from "./focus-runtime";
import type { VisitorService } from "./service";

/** Keep existing device authentication; replace only authorized public data reads. */
export async function handlePersistentDeviceRequest(
  request: Request,
  device: DeviceLinkService,
  visitor: VisitorService | null,
  enabled: boolean,
  remoteOrigin?: string,
  localBootstrap = false,
  security?: VisitorBoundary | null,
): Promise<Response> {
  try {
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
      if (!("pairedDisplays" in payload)) payload.totalParticipants = await visitor.joinedTotal();
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
          message: "操作を完了できませんでした。接続と入力内容を確認してください。",
        },
      },
      {
        status: invalid ? 400 : known ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

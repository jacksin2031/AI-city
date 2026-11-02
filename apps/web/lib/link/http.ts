import {
  EmptyDevelopmentRequestSchema,
  isDevelopmentValidationError,
} from "@ai-city/contracts/development";
import {
  DeviceLoginSchema,
  DevicePairSchema,
  DevicePresetUpdateSchema,
  DeviceRemoveSchema,
  DeviceUpdateSchema,
} from "@ai-city/contracts/device-link";
import { readJsonBody, validateRequestOrigin } from "../development/http";
import { DevelopmentServiceError } from "../development/service";
import { DeviceLinkError, type DeviceLinkService } from "./service";

const messages: Record<string, string> = {
  PAIR_REQUIRED: "接続の有効期限が切れました。もう一度接続してください。",
  ADMIN_REQUIRED: "この操作には管理者の接続が必要です。",
  LOGIN_FAILED: "管理キーを確認してください。",
  PAIR_FAILED: "コードが無効か期限切れです。スマホで新しいコードを発行してください。",
  RATE_LIMITED: "試行が続いています。1分ほど待ってお試しください。",
  REVISION_CONFLICT: "別の操作で更新されました。現在の状態を確認してお試しください。",
  LOCAL_ONLY: "接続先を確認してください。指定の安全なURLで開いてください。",
  MOCK_DISABLED: "接続サンプルは有効になっていません。",
  INVALID_REQUEST: "入力内容を確認してください。",
  BODY_TOO_LARGE: "送信する内容が大きすぎます。",
};
function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export async function handleLinkRequest(
  request: Request,
  service: DeviceLinkService,
  enabled: boolean,
  remoteOrigin?: string,
  localBootstrap = false,
) {
  let rateCookie: string | null = null;
  const reply = (value: unknown, status = 200, headers: Record<string, string> = {}) => {
    const response = json(value, status, headers);
    if (rateCookie) response.headers.append("Set-Cookie", rateCookie);
    return response;
  };
  try {
    if (!enabled) throw new DeviceLinkError("MOCK_DISABLED", 404);
    const origin = validateRequestOrigin(request, remoteOrigin);
    const rawRate = request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("ai-city-rate="))
      ?.slice("ai-city-rate=".length);
    const client = service.rateClient(rawRate);
    if (client.cookie)
      rateCookie = `ai-city-rate=${client.cookie}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=3600${origin.protocol === "https:" ? "; Secure" : ""}`;
    const url = new URL(request.url);
    if (url.search) throw new DeviceLinkError("INVALID_REQUEST", 400);
    const path = url.pathname.replace(/^\/api\/link\//, "");
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("ai-city-link="))
      ?.slice("ai-city-link=".length);
    const cookie = (value: string, maxAge: number) => ({
      "Set-Cookie": `ai-city-link=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.protocol === "https:" ? "; Secure" : ""}`,
    });
    if (request.method === "GET") {
      if (path === "admin") return reply(service.adminState(token));
      if (path === "display") return reply(service.display(token));
    }
    if (request.method === "POST") {
      const input = await readJsonBody(request);
      if (path === "bootstrap") {
        if (remoteOrigin || !localBootstrap) throw new DeviceLinkError("LOCAL_ONLY");
        EmptyDevelopmentRequestSchema.parse(input);
        return reply({ key: service.bootstrapKey() });
      }
      if (path === "login" || path === "pair") {
        const next =
          path === "login"
            ? service.login(DeviceLoginSchema.parse(input).key, client.bucket)
            : service.pair(DevicePairSchema.parse(input).code, client.bucket);
        service.logout(token);
        return reply({ mode: "MOCK" }, 200, cookie(next, path === "login" ? 3600 : 28800));
      }
      if (path === "control") return reply(service.update(token, DeviceUpdateSchema.parse(input)));
      if (path === "preset")
        return reply(service.setPreset(token, DevicePresetUpdateSchema.parse(input)));
      if (path === "remove")
        return reply(service.removeResident(token, DeviceRemoveSchema.parse(input).residentId));
      EmptyDevelopmentRequestSchema.parse(input);
      if (path === "pairing") return reply(service.createPairing(token));
      if (path === "revoke") return reply(service.revokeDisplays(token));
      if (path === "logout") {
        service.logout(token);
        return reply({ mode: "MOCK" }, 200, cookie("", 0));
      }
    }
    throw new DeviceLinkError("NOT_FOUND", 404);
  } catch (failure) {
    const invalid = isDevelopmentValidationError(failure);
    const known = failure instanceof DeviceLinkError || failure instanceof DevelopmentServiceError;
    const code = invalid ? "INVALID_REQUEST" : known ? failure.code : "INTERNAL_ERROR";
    return reply(
      {
        mode: "MOCK",
        error: {
          code,
          message: messages[code] ?? "操作を完了できませんでした。接続を確認してください。",
        },
      },
      invalid ? 400 : known ? failure.status : 500,
    );
  }
}

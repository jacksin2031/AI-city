import { participationService } from "../development/runtime";
import { DeviceLinkService } from "./service";

const local = globalThis as typeof globalThis & { aiCityDeviceLink?: DeviceLinkService };
if (process.env.AI_CITY_PUBLIC_ORIGIN && !process.env.AI_CITY_ADMIN_KEY)
  throw new Error("A configured HTTPS service requires AI_CITY_ADMIN_KEY");
local.aiCityDeviceLink ??= new DeviceLinkService(
  participationService,
  process.env.AI_CITY_ADMIN_KEY,
);
export const deviceLinkService = local.aiCityDeviceLink;
export const previewEnabled =
  (process.env.NODE_ENV === "development" || process.env.AI_CITY_ENABLE_LOCAL_MOCK === "1") &&
  (Boolean(process.env.AI_CITY_PUBLIC_ORIGIN) || process.env.AI_CITY_LOOPBACK_PREVIEW === "1");
export function readLinkToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("ai-city-link="))
    ?.slice("ai-city-link=".length);
}

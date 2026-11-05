import type { z } from "zod";
import { DevelopmentErrorSchema } from "./development";
import { DevelopmentApiError } from "./development-client";
import {
  DeviceAdminSchema,
  DeviceBootstrapSchema,
  DeviceDisplaySchema,
  DeviceLoginSchema,
  DeviceOkSchema,
  DevicePairingSchema,
  DevicePairSchema,
  DevicePresetUpdateSchema,
  DeviceRemoveSchema,
  type DeviceUpdate,
  DeviceUpdateSchema,
} from "./device-link";
import {
  FocusNextResponseSchema,
  FocusRequestInputSchema,
  FocusStatusResponseSchema,
} from "./focus-link";
import { VisitorInvitationSchema } from "./visitor";

export function createDeviceClient(options: { signal?: AbortSignal; fetch?: typeof fetch } = {}) {
  async function read<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const deadline = AbortSignal.timeout(4000);
    const response = await (options.fetch ?? fetch)(`/api/link/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const error = DevelopmentErrorSchema.parse(value).error;
      throw new DevelopmentApiError(error.code, response.status, error.message);
    }
    return schema.parse(value);
  }
  return {
    bootstrap: () => read("bootstrap", DeviceBootstrapSchema, {}),
    login: (key: string) => read("login", DeviceOkSchema, DeviceLoginSchema.parse({ key })),
    pair: (code: string) => read("pair", DeviceOkSchema, DevicePairSchema.parse({ code })),
    admin: () => read("admin", DeviceAdminSchema),
    display: () => read("display", DeviceDisplaySchema),
    nextFocus: () => read("focus-next", FocusNextResponseSchema),
    ackFocus: (requestId: string) =>
      read("focus-ack", FocusStatusResponseSchema, FocusRequestInputSchema.parse({ requestId })),
    pairing: () => read("pairing", DevicePairingSchema, {}),
    visitorInvitation: () => read("visitor-invitation", VisitorInvitationSchema, {}),
    update: (input: DeviceUpdate) =>
      read("control", DeviceAdminSchema, DeviceUpdateSchema.parse(input)),
    preset: (input: z.infer<typeof DevicePresetUpdateSchema>) =>
      read("preset", DeviceAdminSchema, DevicePresetUpdateSchema.parse(input)),
    remove: (residentId: string) =>
      read("remove", DeviceAdminSchema, DeviceRemoveSchema.parse({ residentId })),
    revoke: () => read("revoke", DeviceAdminSchema, {}),
    logout: () => read("logout", DeviceOkSchema, {}),
  };
}

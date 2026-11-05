import { z } from "zod";

export const FocusRequestInputSchema = z.strictObject({ requestId: z.uuid() });
export const FocusStatusResponseSchema = z.strictObject({
  mode: z.literal("MOCK"),
  requestId: z.uuid(),
  status: z.enum(["PENDING", "APPLIED", "EXPIRED", "CANCELLED"]),
});
export const FocusNextResponseSchema = z.strictObject({
  mode: z.literal("MOCK"),
  focus: z
    .strictObject({
      requestId: z.uuid(),
      residentId: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/),
    })
    .nullable(),
});
export type FocusStatusResponse = z.infer<typeof FocusStatusResponseSchema>;
export type FocusNextResponse = z.infer<typeof FocusNextResponseSchema>;

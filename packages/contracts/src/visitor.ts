import { z } from "zod";

export const VisitorSessionRequestSchema = z.strictObject({
  invitation: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const VisitorInvitationSchema = z.strictObject({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime({ offset: true }),
});
/** Non-functional fixture only. Never an issued admission credential. */
export const visitorInvitationFixture = VisitorInvitationSchema.parse({
  code: "0".repeat(64),
  expiresAt: "2026-10-19T00:03:00.000Z",
});

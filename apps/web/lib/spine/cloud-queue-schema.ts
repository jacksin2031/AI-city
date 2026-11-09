import { SpineTaskIdSchema } from "@ai-city/contracts/spine";
import { z } from "zod";

export const CLOUD_QUEUE_CAPACITY = 200;
export const CloudPhotoQueueSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tasks: z
    .array(SpineTaskIdSchema)
    .max(CLOUD_QUEUE_CAPACITY)
    .refine((tasks) => new Set(tasks).size === tasks.length),
});

import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";
import { runToolHelper, type ToolPrepareConfig } from "./tool-prepare";

const receiptSchema = z.strictObject({
  status: z.literal("PREPARED"),
  flow: z.string().regex(/^flow-[a-f0-9]{32}$/),
  model_calls: z.literal(0),
});

/** Recover only a verified model-disabled flow; never re-submit or resume a model request. */
export async function recoverToolPreflight(
  config: ToolPrepareConfig,
  jobs: SpineJobs,
  storage: LocalSpineStorage,
  task: string,
) {
  if (![config.python, config.script, config.toolRoot].every(isAbsolute))
    throw new Error("TOOL_CONFIG_INVALID");
  const context = await jobs.preflightRecoveryContext(task);
  if (!context?.photoSha256) return null;
  const photo = await storage.read(task, "photo.png", 24 * 1024 * 1024);
  if (!photo || createHash("sha256").update(photo).digest("hex") !== context.photoSha256)
    throw new Error("PHOTO_CHANGED");
  const workspace = await storage.toolWorkspaceForWorker(task);
  const output = await runToolHelper(
    config.python,
    [config.script, config.toolRoot, workspace, task],
    context.photoSha256,
  );
  let result: z.infer<typeof receiptSchema>;
  try {
    result = receiptSchema.parse(JSON.parse(output));
  } catch {
    throw new Error("TOOL_RECOVERY_INVALID");
  }
  return jobs.recoverPrepared(task, context.owner, result.flow, context.photoSha256);
}

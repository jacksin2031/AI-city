import { isAbsolute } from "node:path";
import { z } from "zod";
import type { LocalSpineStorage } from "./local-storage";
import { runToolHelper } from "./tool-prepare";

const responseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("NOT_READY") }),
  z.strictObject({ status: z.literal("REQUIRES_REVIEW") }),
  z.strictObject({
    status: z.literal("APPROVED"),
    bundle: z.string().regex(/^runtime\/work\/[A-Za-z0-9_/-]+\/export\/bundle$/),
    manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);

/** Read-only review check; the helper independently validates the tool's actual evidence. */
export async function inspectToolTask(
  config: { python: string; script: string; toolRoot: string },
  storage: LocalSpineStorage,
  task: string,
  flow: string,
) {
  if (
    ![config.python, config.script, config.toolRoot].every(isAbsolute) ||
    !/^flow-[a-f0-9]{32}$/.test(flow)
  )
    throw new Error("TOOL_CONFIG_INVALID");
  const workspace = await storage.toolWorkspaceForWorker(task);
  const output = await runToolHelper(
    config.python,
    [config.script, config.toolRoot, workspace, flow],
    "",
  );
  try {
    return responseSchema.parse(JSON.parse(output));
  } catch {
    throw new Error("TOOL_INSPECTION_INVALID");
  }
}

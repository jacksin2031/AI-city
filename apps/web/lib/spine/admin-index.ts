import { SpineTaskIdSchema } from "@ai-city/contracts/spine";

/**
 * A bounded list of opaque task IDs, not photos, owners or consent records.
 * Cloud Run has Firestore get permission but intentionally lacks collection-list permission.
 */
export const SPINE_TASK_INDEX_PATH = "meta/spine-task-index";
export const SPINE_TASK_INDEX_LIMIT = 201;

export function spineTaskIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("tasks" in value)) return [];
  const tasks = value.tasks;
  if (!Array.isArray(tasks)) return [];
  const unique = new Set<string>();
  for (const item of tasks) {
    if (SpineTaskIdSchema.safeParse(item).success) unique.add(item);
  }
  return [...unique].slice(-SPINE_TASK_INDEX_LIMIT);
}

export function addSpineTaskIndex(value: unknown, task: string): { tasks: string[] } {
  // Legacy internal jobs use safe non-UUID IDs. Keep their admission semantics;
  // only publicly valid task IDs can enter the indexed administration view.
  const parsed = SpineTaskIdSchema.safeParse(task);
  if (!parsed.success) return { tasks: spineTaskIds(value) };
  const prior = spineTaskIds(value).filter((id) => id !== parsed.data);
  return { tasks: [...prior, parsed.data].slice(-SPINE_TASK_INDEX_LIMIT) };
}

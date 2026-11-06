import { describe, expect, it } from "vitest";
import { addSpineTaskIndex, SPINE_TASK_INDEX_LIMIT, spineTaskIds } from "./admin-index";

const task = (n: number) => `spine-${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;

describe("bounded Firestore spine task index", () => {
  it("holds only valid, unique, opaque task IDs", () => {
    expect(spineTaskIds({ tasks: [task(1), task(1), "bad", task(2)] })).toEqual([task(1), task(2)]);
    expect(spineTaskIds(null)).toEqual([]);
    expect(spineTaskIds({ tasks: "wrong" })).toEqual([]);
  });

  it("records new jobs and caps history at 201 without losing the latest", () => {
    let index: unknown = null;
    for (let i = 0; i < SPINE_TASK_INDEX_LIMIT + 6; i++) {
      index = addSpineTaskIndex(index, task(i));
    }
    const tasks = spineTaskIds(index);
    expect(tasks).toHaveLength(SPINE_TASK_INDEX_LIMIT);
    expect(tasks[0]).toBe(task(6));
    expect(tasks.at(-1)).toBe(task(SPINE_TASK_INDEX_LIMIT + 5));
    expect(addSpineTaskIndex(index, task(6)).tasks.at(-1)).toBe(task(6));
  });

  it("never indexes an invalid or legacy task ID", () => {
    expect(addSpineTaskIndex(null, "../secret")).toEqual({ tasks: [] });
    expect(addSpineTaskIndex(null, "legacy-1")).toEqual({ tasks: [] });
  });
});

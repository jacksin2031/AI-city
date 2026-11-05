import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSpineStorage } from "./local-storage";

const roots: string[] = [];
async function storage() {
  const root = await mkdtemp(join(tmpdir(), "ai-city-spine-test-"));
  roots.push(root);
  return { root, files: await LocalSpineStorage.open(root) };
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("isolated local Spine storage", () => {
  it("keeps duplicate photos in separate tasks and does not overwrite them", async () => {
    const { files } = await storage();
    const photo = Buffer.from("synthetic image");
    await files.write("task1", "photo.png", photo);
    await files.write("task2", "photo.png", photo);
    await expect(files.write("task1", "photo.png", Buffer.from("different"))).rejects.toThrow();
    await files.remove("task1", "photo.png");
    expect(await files.read("task1", "photo.png", 100)).toBeNull();
    expect(await files.read("task2", "photo.png", 100)).toEqual(photo);
  });
  it("rejects unsafe identifiers and oversized reads", async () => {
    const { files } = await storage();
    await expect(files.write("../escape", "photo.png", Buffer.from("x"))).rejects.toThrow();
    await expect(files.write("CON", "photo.png", Buffer.from("x"))).rejects.toThrow();
    await expect(files.write("task1", "../photo.png", Buffer.from("x"))).rejects.toThrow();
    await files.write("task1", "photo.png", Buffer.from("12345"));
    await expect(files.read("task1", "photo.png", 4)).rejects.toThrow("PRIVATE_FILE_SIZE");
    await files.remove("task1", "absent.png");
  });
  it("does not read or remove a symlink", async () => {
    const { root, files } = await storage();
    await files.write("task1", "original.png", Buffer.from("safe"));
    try {
      await symlink(join(root, "task1", "original.png"), join(root, "task1", "link.png"));
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? ""))
        return;
      throw error;
    }
    await expect(files.read("task1", "link.png", 100)).rejects.toThrow("PRIVATE_FILE_INVALID");
    await expect(files.remove("task1", "link.png")).rejects.toThrow("PRIVATE_FILE_INVALID");
    expect(await files.read("task1", "original.png", 100)).toEqual(Buffer.from("safe"));
  });
});

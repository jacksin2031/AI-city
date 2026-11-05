import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm, unlink } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

const ID = /^[A-Za-z0-9_-]{1,96}$/;
const NAME = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const MAX_ASSET = 32 * 1024 * 1024;

function valid(value: string, pattern: RegExp): boolean {
  return pattern.test(value) && !WINDOWS_RESERVED.test(value);
}

/**
 * Local worker storage, scoped by unpredictable task ID. The operator must provision
 * `root` outside all served directories with OS permissions limited to the service.
 * This does not provide encryption, distributed storage, or cloud access control.
 */
export class LocalSpineStorage {
  private constructor(private readonly root: string) {}

  static async open(directory: string): Promise<LocalSpineStorage> {
    if (!isAbsolute(directory)) throw new Error("PRIVATE_ROOT_INVALID");
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("PRIVATE_ROOT_INVALID");
    const resolved = await realpath(directory);
    return new LocalSpineStorage(resolved);
  }

  private async taskDirectory(task: string, create: boolean): Promise<string> {
    if (!valid(task, ID)) throw new Error("PRIVATE_TASK_INVALID");
    const directory = join(this.root, task);
    if (create)
      await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("PRIVATE_TASK_INVALID");
    const resolved = await realpath(directory);
    if (relative(this.root, resolved) !== task) throw new Error("PRIVATE_TASK_INVALID");
    return directory;
  }

  private async file(task: string, name: string, create: boolean): Promise<string> {
    if (!valid(name, NAME)) throw new Error("PRIVATE_FILE_INVALID");
    return join(await this.taskDirectory(task, create), name);
  }

  /** Never replaces an existing photo or candidate; task IDs cannot share files. */
  async write(task: string, name: string, bytes: Uint8Array): Promise<void> {
    if (!bytes.byteLength || bytes.byteLength > MAX_ASSET) throw new Error("PRIVATE_FILE_SIZE");
    const path = await this.file(task, name, true);
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(path);
      throw error;
    } finally {
      await handle.close().catch(() => {});
    }
  }

  async read(task: string, name: string, maxBytes: number): Promise<Uint8Array | null> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ASSET)
      throw new Error("PRIVATE_FILE_SIZE");
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const path = await this.file(task, name, false);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("PRIVATE_FILE_INVALID");
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) throw new Error("PRIVATE_FILE_SIZE");
      const buffer = Buffer.allocUnsafe(maxBytes + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > maxBytes) throw new Error("PRIVATE_FILE_SIZE");
      return buffer.subarray(0, offset);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    } finally {
      await handle?.close();
    }
  }

  /** Deletes only the explicitly named file; does not traverse or remove other tasks. */
  async remove(task: string, name: string): Promise<void> {
    try {
      const path = await this.file(task, name, false);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("PRIVATE_FILE_INVALID");
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  /** Clean this task's known photo and bundle files, without recursively deleting directories. */
  async removeTaskFiles(task: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(await this.taskDirectory(task, false));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const fixed = new Set([
      "build-manifest.json",
      "skeleton.json",
      "skeleton.atlas",
      "orientation-policy.json",
    ]);
    let unexpected = false;
    for (const name of entries) {
      if (!fixed.has(name) && !(NAME.test(name) && name.endsWith(".png"))) {
        unexpected = true;
        continue;
      }
      await this.remove(task, name);
    }
    if (unexpected) throw new Error("PRIVATE_CLEANUP_INCOMPLETE");
  }

  /** For readPublishedSpineAsset only; that boundary checks the exact public path first. */
  assetReader(task: string) {
    return {
      read: (path: string, maxBytes: number) => {
        const name = path.slice(path.lastIndexOf("/") + 1);
        return this.read(task, name, maxBytes);
      },
    };
  }

  /** Discover only generated task directories; no participant data is included in the listing. */
  async listTasks(): Promise<string[]> {
    const entries = await readdir(this.root, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          /^spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            entry.name,
          ),
      )
      .map((entry) => entry.name)
      .sort();
  }

  /** Internal worker-only path; never return this value from an HTTP endpoint. */
  async privateRootForWorker(task: string): Promise<string> {
    await this.taskDirectory(task, false);
    return this.root;
  }

  async toolWorkspaceForWorker(task: string): Promise<string> {
    const directory = await this.taskDirectory(task, false);
    const workspace = join(directory, "tool-workspace");
    const info = await lstat(workspace);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("PRIVATE_TASK_INVALID");
    const resolved = await realpath(workspace);
    if (relative(directory, resolved) !== "tool-workspace") throw new Error("PRIVATE_TASK_INVALID");
    return resolved;
  }

  /** Only for a withdrawn, model-disabled preflight whose worker has finished. */
  async removePreflightWorkspace(task: string): Promise<void> {
    let workspace: string;
    try {
      workspace = await this.toolWorkspaceForWorker(task);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    // The root is operator-owned and private. Refuse links, including Windows junctions,
    // instead of allowing cleanup to cross into a different task or external directory.
    async function check(directory: string): Promise<void> {
      for (const entry of await readdir(directory)) {
        const path = join(directory, entry);
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error("PRIVATE_CLEANUP_LINK");
        if (info.isDirectory()) await check(path);
        else if (!info.isFile()) throw new Error("PRIVATE_CLEANUP_INVALID");
      }
    }
    await check(workspace);
    await rm(workspace, { recursive: true });
  }
}

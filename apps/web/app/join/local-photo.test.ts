import { describe, expect, it, vi } from "vitest";
import { LocalPhoto } from "./local-photo";

const png = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], "fictional.png", {
    type: "image/png",
  });

describe("local-only photo lifecycle", () => {
  it("accepts a supported image and revokes its local URL on removal", async () => {
    const create = vi.fn(() => "blob:fictional");
    const revoke = vi.fn();
    const local = new LocalPhoto({ create, revoke });
    expect(await local.select(png())).toEqual({ status: "ready", url: "blob:fictional" });
    local.clear();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fictional");
  });
  it("rejects unsupported, mismatched and oversized input without creating a URL", async () => {
    const create = vi.fn(() => "blob:fictional");
    const local = new LocalPhoto({ create, revoke: vi.fn() });
    expect(
      (await local.select(new File(["not-an-image"], "fake.png", { type: "image/png" }))).status,
    ).toBe("invalid");
    expect(
      (await local.select(new File(["data"], "fake.svg", { type: "image/svg+xml" }))).status,
    ).toBe("invalid");
    expect(
      (
        await local.select(
          new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
        )
      ).status,
    ).toBe("too-large");
    expect(create).not.toHaveBeenCalled();
  });
  it("discards a selection that completes after consent is withdrawn", async () => {
    let finish: (bytes: ArrayBuffer) => void = () => {};
    const file = png();
    vi.spyOn(file, "slice").mockReturnValue({
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        }),
    } as Blob);
    const create = vi.fn(() => "blob:fictional");
    const local = new LocalPhoto({ create, revoke: vi.fn() });
    const pending = local.select(file);
    local.clear();
    finish(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer);
    expect((await pending).status).toBe("cancelled");
    expect(create).not.toHaveBeenCalled();
  });
});

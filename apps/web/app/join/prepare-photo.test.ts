import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CAMERA_PHOTO_BYTES,
  PhotoPreparationError,
  prepareUploadPhoto,
  scaledPhotoSize,
  sniffPhotoFormat,
} from "./prepare-photo";

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);
const webp = new Uint8Array([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80]);
const heic = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]);

afterEach(() => vi.unstubAllGlobals());

describe("camera photo preparation", () => {
  it("identifies JPEG, PNG, WebP and HEIC from actual bytes even without a MIME type", () => {
    expect(sniffPhotoFormat(jpeg)).toBe("jpeg");
    expect(sniffPhotoFormat(png)).toBe("png");
    expect(sniffPhotoFormat(webp)).toBe("webp");
    expect(sniffPhotoFormat(heic)).toBe("heif");
    expect(sniffPhotoFormat(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffPhotoFormat(new Uint8Array([0, 0, 0, 0, 102, 116, 121, 112]))).toBeNull();
  });

  it("reduces high-resolution phone photos without enlarging smaller images", () => {
    expect(scaledPhotoSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(scaledPhotoSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(scaledPhotoSize(500, 1000)).toEqual({ width: 500, height: 1000 });
    expect(() => scaledPhotoSize(0, 10)).toThrow(PhotoPreparationError);
  });

  it("rejects empty, invalid and excessively large files before decoding", async () => {
    await expect(prepareUploadPhoto(new File([], "empty.jpg"))).rejects.toMatchObject({
      reason: "invalid",
    });
    await expect(
      prepareUploadPhoto(new File(["not a photograph"], "fake.jpeg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ reason: "invalid" });
    await expect(
      prepareUploadPhoto(
        new File([new Uint8Array(MAX_CAMERA_PHOTO_BYTES + 1)], "oversized.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).rejects.toMatchObject({ reason: "too-large" });
  });

  it("turns an HEIC camera file into a sanitized JPEG even when its MIME is missing", async () => {
    const close = vi.fn();
    const dimensions: Array<[number, number]> = [];
    const drawImage = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 4032,
        height: 3024,
        close,
      })),
    );
    vi.stubGlobal("document", {
      createElement: (name: string) => {
        expect(name).toBe("canvas");
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage }),
          toBlob(callback: (blob: Blob) => void) {
            dimensions.push([this.width, this.height]);
            callback(new Blob([jpeg], { type: "image/jpeg" }));
          },
        };
        return canvas;
      },
    });
    const original = new File([heic], "camera.heic", { type: "" });
    const result = await prepareUploadPhoto(original);
    expect(result.name).toBe("participant-photo.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(jpeg.length);
    expect(dimensions).toEqual([[2048, 1536]]);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not silently upload an undecodable HEIC photo", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw Error("unsupported HEIC");
      }),
    );
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:fixture",
      revokeObjectURL: revoke,
    });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await expect(
      prepareUploadPhoto(new File([heic], "camera.heic", { type: "image/heic" })),
    ).rejects.toMatchObject({ reason: "decode" });
    expect(revoke).toHaveBeenCalledWith("blob:fixture");
  });
});

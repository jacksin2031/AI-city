/** Client-only preparation. Never uploads the camera's original bytes or EXIF metadata. */
export const MAX_UPLOAD_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_CAMERA_PHOTO_BYTES = 32 * 1024 * 1024;
const MAX_EDGE = 2048;

export type PhotoFormat = "jpeg" | "png" | "webp" | "heif";

export class PhotoPreparationError extends Error {
  constructor(public readonly reason: "invalid" | "too-large" | "decode" | "encode") {
    super(reason);
  }
}

/** Verify magic bytes, not the (often empty or incorrect) MIME supplied by phone cameras. */
export function sniffPhotoFormat(header: Uint8Array): PhotoFormat | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
    return "jpeg";
  if (
    header.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)
  )
    return "png";
  if (
    header.length >= 12 &&
    [82, 73, 70, 70].every((byte, index) => header[index] === byte) &&
    [87, 69, 66, 80].every((byte, index) => header[index + 8] === byte)
  )
    return "webp";
  if (
    header.length >= 12 &&
    [102, 116, 121, 112].every((byte, index) => header[index + 4] === byte)
  ) {
    const brand = String.fromCharCode(...header.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand))
      return "heif";
  }
  return null;
}

export function scaledPhotoSize(width: number, height: number, edge = MAX_EDGE) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isSafeInteger(edge) ||
    edge < 1
  )
    throw new PhotoPreparationError("decode");
  const ratio = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function exportJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob?.type === "image/jpeg" ? resolve(blob) : reject(new PhotoPreparationError("encode")),
      "image/jpeg",
      quality,
    );
  });
}

async function decodePhoto(file: File): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  // Browser image decoders apply EXIF orientation before drawing to the JPEG canvas.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Older mobile browsers may decode HEIC only via HTMLImageElement.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new PhotoPreparationError("decode"));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => {
        image.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    image.src = "";
    URL.revokeObjectURL(url);
    throw new PhotoPreparationError("decode");
  }
}

/** Resize to a bounded, metadata-free JPEG that the 8 MiB visitor API can accept. */
export async function prepareUploadPhoto(file: File): Promise<File> {
  if (!file.size) throw new PhotoPreparationError("invalid");
  if (file.size > MAX_CAMERA_PHOTO_BYTES) throw new PhotoPreparationError("too-large");
  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  } catch {
    throw new PhotoPreparationError("invalid");
  }
  if (!sniffPhotoFormat(header)) throw new PhotoPreparationError("invalid");

  const decoded = await decodePhoto(file);
  let canvas: HTMLCanvasElement | null = null;
  try {
    const size = scaledPhotoSize(decoded.width, decoded.height);
    canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new PhotoPreparationError("encode");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(decoded.image, 0, 0, size.width, size.height);
    let blob = await exportJpeg(canvas, 0.86);
    // A highly detailed photo may still be large; reduce further instead of failing upload.
    for (let attempt = 0; blob.size > MAX_UPLOAD_PHOTO_BYTES && attempt < 3; attempt++) {
      const smaller = document.createElement("canvas");
      smaller.width = Math.max(1, Math.round(canvas.width * 0.75));
      smaller.height = Math.max(1, Math.round(canvas.height * 0.75));
      const smallerContext = smaller.getContext("2d", { alpha: false });
      if (!smallerContext) throw new PhotoPreparationError("encode");
      smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      canvas.width = 0;
      canvas.height = 0;
      canvas = smaller;
      blob = await exportJpeg(canvas, 0.8);
    }
    if (!blob.size || blob.size > MAX_UPLOAD_PHOTO_BYTES)
      throw new PhotoPreparationError("too-large");
    return new File([blob], "participant-photo.jpg", { type: "image/jpeg" });
  } catch (error) {
    if (error instanceof PhotoPreparationError) throw error;
    throw new PhotoPreparationError("encode");
  } finally {
    decoded.release();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export function photoPreparationMessage(error: unknown): string {
  if (error instanceof PhotoPreparationError) {
    if (error.reason === "too-large")
      return "写真の容量が大きすぎます。32 MB以下の写真を選んでください。";
    if (error.reason === "decode")
      return "この写真を開けませんでした。HEIC形式の場合は、端末でJPEGに変更して撮影するか、JPEGに変換して選んでください。";
    if (error.reason === "encode")
      return "写真を送信用に変換できませんでした。別の写真でお試しください。";
  }
  return "写真を読み取れませんでした。JPEG・PNG・WebP・HEICの写真を選んでください。";
}

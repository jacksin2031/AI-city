import sharp from "sharp";
import { getSession } from "../../../lib/server/residents";
import { readSessionId } from "../../../lib/server/session";
import { getStore } from "../../../lib/server/store";

const MAX_BYTES = 8 * 1024 * 1024;

function looksLikeImage(b: Buffer) {
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return jpeg || png || webp;
}

export async function POST(request: Request) {
  const sid = await readSessionId();
  const session = sid ? await getSession(sid) : null;
  if (!sid || !session) return Response.json({ error: "no_session" }, { status: 401 });
  if (!session.consent.photo)
    return Response.json({ error: "photo_consent_required" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return Response.json({ error: "missing_photo" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(bytes)) return Response.json({ error: "unsupported_type" }, { status: 415 });
  try {
    // Re-encode: strips EXIF/GPS metadata and caps the size before anything leaves this process.
    const clean = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    await getStore().putBlob("private", `photos/${sid}.jpg`, clean, "image/jpeg");
  } catch {
    return Response.json({ error: "invalid_image" }, { status: 422 });
  }
  return Response.json({ ok: true });
}

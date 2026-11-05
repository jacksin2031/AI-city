import { createHash } from "node:crypto";
import { SpineBundleSchema } from "@ai-city/contracts";
import { z } from "zod";

type Descriptor = z.infer<typeof SpineBundleSchema>;

const manifestSchema = z.object({
  runtime: z.object({
    package: z.literal("@esotericsoftware/spine-canvas"),
    version: z.string().regex(/^4\.3\.\d+$/),
  }),
  runtime_guard_required: z.literal(true),
  files: z.record(
    z.string().regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});

/** Checks the public subset only; full tool verification and authorization are separate gates. */
export function verifySpineBundle(
  descriptor: Descriptor,
  manifestBytes: Uint8Array,
  assets: Record<string, Uint8Array | undefined>,
): boolean {
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  if (
    !SpineBundleSchema.safeParse(descriptor).success ||
    manifestBytes.byteLength > 1024 * 1024 ||
    hash(manifestBytes) !== descriptor.sha256
  )
    return false;
  try {
    const parsed = manifestSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)),
    );
    if (!parsed.success) return false;
    const names = [
      descriptor.skeleton,
      descriptor.atlas,
      descriptor.orientationPolicy,
      ...descriptor.pages,
    ].map((path) => path.split("/").at(-1) ?? "");
    if (new Set(names).size !== names.length || Object.keys(assets).length !== names.length)
      return false;
    return names.every((name) => {
      const content = assets[name];
      return (
        content !== undefined &&
        content.byteLength <= 32 * 1024 * 1024 &&
        parsed.data.files[name] === hash(content)
      );
    });
  } catch {
    return false;
  }
}

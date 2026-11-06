import { validateRequestOrigin } from "../development/http";
import type { SpineJobs } from "./jobs";
import { type PrivateSpineAssets, readPublishedSpineAsset } from "./published-assets";

/** Anything that can hand out a read-only reader for one task (local disk or private cloud bucket). */
export interface SpineAssetSource {
  assetReader(task: string): PrivateSpineAssets;
}

/**
 * Delivery from private storage: every response rechecks current publication and byte hashes.
 * `remoteOrigin` is the configured HTTPS origin when hosted; local runs pass nothing.
 */
export async function handleSpineAsset(
  request: Request,
  jobs: SpineJobs | null,
  storage: SpineAssetSource | null,
  remoteOrigin?: string,
) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  let phase: "origin" | "read" = "origin";
  try {
    if (!jobs || !storage || request.method !== "GET")
      return new Response(null, { status: 404, headers });
    validateRequestOrigin(request, remoteOrigin);
    const url = new URL(request.url);
    if (url.search) return new Response(null, { status: 404, headers });
    const match =
      /^\/avatars\/(spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:png|json|atlas)$/.exec(
        url.pathname,
      );
    if (!match?.[1]) return new Response(null, { status: 404, headers });
    phase = "read";
    const bytes = await readPublishedSpineAsset(
      jobs,
      match[1],
      url.pathname,
      storage.assetReader(match[1]),
    );
    if (!bytes) {
      // The descriptor may have been withdrawn or an asset may be missing/corrupt.
      // Never expose task IDs or private storage details to public clients.
      console.warn("[spine-asset] Published bundle asset unavailable");
      return new Response(null, { status: 404, headers });
    }
    const contentType = url.pathname.endsWith(".png")
      ? "image/png"
      : url.pathname.endsWith(".json")
        ? "application/json"
        : "text/plain; charset=utf-8";
    return new Response(Uint8Array.from(bytes), {
      headers: { ...headers, "Content-Type": contentType },
    });
  } catch (error) {
    const code =
      error instanceof Error &&
      /^(CLOUD_ASSET_[A-Z_]+|SESSION_EXPIRED|INVALID_TRANSITION|LOCAL_ONLY)$/.test(error.message)
        ? error.message
        : "UNEXPECTED";
    console.error(`[spine-asset] ${phase} failed: ${code}`);
    return new Response(null, { status: 404, headers });
  }
}

/** Kept for the local emulator tests and callers that only know the local adapter. */
export const handleLocalSpineAsset = handleSpineAsset;

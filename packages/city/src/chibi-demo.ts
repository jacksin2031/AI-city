import {
  AssetManager,
  AtlasAttachmentLoader,
  SkeletonJson,
  type TextureAtlas,
} from "@esotericsoftware/spine-canvas";
import type { AnimatedCharacter } from "./animated-character";
import { createSpinePlayer } from "./spine-player";

/** The official sample names left and right from the character's perspective. */
export function chibiAnimationForScreen(animation: string): string {
  if (animation.endsWith("-left")) return `${animation.slice(0, -5)}-right`;
  if (animation.endsWith("-right")) return `${animation.slice(0, -6)}-left`;
  return animation;
}

/** Official Chibi Stickers, noncommercial example only. The caller owns the lifetime. */
export async function loadChibiDemo(signal: AbortSignal) {
  const manager = new AssetManager("/chibi-demo/");
  try {
    const [json, atlas] = await Promise.all([
      manager.loadJsonAsync("chibi-stickers.json"),
      manager.loadTextureAtlasAsync("chibi-stickers.atlas"),
    ]);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const data = new SkeletonJson(
      new AtlasAttachmentLoader(atlas as TextureAtlas),
    ).readSkeletonData(json);
    let disposed = false;
    return {
      create(skin = "spineboy"): AnimatedCharacter {
        if (disposed) throw new Error("DEMO_DISPOSED");
        // The official sample already contains its own direction-specific attachment timelines.
        const player = createSpinePlayer(data, document.createElement("canvas"), () => {}, skin);
        return {
          canvas: player.canvas,
          advance(animation, direction, seconds) {
            player.advance(chibiAnimationForScreen(animation), direction, seconds);
          },
          dispose: () => player.dispose(),
        };
      },
      dispose() {
        if (!disposed) {
          disposed = true;
          releaseManager(manager);
        }
      },
    };
  } catch (error) {
    releaseManager(manager);
    throw error;
  }
}

// Releasing an AssetManager mid-load can throw inside spine-webgl; never let cleanup crash the page.
function releaseManager(manager: { dispose(): void }) {
  try {
    manager.dispose();
  } catch {
    // Partially loaded assets are discarded with the page.
  }
}

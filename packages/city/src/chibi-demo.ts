import {
  AssetManager,
  AtlasAttachmentLoader,
  SkeletonJson,
  type TextureAtlas,
} from "@esotericsoftware/spine-canvas";
import { createSpinePlayer } from "./spine-player";

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
      create() {
        if (disposed) throw new Error("DEMO_DISPOSED");
        // The official sample already contains its own direction-specific attachment timelines.
        return createSpinePlayer(data, document.createElement("canvas"), () => {}, "spineboy");
      },
      dispose() {
        if (!disposed) {
          disposed = true;
          manager.dispose();
        }
      },
    };
  } catch (error) {
    manager.dispose();
    throw error;
  }
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./photo-upload-setting.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("./controller.tsx", import.meta.url), "utf8");

describe("admin photo upload setting integration", () => {
  it("mounts the admin-only photo control in the authenticated admin layout", () => {
    expect(controller).toContain("<PhotoUploadSetting");
    expect(controller.indexOf("<PhotoUploadSetting")).toBeGreaterThan(
      controller.indexOf("!state ?"),
    );
    expect(panel).toContain("api.photoUploadSettings()");
  });
  it("exposes an accessible guarded toggle with Japanese feedback", () => {
    expect(panel).toContain("aria-pressed={on}");
    expect(panel).toContain("disabled={loading || saving || !settings}");
    expect(panel).toContain("api.setPhotoUploadAllowed(requested)");
    expect(panel).toContain("写真アップロードの受付");
    expect(panel).toContain("AI会話の設定とは別です");
  });
});

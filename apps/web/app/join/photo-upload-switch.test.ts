import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const flow = readFileSync(new URL("./spine-flow.tsx", import.meta.url), "utf8");
const paused = readFileSync(new URL("./photo-upload-paused.tsx", import.meta.url), "utf8");
const preset = readFileSync(new URL("./participant-experience.tsx", import.meta.url), "utf8");

describe("photo upload switch integration", () => {
  it("takes a server-side setting into the hosted join flow", () => {
    expect(page).toContain("await photoUploadAllowedForPages()");
    expect(page).toContain("initialUploadAllowed={uploadAllowed}");
    expect(page).toContain("spineCloud && uploadAllowed");
  });
  it("re-checks the live switch and refuses client upload when OFF", () => {
    expect(flow).toContain('fetch("/api/visitor/photo-upload-settings"');
    expect(flow).toContain("UPLOAD_POLL_MS");
    expect(flow).toContain("document.visibilityState");
    expect(flow).toContain("if (!uploadAllowed || !(await readUploadAllowed()))");
    expect(flow).toContain('failure.code === "PHOTO_UPLOAD_DISABLED"');
  });
  it("always shows nickname input while photo upload is paused", () => {
    expect(flow).toContain('{stage === "name" && (');
    expect(flow).not.toContain('stage === "name" && uploadAllowed');
    expect(preset).toContain('useState<Stage>("name")');
    expect(preset).toContain('onClick={() => setStage(presetOnly ? "custom" : "photo")}');
    expect(preset).toContain("nickname: nickname.trim()");
  });
  it("shows a Japanese paused state with the preset resident fallback", () => {
    expect(paused).toContain("現在、写真の受付を停止しています");
    expect(paused).toContain('href="/join?mode=sample"');
    expect(paused).toContain('role="status"');
    expect(paused).not.toContain('type="file"');
  });
});

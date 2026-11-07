import { describe, expect, it } from "vitest";
import {
  classifyPrepareFailure,
  classifyToolFailure,
  interpretToolOutput,
  liveDisposition,
  toolEnvironment,
} from "./tool-live";

describe("safe Spine failure diagnostic codes", () => {
  it("passes only approved proxy, preview, and system variables to Codex", () => {
    const source: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: "/vm/codex/bin",
      https_proxy: "http://user:password@private-proxy:1234",
      HTTPS_PROXY: "http://user:password@private-proxy:1234",
      NO_PROXY: "localhost",
      AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH: "1",
      AI_CITY_VISITOR_NAMESPACE: "preview-staging-20261107",
      GOOGLE_APPLICATION_CREDENTIALS: "/private/workload-key.json",
      XAI_API_KEY: "do-not-leak",
      GITHUB_TOKEN: "do-not-leak",
    };
    const passed = toolEnvironment(source);
    expect(passed).toMatchObject({
      PATH: "/vm/codex/bin",
      https_proxy: source.https_proxy,
      HTTPS_PROXY: source.HTTPS_PROXY,
      NO_PROXY: source.NO_PROXY,
      AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH: "1",
      AI_CITY_VISITOR_NAMESPACE: "preview-staging-20261107",
    });
    expect(passed.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(passed.XAI_API_KEY).toBeUndefined();
    expect(passed.GITHUB_TOKEN).toBeUndefined();
  });
  it("classifies fixed prepare phases without leaking Python errors", () => {
    const failure = (phase: string) =>
      Object.assign(new Error("TOOL_PREPARATION_FAILED"), { phase });
    expect(classifyPrepareFailure(failure("WORKSPACE"))).toBe("PREPARE_WORKSPACE_FAILED");
    expect(classifyPrepareFailure(failure("REFERENCE_VERIFY"))).toBe("PREPARE_REFERENCE_FAILED");
    expect(classifyPrepareFailure(failure("PHOTO_IMPORT"))).toBe("PREPARE_PHOTO_FAILED");
    expect(classifyPrepareFailure(failure("FLOW_CREATE"))).toBe("PREPARE_FLOW_FAILED");
    expect(classifyPrepareFailure(failure("RECEIPT"))).toBe("PREPARE_RECEIPT_FAILED");
    expect(classifyPrepareFailure(failure("private/path/secret"))).toBe("TOOL_PREPARATION_FAILED");
  });
  it("never treats incomplete or blocked pipeline states as reviewable output", () => {
    for (const status of [
      "FAILED",
      "ERROR_OR_RESULT_UNKNOWN",
      "WAIT_RESULT",
      "OUTPUT_BLOCKED",
      "CONFIGURATION_BLOCKED",
      "CANCELLED",
      "STALE",
      "LIMIT_REACHED",
    ])
      expect(liveDisposition(status, false, false)).toBe("UNKNOWN");
    expect(liveDisposition("REQUIRES_REVIEW", false, false)).toBe("UNKNOWN");
    expect(liveDisposition("REQUIRES_REVIEW", true, true)).toBe("REQUIRES_REVIEW");
    expect(liveDisposition("READY_FOR_REVIEWED_EXPORT", true, false)).toBe("REQUIRES_REVIEW");
    expect(liveDisposition("READY_FOR_REVIEWED_EXPORT", true, true)).toBe("APPROVED");
    expect(liveDisposition("READY_FOR_REVIEWED_EXPORT", false, true)).toBe("UNKNOWN");
  });
  it("classifies known model failures without exposing raw tool error strings", () => {
    expect(classifyToolFailure("CODEX_CHATGPT_LOGIN_REQUIRED")).toBe("MODEL_LOGIN_REQUIRED");
    expect(classifyToolFailure("CODEX_SUBSCRIPTION_LIMIT_REACHED")).toBe("MODEL_QUOTA_REACHED");
    expect(classifyToolFailure("CODEX_EXEC_FAILED_NO_RETRY")).toBe("MODEL_EXECUTION_FAILED");
    expect(classifyToolFailure("TOOL_LIVE_INVALID")).toBe("TOOL_LIVE_INVALID");
  });
  it("preserves a structured reason on Python exit 1 without echoing stderr", () => {
    const failure = {
      status: "FAILED",
      phase: "PIPELINE_ADVANCE",
      error_code: "CODEX_CHATGPT_LOGIN_REQUIRED",
    };
    expect(interpretToolOutput(JSON.stringify(failure), 1)).toEqual(failure);
    expect(() => interpretToolOutput('{"status":"QUEUED"}', 1)).toThrow("TOOL_LIVE_EXIT");
    expect(() => interpretToolOutput("private trace", 1)).toThrow("TOOL_LIVE_INVALID");
  });
  it("never emits private or unpredictable content", () => {
    expect(classifyToolFailure("Bearer TOKEN_SUPER_SECRET")).toBe("TOOL_PIPELINE_FAILED");
    expect(classifyToolFailure("C:\\private\\participant.jpg")).toBe("TOOL_PIPELINE_FAILED");
    expect(classifyToolFailure(null)).toBe("TOOL_PIPELINE_FAILED");
  });
});

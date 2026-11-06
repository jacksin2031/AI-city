import { describe, expect, it } from "vitest";
import { classifyToolFailure, interpretToolOutput } from "./tool-live";

describe("safe Spine failure diagnostic codes", () => {
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

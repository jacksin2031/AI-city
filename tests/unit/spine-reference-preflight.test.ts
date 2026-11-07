import { describe, expect, it } from "vitest";
import { classifyReferencePreflight } from "../../scripts/spine-reference-preflight";

describe("Spine reference validation before starting worker heartbeat", () => {
  it("allows only the exact ready response", () => {
    expect(
      classifyReferencePreflight(
        0,
        JSON.stringify({
          status: "READY",
          code: "NONE",
          expected_files: 221,
          missing_files: 0,
        }),
      ),
    ).toBe("NONE");
    expect(classifyReferencePreflight(1, '{"status":"READY","code":"NONE"}')).toBe(
      "REFERENCE_PREFLIGHT_INVALID",
    );
  });
  it("propagates only safe static failure codes", () => {
    expect(
      classifyReferencePreflight(1, '{"status":"BROKEN","code":"REFERENCE_FILE_MISSING"}'),
    ).toBe("REFERENCE_FILE_MISSING");
    expect(
      classifyReferencePreflight(1, '{"status":"BROKEN","code":"REFERENCE_ASSET_CHANGED"}'),
    ).toBe("REFERENCE_ASSET_CHANGED");
    expect(classifyReferencePreflight(1, '{"status":"BROKEN","code":"REFERENCE_LINK"}')).toBe(
      "REFERENCE_LINK",
    );
  });
  it("does not leak private paths or arbitrary diagnostics", () => {
    expect(classifyReferencePreflight(1, "C:\\private\\person.png")).toBe(
      "REFERENCE_PREFLIGHT_INVALID",
    );
    expect(classifyReferencePreflight(1, '{"status":"BROKEN","code":"secret bearer"}')).toBe(
      "REFERENCE_PREFLIGHT_INVALID",
    );
    expect(classifyReferencePreflight(null, "")).toBe("REFERENCE_PREFLIGHT_INVALID");
  });
});

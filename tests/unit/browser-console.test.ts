import { expect, it } from "vitest";
import { isKnownCiDriverWarning } from "../helpers/browser-console";

it("records only the observed CI driver warning and never hides page, CSP or other warnings", () => {
  const known =
    "[.WebGL-0x31a4001d2000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";
  expect(isKnownCiDriverWarning("warning", known, true)).toBe(true);
  expect(isKnownCiDriverWarning("warning", known, false)).toBe(false);
  expect(isKnownCiDriverWarning("error", known, true)).toBe(false);
  expect(isKnownCiDriverWarning("warning", "WebGL context lost", true)).toBe(false);
  expect(isKnownCiDriverWarning("warning", "Refused to execute script because of CSP", true)).toBe(
    false,
  );
  expect(isKnownCiDriverWarning("warning", `${known} unexpected error`, true)).toBe(false);
});

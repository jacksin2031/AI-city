import { describe, expect, it } from "vitest";
import { pairingCodeProblem } from "./pairing-code";

describe("pairingCodeProblem", () => {
  it("accepts exactly eight digits", () => {
    expect(pairingCodeProblem("12345678")).toBe("");
  });
  it.each(["", "1234567", "123456789", "12ab5678", "１２３４５６７８"])(
    "rejects %j with a Japanese message",
    (code) => {
      const message = pairingCodeProblem(code);
      expect(message).toMatch(/[ぁ-んァ-ン一-龥]/);
      expect(message).not.toMatch(/[A-Za-z]{3,}/);
    },
  );
  it("never echoes the code", () => {
    expect(pairingCodeProblem("12ab5678")).not.toContain("12ab5678");
  });
});

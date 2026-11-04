import { describe, expect, it } from "vitest";
import { FocusBroker, focusTarget } from "./focus";

describe("visitor focus authorization", () => {
  it("selects only the visitor's published resident currently in the display roster", () => {
    expect(
      focusTarget({ publication: "PUBLISHED", resident: { residentId: "self" } }, [
        "self",
        "other",
      ]),
    ).toBe("self");
  });
  it("rejects unpublished, removed and absent residents", () => {
    expect(
      focusTarget({ publication: "PRIVATE", resident: { residentId: "self" } }, ["self"]),
    ).toBeNull();
    expect(focusTarget({ publication: "REMOVED", resident: null }, ["self"])).toBeNull();
    expect(
      focusTarget({ publication: "PUBLISHED", resident: { residentId: "self" } }, ["other"]),
    ).toBeNull();
  });
});

it("expires focus requests and never reuses an identifier", () => {
  let now = 1000;
  const broker = new FocusBroker(() => now);
  const first = broker.publish("self");
  expect(broker.current()).toEqual(first);
  const second = broker.publish("other");
  expect(second.id).not.toBe(first.id);
  now += 10001;
  expect(broker.current()).toBeNull();
});

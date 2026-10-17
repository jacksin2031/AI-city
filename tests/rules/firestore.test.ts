import { readFileSync } from "node:fs";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080")
    throw new Error("Requires the local demo emulator, never a live database");
  environment = await initializeTestEnvironment({
    projectId: "demo-ai-city",
    firestore: { rules: readFileSync("infra/firestore.rules", "utf8") },
  });
});
afterAll(async () => {
  await environment?.cleanup();
});

describe("foundation fails closed", () => {
  it.each(["privateSessions/s1", "publicResidents/r1", "events/e1"])(
    "denies anonymous reads of %s",
    async (path) => {
      await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
    },
  );
  it.each(["privateSessions/s1", "publicResidents/r1"])(
    "denies authenticated writes of %s before business rules exist",
    async (path) => {
      await assertFails(
        setDoc(doc(environment.authenticatedContext("fixture-user").firestore(), path), {
          nickname: "そら",
        }),
      );
    },
  );
});

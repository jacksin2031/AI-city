import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

// Paths the plan expects to exist later. Until business rules are written, all of them stay closed.
const paths = [
  "privateSessions/s1",
  "privateSessions/s1/answers/a1",
  "generationJobs/j1",
  "publicResidents/r1",
  "events/e1",
  "events/e1/cityEvents/c1",
  "admin/config",
  "visitorExhibitions/sample-exhibition/meta/state",
  "visitorExhibitions/sample-exhibition/sessions/fixture-digest",
  "visitorExhibitions/sample-exhibition/jobs/fixture-digest",
];

const clients: [string, () => RulesTestContext][] = [
  ["anonymous", () => environment.unauthenticatedContext()],
  ["signed-in visitor", () => environment.authenticatedContext("fixture-user")],
  [
    "signed-in user claiming admin",
    () => environment.authenticatedContext("fixture-admin", { admin: true }),
  ],
];

describe("foundation fails closed", () => {
  // Seed data with rules disabled so denials prove the rules, not missing documents.
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (admin) => {
      for (const path of paths) await setDoc(doc(admin.firestore(), path), { nickname: "そら" });
    });
  });

  it("can see the seeded data when rules are bypassed", async () => {
    await environment.withSecurityRulesDisabled(async (admin) => {
      const snapshot = await assertSucceeds(getDoc(doc(admin.firestore(), "publicResidents/r1")));
      expect(snapshot.exists()).toBe(true);
    });
  });

  describe.each(clients)("%s", (_name, context) => {
    it.each(paths)("cannot read %s", async (path) => {
      await assertFails(getDoc(doc(context().firestore(), path)));
    });
    it.each(paths)("cannot overwrite, update or delete %s", async (path) => {
      const ref = doc(context().firestore(), path);
      await assertFails(setDoc(ref, { nickname: "はる" }));
      await assertFails(updateDoc(ref, { nickname: "はる" }));
      await assertFails(deleteDoc(ref));
    });
    it.each([
      "privateSessions",
      "publicResidents",
      "events",
      "visitorExhibitions/sample-exhibition/sessions",
    ])("cannot list or add to %s", async (name) => {
      const ref = collection(context().firestore(), name);
      await assertFails(getDocs(ref));
      await assertFails(addDoc(ref, { nickname: "はる" }));
    });
  });

  it("does not let a client forge consent on a public resident", async () => {
    await assertFails(
      setDoc(
        doc(environment.authenticatedContext("fixture-user").firestore(), "publicResidents/r2"),
        {
          residentId: "r2",
          publicConsent: true,
        },
      ),
    );
  });
});

import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Emulator coverage only. The real GCS buckets are guarded by IAM, see docs/CLOUD.md.
let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9199")
    throw new Error("Requires the local demo storage emulator, never a live bucket");
  environment = await initializeTestEnvironment({
    projectId: "demo-ai-city",
    storage: { rules: readFileSync("infra/storage.rules", "utf8") },
  });
});
afterAll(async () => {
  await environment?.cleanup();
});

const buckets = [undefined, "gs://ai-city-511822-private", "gs://ai-city-511822-assets"];
const paths = ["uploads/s1/photo.jpg", "avatars/r1/front.png"];

const clients: [string, () => RulesTestContext][] = [
  ["anonymous", () => environment.unauthenticatedContext()],
  ["signed-in visitor", () => environment.authenticatedContext("fixture-user")],
  [
    "signed-in user claiming admin",
    () => environment.authenticatedContext("fixture-admin", { admin: true }),
  ],
];

describe("storage foundation fails closed", () => {
  // Seed objects with rules disabled so denials prove the rules, not missing files.
  beforeEach(async () => {
    await environment.clearStorage();
    await environment.withSecurityRulesDisabled(async (admin) => {
      for (const bucket of buckets)
        for (const path of paths)
          await assertSucceeds(admin.storage(bucket).ref(path).putString("fixture"));
    });
  });

  describe.each(clients)("%s", (_name, context) => {
    describe.each(buckets.map((bucket) => [bucket ?? "default bucket", bucket]))(
      "%s",
      (_label, bucket) => {
        it.each(paths)("cannot read %s", async (path) => {
          await assertFails(context().storage(bucket).ref(path).getDownloadURL());
        });
        it.each(paths)("cannot overwrite or delete %s", async (path) => {
          const ref = context().storage(bucket).ref(path);
          await assertFails(ref.putString("replaced"));
          await assertFails(ref.delete());
        });
        it("cannot list objects", async () => {
          await assertFails(context().storage(bucket).ref("uploads").listAll());
        });
      },
    );
  });
});

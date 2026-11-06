import { Firestore } from "@google-cloud/firestore";
import { visitorConfig } from "../visitor/config";

/** Dialogue written by the local worker for one pair of fictional residents. */
export type StoredDialogue = { lines: { residentId: string; text: string }[]; createdAt: number };
export type StoredDialogueReader = (pairKey: string) => Promise<StoredDialogue | null>;

export const dialoguePairKey = (a: string, b: string) => [a, b].sort().join("__");

/**
 * Read-only access to `visitorExhibitions/<namespace>/dialogues/<pair>`.
 * Enabled only when the approved Firestore exhibition configuration exists; otherwise null,
 * so local mock runs never touch the cloud. Nothing is sent to any model from here.
 */
export function createStoredDialogueReader(
  env: Record<string, string | undefined> = process.env,
): StoredDialogueReader | null {
  if (env.AI_CITY_DIALOGUE_STORED !== "1") return null;
  const config = visitorConfig(env);
  if (!config) return null;
  const db = new Firestore({ projectId: config.projectId, preferRest: !config.emulator });
  return async (pairKey) => {
    if (!/^[A-Za-z0-9_-]{1,128}__[A-Za-z0-9_-]{1,128}$/.test(pairKey)) return null;
    const snapshot = await db
      .doc(`visitorExhibitions/${config.namespace}/dialogues/${pairKey}`)
      .get();
    const data = snapshot.data();
    if (!data || !Array.isArray(data.lines) || typeof data.createdAt !== "number") return null;
    return { lines: data.lines, createdAt: data.createdAt };
  };
}

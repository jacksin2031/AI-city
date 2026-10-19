import { createHash } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { visitorConfig } from "./config";
import { createVisitorBoundary, type VisitorBoundary } from "./credentials";
import { FirestoreVisitorStore } from "./firestore";
import { VisitorService } from "./service";

const state = globalThis as typeof globalThis & {
  aiCityVisitors?: { key: string; service: VisitorService; security: VisitorBoundary };
};
export const visitorsEnabled = process.env.AI_CITY_ENABLE_VISITORS === "1";
export function getVisitorService(): VisitorService | null {
  const config = visitorConfig(process.env);
  if (!config) return null;
  const key = JSON.stringify([
    config.projectId,
    config.namespace,
    config.emulator,
    process.env.FIRESTORE_EMULATOR_HOST,
    createHash("sha256").update(config.hmacKey).digest("hex"),
  ]);
  if (!state.aiCityVisitors || state.aiCityVisitors.key !== key) {
    const db = new Firestore({ projectId: config.projectId, preferRest: true });
    state.aiCityVisitors = {
      key,
      service: new VisitorService(new FirestoreVisitorStore(db, config.namespace)),
      security: createVisitorBoundary(config.hmacKey, config.namespace),
    };
  }
  return state.aiCityVisitors.service;
}
export function getVisitorBoundary(): VisitorBoundary | null {
  getVisitorService();
  return state.aiCityVisitors?.security ?? null;
}

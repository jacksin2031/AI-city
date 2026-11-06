import { createHash } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { SpineJobs } from "../spine/jobs";
import { visitorConfig } from "./config";
import { createVisitorBoundary, type VisitorBoundary } from "./credentials";
import { FirestoreVisitorStore } from "./firestore";
import { VisitorService } from "./service";

const state = globalThis as typeof globalThis & {
  aiCityVisitors?: {
    key: string;
    service: VisitorService;
    security: VisitorBoundary;
    store: FirestoreVisitorStore;
  };
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
  if (!state.aiCityVisitors || state.aiCityVisitors.key !== key || !state.aiCityVisitors.store) {
    // The emulator uses unauthenticated insecure gRPC. REST fallback still discovers ADC.
    const db = new Firestore({ projectId: config.projectId, preferRest: !config.emulator });
    const store = new FirestoreVisitorStore(db, config.namespace);
    state.aiCityVisitors = {
      key,
      store,
      service: new VisitorService(store),
      security: createVisitorBoundary(config.hmacKey, config.namespace),
    };
  }
  return state.aiCityVisitors.service;
}

/** Shared store for exhibit device sessions; null when persistence is not configured. */
export function getVisitorStore(): FirestoreVisitorStore | null {
  return getVisitorService() ? (state.aiCityVisitors?.store ?? null) : null;
}

export function getSpineJobs(): SpineJobs | null {
  if (!getVisitorService()) return null;
  return state.aiCityVisitors?.store ? new SpineJobs(state.aiCityVisitors.store) : null;
}
/** Server-side read for pages. Fails closed: an unreadable setting never opens photo upload. */
export async function photoUploadAllowedForPages(): Promise<boolean> {
  try {
    return (await getVisitorService()?.photoUploadAllowed()) ?? false;
  } catch {
    return false;
  }
}
export function getVisitorBoundary(): VisitorBoundary | null {
  getVisitorService();
  return state.aiCityVisitors?.security ?? null;
}

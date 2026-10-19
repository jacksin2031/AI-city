export type VisitorConfig = {
  projectId: string;
  namespace: string;
  emulator: boolean;
  hmacKey: string;
};
export function visitorConfig(env: Record<string, string | undefined>): VisitorConfig | null {
  if (env.AI_CITY_ENABLE_VISITORS !== "1") return null;
  if (env.AI_CITY_ENABLE_LOCAL_MOCK !== "1")
    throw new Error("Persistent fictional visitors require the mock exhibition APIs");
  const hmacKey = env.AI_CITY_VISITOR_HMAC_KEY;
  if (!hmacKey || hmacKey.length < 32 || hmacKey.length > 256)
    throw new Error("Persistent visitors require a stable 32–256 character signing key");
  const projectId = env.AI_CITY_VISITOR_PROJECT_ID;
  const namespace = env.AI_CITY_VISITOR_NAMESPACE ?? "sample-exhibition";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(namespace)) throw new Error("Invalid visitor namespace");
  if (env.FIRESTORE_EMULATOR_HOST) {
    const match = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/.exec(env.FIRESTORE_EMULATOR_HOST);
    if (
      !match ||
      Number(match[1]) < 1 ||
      Number(match[1]) > 65535 ||
      projectId !== "demo-ai-city" ||
      env.AI_CITY_LOOPBACK_PREVIEW !== "1" ||
      env.AI_CITY_PUBLIC_ORIGIN
    ) {
      throw new Error("Visitor emulator requires a loopback demo-only configuration");
    }
    return { projectId, namespace, emulator: true, hmacKey };
  }
  if (projectId !== "ai-city-511822" || env.AI_CITY_VISITOR_ALLOW_CLOUD !== "1") {
    throw new Error("Cloud visitor storage requires an explicit approved project and opt-in");
  }
  if (!env.AI_CITY_VISITOR_NAMESPACE)
    throw new Error("Cloud visitors require an explicit exhibition namespace");
  if (
    !env.AI_CITY_ADMIN_KEY ||
    env.AI_CITY_ADMIN_KEY.length < 32 ||
    env.AI_CITY_ADMIN_KEY.length > 256
  )
    throw new Error("Cloud visitors require a stable administrator key");
  const origin = new URL(env.AI_CITY_PUBLIC_ORIGIN ?? "");
  if (
    origin.protocol !== "https:" ||
    origin.origin !== env.AI_CITY_PUBLIC_ORIGIN ||
    origin.username ||
    origin.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  ) {
    throw new Error("Cloud visitor storage requires an exact HTTPS origin");
  }
  return { projectId, namespace, emulator: false, hmacKey };
}

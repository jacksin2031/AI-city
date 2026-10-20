import Admin from "./controller";
export const dynamic = "force-dynamic";
export default function AdminPage() {
  return (
    <Admin
      persistent={process.env.AI_CITY_ENABLE_VISITORS === "1"}
      codeFree={process.env.AI_CITY_VISITOR_CODE_FREE === "1"}
    />
  );
}

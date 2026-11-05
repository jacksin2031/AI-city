import { notFound } from "next/navigation";
import { getLocalSpineStorage } from "../../../lib/spine/local-runtime";
import { SpinePhotoPanel } from "./photo-panel";

export const dynamic = "force-dynamic";

export default async function SpinePhotoPage() {
  if (!(await getLocalSpineStorage())) notFound();
  return <SpinePhotoPanel codeFree={process.env.AI_CITY_VISITOR_CODE_FREE === "1"} />;
}

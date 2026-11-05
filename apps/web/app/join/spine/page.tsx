import { notFound } from "next/navigation";
import { getCloudSpine } from "../../../lib/spine/cloud-runtime";
import { getLocalSpineStorage } from "../../../lib/spine/local-runtime";
import { SpinePhotoPanel } from "./photo-panel";

export const dynamic = "force-dynamic";

export default async function SpinePhotoPage() {
  const cloud = getCloudSpine() !== null;
  if (!cloud && !(await getLocalSpineStorage())) notFound();
  return <SpinePhotoPanel codeFree={process.env.AI_CITY_VISITOR_CODE_FREE === "1"} cloud={cloud} />;
}

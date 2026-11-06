import { notFound } from "next/navigation";
import { getCloudSpine } from "../../../lib/spine/cloud-runtime";
import { getLocalSpineStorage } from "../../../lib/spine/local-runtime";
import { photoUploadAllowedForPages } from "../../../lib/visitor/runtime";
import { PhotoUploadPaused } from "../photo-upload-paused";
import { SpinePhotoPanel } from "./photo-panel";

export const dynamic = "force-dynamic";

export default async function SpinePhotoPage() {
  const cloud = getCloudSpine() !== null;
  if (!cloud && !(await getLocalSpineStorage())) notFound();
  // Hosted intake follows the administrator's switch (fail closed); the API enforces it too.
  if (cloud && !(await photoUploadAllowedForPages()))
    return (
      <main className="participation">
        <PhotoUploadPaused />
      </main>
    );
  return <SpinePhotoPanel codeFree={process.env.AI_CITY_VISITOR_CODE_FREE === "1"} cloud={cloud} />;
}

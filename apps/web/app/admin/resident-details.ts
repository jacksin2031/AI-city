import type { PublicResident } from "@ai-city/contracts";
import { traitLabels } from "../join/trait-values";

export const ABSENT = "未保存";

/** Placeholder text the server writes when a participant never saved the field. */
const PLACEHOLDER_LABEL = "非公開";

/**
 * Detail rows for the administrator, built only from what is persisted on the public resident.
 * Missing fields say so; nothing is invented and no photo or questionnaire answer is shown.
 */
export function residentDetailRows(
  resident: Pick<
    PublicResident,
    "residentId" | "personalityLabel" | "interests" | "traits" | "consentVersion"
  >,
): { label: string; value: string; absent: boolean }[] {
  const label = resident.personalityLabel;
  const rows = [
    { label: "ID", value: resident.residentId, absent: false },
    {
      label: "AIスタイル",
      value: !label || label === PLACEHOLDER_LABEL ? ABSENT : label,
      absent: !label || label === PLACEHOLDER_LABEL,
    },
    {
      label: "興味",
      value: resident.interests.length ? resident.interests.join("、") : ABSENT,
      absent: resident.interests.length === 0,
    },
    {
      label: "特性",
      value: resident.traits
        ? traitLabels
            .map((name, i) => `${name} ${Math.round((resident.traits?.[i] ?? 0) * 100)}`)
            .join(" / ")
        : ABSENT,
      absent: !resident.traits,
    },
    { label: "公開同意", value: `v${resident.consentVersion}`, absent: false },
  ];
  return rows;
}

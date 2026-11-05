import { z } from "zod";
import type { VisitorTransaction } from "../visitor/store";

export const SpineRosterEntrySchema = z.strictObject({
  task: z
    .string()
    .regex(/^spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  owner: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().nonnegative(),
});
const stateSchema = z.looseObject({
  eventSeq: z.number().int().nonnegative().safe(),
  residents: z.array(z.unknown()).max(200),
  spineResidents: z.array(SpineRosterEntrySchema).max(200).optional(),
});

/** The job and roster are written in the same store transaction. */
export async function addSpineResident(
  tx: VisitorTransaction,
  entry: z.infer<typeof SpineRosterEntrySchema>,
) {
  const parsedEntry = SpineRosterEntrySchema.parse(entry);
  const state = stateSchema.parse(await tx.get("meta/state"));
  const residents = state.spineResidents ?? [];
  if (residents.some((item) => item.task === entry.task || item.owner === entry.owner))
    throw new Error("SPINE_ROSTER_CONFLICT");
  if (residents.length + state.residents.length >= 200) throw new Error("SPINE_ROSTER_FULL");
  tx.set("meta/state", {
    ...state,
    eventSeq: state.eventSeq + 1,
    spineResidents: [...residents, parsedEntry],
  });
}

export async function removeSpineResident(tx: VisitorTransaction, task: string) {
  const raw = await tx.get("meta/state");
  if (!raw) return;
  const state = stateSchema.parse(raw);
  const residents = state.spineResidents ?? [];
  const remaining = residents.filter((entry) => entry.task !== task);
  if (remaining.length !== residents.length)
    tx.set("meta/state", { ...state, eventSeq: state.eventSeq + 1, spineResidents: remaining });
}

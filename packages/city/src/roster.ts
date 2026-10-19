import type { PublicResident } from "@ai-city/contracts";
import { CitySnapshotSchema } from "@ai-city/contracts/development";

export type CityRoster = {
  streamId: string;
  eventSeq: number;
  residents: PublicResident[];
  addedIds: string[];
  removedIds: string[];
};

/** Snapshots are authoritative; stale responses cannot resurrect removed residents. */
export function reconcileRoster(previous: CityRoster | null, input: unknown): CityRoster {
  const snapshot = CitySnapshotSchema.parse(input);
  if (previous?.streamId === snapshot.streamId && snapshot.eventSeq <= previous.eventSeq) {
    return { ...previous, addedIds: [], removedIds: [] };
  }
  const oldIds = new Set(previous?.residents.map((resident) => resident.residentId));
  const newIds = new Set(snapshot.residents.map((resident) => resident.residentId));
  const sameStream = previous?.streamId === snapshot.streamId;
  return {
    streamId: snapshot.streamId,
    eventSeq: snapshot.eventSeq,
    residents: snapshot.residents,
    addedIds: sameStream ? [...newIds].filter((id) => !oldIds.has(id)) : [],
    removedIds: [...oldIds].filter((id) => !sameStream || !newIds.has(id)),
  };
}

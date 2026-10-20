import type { CitySnapshot } from "@ai-city/contracts/development";
import { type CityRoster, reconcileRoster } from "./roster";

export type ResidentPresentation = {
  roster: CityRoster;
  active: { kind: "profile" | "welcome"; id: string } | null;
  queue: string[];
};

function promote(state: ResidentPresentation): ResidentPresentation {
  if (state.active || !state.queue.length) return state;
  const [id, ...queue] = state.queue;
  return { ...state, active: id ? { kind: "welcome", id } : null, queue };
}

/** An initial/replacement stream is restoration, never a replay of historical joins. */
export function updatePresentation(
  previous: ResidentPresentation | null,
  snapshot: CitySnapshot,
): ResidentPresentation {
  const roster = reconcileRoster(previous?.roster ?? null, snapshot);
  if (!previous || previous.roster.streamId !== roster.streamId)
    return { roster, active: null, queue: [] };
  const ids = new Set(roster.residents.map((resident) => resident.residentId));
  const active = previous.active && ids.has(previous.active.id) ? previous.active : null;
  const queue = [...new Set([...previous.queue, ...roster.addedIds])].filter(
    (id) => ids.has(id) && !(active?.kind === "welcome" && active.id === id),
  );
  return promote({ roster, active, queue });
}

export function openProfile(state: ResidentPresentation, id: string): ResidentPresentation {
  if (!state.roster.residents.some((resident) => resident.residentId === id)) return state;
  return { ...state, active: { kind: "profile", id } };
}

export function closePresentation(state: ResidentPresentation): ResidentPresentation {
  return promote({ ...state, active: null });
}

/** Stop on the first unconfirmed request; never retry a destructive action automatically. */
export async function removeResidents(
  residentIds: string[],
  remove: (residentId: string) => Promise<unknown>,
): Promise<{ removed: string[]; remaining: string[] }> {
  const ids = [...new Set(residentIds)];
  const removed: string[] = [];
  for (const [index, id] of ids.entries()) {
    try {
      await remove(id);
      removed.push(id);
    } catch {
      return { removed, remaining: ids.slice(index) };
    }
  }
  return { removed, remaining: [] };
}

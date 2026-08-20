/**
 * Server-authoritative Academy sequencing.
 *
 * `academy_item_access(module_id)` is the single source of truth for which
 * learning items a learner may open. The UI mirrors it exactly — it never
 * relaxes the rule, and it never invents locks the server would not enforce.
 */

export type ItemAccessReason =
  | "open"
  | "optional"
  | "admin_preview"
  | "requires_previous_item"
  | "requires_all_learning_items";

export interface ItemAccessRow {
  mission_id: string;
  slug: string;
  unlocked: boolean;
  reason: ItemAccessReason | string;
  blocked_by?: string | null;
}

export interface ItemAccessMap {
  module_id: string;
  is_admin: boolean;
  all_required_done: boolean;
  items: ItemAccessRow[];
}

export function accessRowFor(
  access: ItemAccessMap | undefined,
  missionId: string | undefined
): ItemAccessRow | undefined {
  if (!access || !missionId) return undefined;
  return access.items.find((i) => i.mission_id === missionId);
}

/**
 * Unlock decision for one item. While access is still loading we return
 * `false` for anything but the very first item so the UI never flashes an
 * item open that the server would refuse.
 */
export function isItemUnlocked(
  access: ItemAccessMap | undefined,
  missionId: string | undefined
): boolean {
  const row = accessRowFor(access, missionId);
  return row?.unlocked ?? false;
}

export function lockMessage(row: ItemAccessRow | undefined): string {
  if (!row || row.unlocked) return "";
  if (row.reason === "requires_all_learning_items") {
    return row.blocked_by
      ? `Certification opens when every learning item is complete — starting with “${row.blocked_by}”.`
      : "Certification opens when every learning item is complete.";
  }
  return row.blocked_by
    ? `This item unlocks when you complete “${row.blocked_by}”.`
    : "This item unlocks when you complete the previous one.";
}

/** First item the learner can act on, in module order. */
export function nextOpenItem(
  access: ItemAccessMap | undefined,
  completedIds: Set<string>
): ItemAccessRow | undefined {
  return access?.items.find(
    (i) => i.unlocked && i.reason !== "optional" && !completedIds.has(i.mission_id)
  );
}

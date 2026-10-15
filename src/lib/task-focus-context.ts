import type { UnifiedTask } from "@/hooks/useTasks";

/** Only group exact renewal destinations in the summary; keep every full-list task. */
export function selectFocusContexts<T extends { task: UnifiedTask; score: number; reason: string }>(ranked: T[], limit = 3) {
  const contexts = new Map<string, T & { relatedCount: number }>();
  for (const item of [...ranked].sort((a, b) => b.score - a.score)) {
    const { task } = item;
    const key = task.source === "renewal" && task.related_route ? `renewal:${task.related_route}` : `task:${task.id}`;
    const previous = contexts.get(key);
    if (previous) previous.relatedCount++;
    else contexts.set(key, { ...item, relatedCount: 1 });
  }
  return Array.from(contexts.values()).slice(0, limit);
}

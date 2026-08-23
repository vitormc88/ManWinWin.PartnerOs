import { useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  eventDedupeKey,
  sanitizeEventProperties,
  type LearningEventName,
  type LearningEventProperties,
} from "@/lib/academy-events";

/** A random id that never leaves the browser session. */
function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface TrackOptions {
  stepId?: string | null;
  properties?: Record<string, unknown>;
  /** Emit at most once per player session for this key. */
  once?: boolean;
  /** Extra discriminator for the dedupe key (e.g. an option id). */
  dedupeOn?: string | null;
}

export type TrackLearningEvent = (name: LearningEventName, options?: TrackOptions) => void;

/**
 * Fire-and-forget learning telemetry.
 *
 * Guarantees:
 *  - never throws and never rejects — a failed insert cannot break the lesson;
 *  - one `session_id` per mounted player, stable across StrictMode remounts of
 *    the same mission;
 *  - `client_event_id` makes retries idempotent (unique per user in the DB);
 *  - noisy "view" events are de-duplicated in-session via `once`.
 */
export function useLearningEventTracker(params: {
  missionId: string | undefined;
  moduleId: string | undefined;
  enabled?: boolean;
}): { track: TrackLearningEvent; sessionId: string } {
  const { missionId, moduleId, enabled = true } = params;
  const sessionRef = useRef<{ key: string; id: string } | null>(null);
  const key = `${missionId ?? "-"}:${moduleId ?? "-"}`;
  if (!sessionRef.current || sessionRef.current.key !== key) {
    sessionRef.current = { key, id: randomId() };
  }
  const sessionId = sessionRef.current.id;

  const sentRef = useRef<Map<string, string>>(new Map());
  const sessionKeyRef = useRef(key);
  if (sessionKeyRef.current !== key) {
    sessionKeyRef.current = key;
    sentRef.current = new Map();
  }

  const track = useCallback<TrackLearningEvent>(
    (name, options = {}) => {
      try {
        if (!enabled || !missionId || !moduleId) return;
        const dedupe = eventDedupeKey(name, options.stepId, options.dedupeOn);
        if (options.once && sentRef.current.has(dedupe)) return;

        // Reuse the same client_event_id for a repeated dedupe key so a retry
        // is idempotent server-side instead of creating a near-duplicate row.
        const clientEventId = sentRef.current.get(dedupe) ?? randomId();
        sentRef.current.set(dedupe, clientEventId);

        const properties = sanitizeEventProperties(options.properties);
        void supabase
          .from("academy_learning_events")
          .insert({
            mission_id: missionId,
            module_id: moduleId,
            event_name: name,
            step_id: options.stepId ?? null,
            client_event_id: clientEventId,
            session_id: sessionId,
            properties: properties as never,
            occurred_at: new Date().toISOString(),
          })
          .then(
            () => undefined,
            () => undefined
          );
      } catch {
        /* telemetry must never break the learning experience */
      }
    },
    [enabled, missionId, moduleId, sessionId]
  );

  return useMemo(() => ({ track, sessionId }), [track, sessionId]);
}

export interface LearningEventRow {
  id: string;
  user_id: string;
  mission_id: string;
  module_id: string;
  event_name: string;
  step_id: string | null;
  session_id: string;
  properties: Record<string, unknown> | null;
  occurred_at: string;
}

/**
 * Admin-only recent events for one mission. RLS (`is_academy_admin()`) is the
 * real gate; non-admins simply receive an empty list.
 */
export function useRecentLearningEvents(
  missionId: string | undefined,
  options: { limit?: number; page?: number; enabled?: boolean } = {}
) {
  const { limit = 25, page = 0, enabled = true } = options;
  const { user } = useAuth();
  return useQuery({
    queryKey: ["academy", "learning-events", missionId ?? "none", limit, page],
    enabled: enabled && !!missionId && !!user?.id,
    queryFn: async (): Promise<LearningEventRow[]> => {
      const from = page * limit;
      const { data, error } = await supabase
        .from("academy_learning_events")
        .select("id, user_id, mission_id, module_id, event_name, step_id, session_id, properties, occurred_at")
        .eq("mission_id", missionId!)
        .order("occurred_at", { ascending: false })
        .range(from, from + limit - 1);
      if (error) throw error;
      return (data ?? []) as unknown as LearningEventRow[];
    },
    staleTime: 15_000,
  });
}

export type { LearningEventProperties };

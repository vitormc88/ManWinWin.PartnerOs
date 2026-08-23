import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  eventDedupeKey,
  sanitizeEventProperties,
  type LearningEventName,
  type LearningEventProperties,
} from "@/lib/academy-events";
import { loadEventSession, rememberEvent } from "@/lib/academy-event-session";

export interface TrackOptions {
  stepId?: string | null;
  properties?: Record<string, unknown>;
  /** Emit at most once per tab session for this dedupe key. */
  once?: boolean;
  /** Extra discriminator for the dedupe key (e.g. the chosen option id). */
  dedupeOn?: string | null;
}

export type TrackLearningEvent = (name: LearningEventName, options?: TrackOptions) => void;

/**
 * Fire-and-forget learning telemetry.
 *
 * Guarantees:
 *  - never throws and never rejects — a failed insert cannot break the lesson;
 *  - one `session_id` per mission per browser TAB, held in sessionStorage so it
 *    genuinely survives component remounts (StrictMode double-mount, route
 *    re-entry, refetch-driven re-renders) rather than only re-renders;
 *  - "once" events (mission start/resume, step views) are therefore emitted a
 *    single time per tab session, not once per mount;
 *  - a repeated dedupe key reuses its `client_event_id`, so any replay collides
 *    with the DB unique index instead of writing a near-duplicate row;
 *  - answer events discriminate on the answer itself (`dedupeOn`), so changing
 *    an answer is a new event with a new id while re-picking the same answer is
 *    de-duplicated.
 */
export function useLearningEventTracker(params: {
  missionId: string | undefined;
  moduleId: string | undefined;
  enabled?: boolean;
}): { track: TrackLearningEvent; sessionId: string } {
  const { missionId, moduleId, enabled = true } = params;

  const sessionId = useMemo(() => {
    if (!missionId || !moduleId) return "";
    try {
      return loadEventSession(missionId, moduleId).id;
    } catch {
      return "";
    }
  }, [missionId, moduleId]);

  const track = useCallback<TrackLearningEvent>(
    (name, options = {}) => {
      try {
        if (!enabled || !missionId || !moduleId) return;
        const dedupe = eventDedupeKey(name, options.stepId, options.dedupeOn);
        const { clientEventId, alreadySent, sessionId: sid } = rememberEvent(
          missionId,
          moduleId,
          dedupe
        );
        if (options.once && alreadySent) return;

        const properties = sanitizeEventProperties(options.properties);
        void supabase
          .from("academy_learning_events")
          .insert({
            mission_id: missionId,
            module_id: moduleId,
            event_name: name,
            step_id: options.stepId ?? null,
            client_event_id: clientEventId,
            session_id: sid,
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
    [enabled, missionId, moduleId]
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

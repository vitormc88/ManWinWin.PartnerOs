/**
 * Completion telemetry sequencing (pure, no React, no I/O).
 *
 * The completion engine itself stays untouched: `useCompleteMission` still
 * owns the write, the toasts and the cache invalidation. This helper only
 * guarantees ordering — `mission_completed` is emitted from the mutation's
 * success callback, never optimistically, never on failure, and never when
 * the learner marks a mission as incomplete.
 */

export type CompleteMissionVariables = { missionId: string; completed: boolean };

export type CompleteMissionMutate = (
  variables: CompleteMissionVariables,
  options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
) => void;

export interface MissionCompletionTelemetry {
  /** Called only after the mutation reports success for a "completing" action. */
  onCompleted: () => void;
}

export function toggleMissionCompletion(params: {
  mutate: CompleteMissionMutate;
  missionId: string;
  /** true = marking complete, false = marking incomplete. */
  completing: boolean;
  telemetry?: MissionCompletionTelemetry | null;
}): void {
  const { mutate, missionId, completing, telemetry } = params;
  mutate(
    { missionId, completed: completing },
    {
      onSuccess: () => {
        if (!completing || !telemetry) return;
        telemetry.onCompleted();
      },
    }
  );
}

import { describe, expect, it, vi } from "vitest";
import { toggleMissionCompletion, type CompleteMissionMutate } from "@/lib/academy-mission-complete";

/** Mutation double that lets the test decide when/whether success happens. */
function mutateFactory(outcome: "success" | "error" | "pending") {
  const calls: Array<{ variables: unknown; resolve: () => void; reject: () => void }> = [];
  const mutate: CompleteMissionMutate = (variables, options) => {
    const entry = {
      variables,
      resolve: () => options?.onSuccess?.(),
      reject: () => options?.onError?.(new Error("write failed")),
    };
    calls.push(entry);
    if (outcome === "success") entry.resolve();
    if (outcome === "error") entry.reject();
  };
  return { mutate, calls };
}

describe("toggleMissionCompletion — telemetry ordering", () => {
  it("emits nothing while the mutation is still pending", () => {
    const onCompleted = vi.fn();
    const { mutate, calls } = mutateFactory("pending");

    toggleMissionCompletion({ mutate, missionId: "m1", completing: true, telemetry: { onCompleted } });

    expect(calls[0].variables).toEqual({ missionId: "m1", completed: true });
    expect(onCompleted).not.toHaveBeenCalled();

    calls[0].resolve();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("emits exactly one event after a successful completion", () => {
    const onCompleted = vi.fn();
    const { mutate } = mutateFactory("success");
    toggleMissionCompletion({ mutate, missionId: "m1", completing: true, telemetry: { onCompleted } });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("emits nothing when the completion write fails", () => {
    const onCompleted = vi.fn();
    const { mutate } = mutateFactory("error");
    toggleMissionCompletion({ mutate, missionId: "m1", completing: true, telemetry: { onCompleted } });
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("emits nothing when marking a mission incomplete, even on success", () => {
    const onCompleted = vi.fn();
    const { mutate, calls } = mutateFactory("success");
    toggleMissionCompletion({ mutate, missionId: "m1", completing: false, telemetry: { onCompleted } });
    expect(calls[0].variables).toEqual({ missionId: "m1", completed: false });
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("still performs the write when there is no telemetry (legacy markdown missions)", () => {
    const { mutate, calls } = mutateFactory("success");
    expect(() =>
      toggleMissionCompletion({ mutate, missionId: "m1", completing: true, telemetry: null })
    ).not.toThrow();
    expect(calls).toHaveLength(1);
  });
});

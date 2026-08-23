import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MissionPlayerV2 } from "../MissionPlayerV2";
import {
  MISSION_PLAYER_V2_KIND,
  MISSION_PLAYER_V2_STATE_KEY,
  type MissionExperienceV2,
} from "@/lib/academy-player";

const steps = Array.from({ length: 10 }, (_, i) => ({
  id: `s${i + 1}`,
  type: "learn" as const,
  title: `Step ${i + 1}`,
  navLabel: `Step ${i + 1}`,
  body: `Body ${i + 1}`,
}));

const experience: MissionExperienceV2 = {
  kind: MISSION_PLAYER_V2_KIND,
  version: 1,
  title: "Build a Relevant First Touch",
  steps,
};

const savedChecklist = {
  [MISSION_PLAYER_V2_STATE_KEY]: {
    version: 1,
    started: true,
    currentStepId: "s8",
    choices: {},
    reasoning: {},
    notes: {},
    completed: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"],
    apply: {},
  },
};

function renderPlayer(checklistState: unknown, onEvent: ReturnType<typeof vi.fn>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MissionPlayerV2
        experience={experience}
        markdown={"# Lesson"}
        checklistState={checklistState}
        onPersist={() => {}}
        isCompleted={false}
        onComplete={() => {}}
        onEvent={onEvent}
      />
    </QueryClientProvider>
  );
}

describe("MissionPlayerV2 start/resume telemetry", () => {
  it("reports the authoritative saved completion after delayed hydration", async () => {
    const onEvent = vi.fn();
    // Progress row has not arrived yet on first render.
    const { rerender } = renderPlayer({}, onEvent);
    expect(onEvent.mock.calls.filter(([n]) => n === "mission_resumed")).toHaveLength(0);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <MissionPlayerV2
          experience={experience}
          markdown={"# Lesson"}
          checklistState={savedChecklist}
          onPersist={() => {}}
          isCompleted={false}
          onComplete={() => {}}
          onEvent={onEvent}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(onEvent.mock.calls.filter(([n]) => n === "mission_resumed")).toHaveLength(1);
    });
    const resumed = onEvent.mock.calls.find(([n]) => n === "mission_resumed")!;
    expect(resumed[1].properties.completion_pct).toBe(70);
    expect(resumed[1].properties.resumed).toBe(true);
    expect(onEvent.mock.calls.filter(([n]) => n === "mission_started")).toHaveLength(0);
  });

  it("emits mission_started only on explicit start for a brand new mission", async () => {
    const onEvent = vi.fn();
    renderPlayer({}, onEvent);
    expect(onEvent.mock.calls.filter(([n]) => n === "mission_started")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /start mission/i }));

    await waitFor(() => {
      expect(onEvent.mock.calls.filter(([n]) => n === "mission_started")).toHaveLength(1);
    });
    const started = onEvent.mock.calls.find(([n]) => n === "mission_started")!;
    expect(started[1].properties.completion_pct).toBe(0);
    expect(started[1].properties.resumed).toBe(false);
    expect(onEvent.mock.calls.filter(([n]) => n === "mission_resumed")).toHaveLength(0);
  });
});

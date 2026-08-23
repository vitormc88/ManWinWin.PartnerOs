import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
  deepDiveTitle: "Full Lesson",
  steps,
};

/** Viewing step 1 while 7 of 10 steps are already completed → 70%. */
const checklistState = {
  [MISSION_PLAYER_V2_STATE_KEY]: {
    version: 1,
    started: true,
    currentStepId: "s1",
    choices: {},
    reasoning: {},
    notes: {},
    completed: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"],
    apply: {},
  },
};

function renderPlayer() {
  // The Tools panel resolves optional Asset Library media through React Query.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MissionPlayerV2
        experience={experience}
        markdown={"# Lesson\n\nSome legacy markdown."}
        checklistState={checklistState}
        onPersist={() => {}}
        isCompleted={false}
        onComplete={() => {}}
      />
    </QueryClientProvider>
  );
}


describe("MissionPlayerV2 polish", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("distinguishes the viewed step from accumulated completion", () => {
    renderPlayer();
    expect(screen.getByText("Viewing step 1 of 10")).toBeInTheDocument();
    expect(screen.getAllByText("70% completed").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("progressbar", { name: "Mission progress: 70% completed" })
    ).toBeInTheDocument();
  });

  it("gives the Deep Dive sheet an accessible description and logs nothing", async () => {
    renderPlayer();
    fireEvent.click(screen.getAllByRole("button", { name: /open deep dive/i })[0]);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog).toHaveAttribute("aria-describedby");
    });
    const describedBy = dialog.getAttribute("aria-describedby")!;
    const description = document.getElementById(describedBy);
    expect(description?.textContent).toMatch(/complete written lesson/i);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

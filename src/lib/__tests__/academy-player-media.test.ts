import { describe, expect, it } from "vitest";
import {
  isValidMediaAssetKey,
  validateMissionExperience,
  type MissionExperienceV2,
} from "@/lib/academy-player";

const base: MissionExperienceV2 = {
  kind: "academy-learning-experience-v2",
  version: 1,
  title: "Media mission",
  steps: [
    { id: "s1", type: "hook", title: "Hook" },
    { id: "s2", type: "takeaway", title: "Takeaway" },
  ],
};

describe("media asset keys", () => {
  it("accepts namespaced Academy keys", () => {
    expect(isValidMediaAssetKey("academy.m5m3.video-hook")).toBe(true);
    expect(isValidMediaAssetKey("takeaway_card-1")).toBe(true);
  });

  it("rejects unsafe or malformed keys", () => {
    expect(isValidMediaAssetKey("Academy.Upper")).toBe(false);
    expect(isValidMediaAssetKey("has space")).toBe(false);
    expect(isValidMediaAssetKey("https://cdn.example.com/a.mp4")).toBe(false);
    expect(isValidMediaAssetKey("")).toBe(false);
    expect(isValidMediaAssetKey(42)).toBe(false);
  });
});

describe("validateMissionExperience — optional media refs", () => {
  it("accepts an experience with valid media references", () => {
    const result = validateMissionExperience({
      ...base,
      audioBrief: {
        title: "Audio brief",
        duration: "6 min",
        assetKey: "academy.m5m3.audio-brief",
        transcript: "Full transcript text.",
      },
      steps: [
        {
          ...base.steps[0],
          video: {
            label: "Hook video",
            duration: "2 min",
            assetKey: "academy.m5m3.video-hook",
            posterAssetKey: "academy.m5m3.video-poster",
            captionsAssetKey: "academy.m5m3.video-captions",
          },
        },
        { ...base.steps[1], assetKey: "academy.m5m3.takeaway" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("stays valid when no media references are present (placeholders)", () => {
    expect(validateMissionExperience(base).ok).toBe(true);
  });

  it("rejects an invalid step asset key", () => {
    const result = validateMissionExperience({
      ...base,
      steps: [base.steps[0], { ...base.steps[1], assetKey: "Not A Key" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/assetKey/);
  });

  it("rejects an invalid video/audio asset key and a non-string transcript", () => {
    const video = validateMissionExperience({
      ...base,
      steps: [
        { ...base.steps[0], video: { label: "v", duration: "1", assetKey: "BAD KEY" } },
        base.steps[1],
      ],
    });
    expect(video.ok).toBe(false);

    const audio = validateMissionExperience({
      ...base,
      audioBrief: { title: "a", duration: "1", assetKey: "ok.key", transcript: 5 },
    });
    expect(audio.ok).toBe(false);
  });
});

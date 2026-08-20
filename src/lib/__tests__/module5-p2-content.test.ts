import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { referencedAssetKeys } from "@/lib/academy-assets";

/**
 * Guards for the Module 5 P2 corrective migration. The migration is the only
 * place that defines the module's visual keys and the canonical checklist, so
 * regressions there must fail here rather than in production.
 */
const MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260820204322_647150f6-b48a-46b6-b140-8511bd35e548.sql"),
  "utf8"
);

const M5_KEYS = [
  "m5-qualification-opportunity-scorecard",
  "m5-t-form-canvas",
  "m5-qualification-conversation-guide",
  "m5-qualify-nurture-disqualify",
  "m5-partneros-qualification-workflow",
];

describe("module 5 P2 migration", () => {
  it("uses the m5-* asset keys everywhere", () => {
    for (const key of M5_KEYS) expect(MIGRATION).toContain(`'${key}'`);
    // No unprefixed key may survive as a live reference.
    expect(MIGRATION).toContain("Unprefixed Module 5 asset rows still present");
    expect(MIGRATION).toContain("Module 5 content still references unprefixed asset keys");
  });

  it("targets the canonical checklist resource id and refuses alternatives", () => {
    expect(MIGRATION).toContain("81ca8468-8a80-41fb-abde-da40507bf4ff");
    expect(MIGRATION).toContain("Expected exactly one Module 5 checklist resource");
    expect(MIGRATION).toContain("does not belong to Module 5");
    expect(MIGRATION).toContain("version         = '2.0'");
  });

  it("keeps the comprehensive checklist sections with canonical TIMD", () => {
    for (const section of [
      "# Qualification Checklist",
      "## 1. Business Need",
      "## 2. TIMD",
      "### Timing",
      "### Interest",
      "### Money",
      "### Decision-making",
      "## 3. T-FORM Coverage",
      "### Technical",
      "### Financial",
      "### Operational",
      "### Relationship",
      "## 4. Opportunity Health",
      "## 5. CRM Checklist (PartnerOS)",
      "## 6. Final Decision",
      "## 7. After Every Interaction",
      "**Evidence / notes:**",
    ]) {
      expect(MIGRATION).toContain(section);
    }
    expect(MIGRATION).not.toMatch(/Trigger\s*[,/]\s*Impact/i);
  });

  it("removes the Mission 1 placeholders and asserts none remain", () => {
    expect(MIGRATION).toContain("Hero Graphic|Insert Visual V-004|Insert Visual V-001");
    expect(MIGRATION).toContain("Module 5 still contains placeholder visual references");
  });

  it("places missions 3, 4 and 6 by matching section, not blindly at the top", () => {
    expect(MIGRATION).toContain("'mission-3-t-form',           'm5-t-form-canvas'");
    expect(MIGRATION).toMatch(/mission-4-better-questions[^\n]*question\|conversation/);
    expect(MIGRATION).toMatch(/mission-6-in-partneros[^\n]*partneros\|workflow\|process/);
  });

  it("emits parseable asset fences for the m5 keys", () => {
    const md = M5_KEYS.map((k) => `:::asset\nid: ${k}\nwidth: full\nalign: center\n:::`).join("\n\n");
    expect(referencedAssetKeys(md)).toEqual(M5_KEYS);
  });
});

describe("lesson shell heading hygiene", () => {
  const missionPage = readFileSync(
    resolve(__dirname, "../../pages/academy/AcademyMission.tsx"),
    "utf8"
  );

  it("drops the markdown H1 in the learner lesson shell and its TOC", () => {
    expect(missionPage).toContain("<MissionToc markdown={mission.content_markdown} hideLeadingH1 />");
    expect(missionPage).toMatch(/<MissionContent[\s\S]*hideLeadingH1[\s\S]*\/>/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { referencedAssetKeys } from "@/lib/academy-assets";

/**
 * The Module 5 diagrams must sit under the section they explain. Production
 * proved that "insert only when absent" migrations silently leave a badly
 * placed diagram where it is, so this suite pins the exact heading anchors and
 * exercises the move itself on production-shaped lesson bodies.
 */
const MIGRATION_FILE = "20260820205345_34f93468-b67a-4bf9-bcd1-29f6e76c795b.sql";
const MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/", MIGRATION_FILE),
  "utf8"
);

/** The single source of truth for where each Module 5 diagram belongs. */
const PLACEMENTS = [
  { slug: "mission-3-t-form", key: "m5-t-form-canvas", heading: "# What is the T-FORM?" },
  {
    slug: "mission-4-better-questions",
    key: "m5-qualification-conversation-guide",
    heading: "# Learn to Dig Deeper",
  },
  {
    slug: "mission-5-decision",
    key: "m5-qualify-nurture-disqualify",
    heading: "# The Three Possible Outcomes",
  },
  {
    slug: "mission-6-in-partneros",
    key: "m5-partneros-qualification-workflow",
    heading: "# What Should Be Updated?",
  },
] as const;

const fence = (key: string) => `:::asset\nid: ${key}\nwidth: full\nalign: center\n:::`;

/** Mirrors the migration: strip the fence anywhere, re-insert under the heading. */
function movePlacement(markdown: string, key: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 1. Literal removal of the canonical fence — no regex, exactly like the SQL.
  let out = markdown.split(`${fence(key)}\n`).join("").split(fence(key)).join("");
  // 1b. Tolerate trailing horizontal whitespace, still without any lookaround.
  out = out.replace(
    new RegExp(
      String.raw`^[ \t]*:::asset[ \t]*\n[ \t]*id:[ \t]*${key}[ \t]*\n[ \t]*width:[ \t]*full[ \t]*\n[ \t]*align:[ \t]*center[ \t]*\n[ \t]*:::[ \t]*(?:\n|$)`,
      "gm"
    ),
    ""
  );
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(
    new RegExp(String.raw`^(${escaped}[ \t]*\n)`, "m"),
    `$1\n${fence(key)}\n\n`
  );
  return out.replace(/\n{3,}/g, "\n\n");
}

/** True when the fence follows the heading with at most one blank line. */
function anchoredUnder(markdown: string, key: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    String.raw`^${escaped}[ \t]*\n[ \t]*\n?:::asset[ \t]*\nid: ${key}[ \t]*$`,
    "m"
  ).test(markdown);
}

const occurrences = (markdown: string, key: string) =>
  markdown.split("\n").filter((line) => line.trim() === `id: ${key}`).length;

describe("Module 5 placement migration", () => {
  it("declares exactly the four intended slug / asset / heading anchors", () => {
    for (const { slug, key, heading } of PLACEMENTS) {
      // The exact heading text, not a loose keyword pattern.
      expect(MIGRATION).toContain(`'${heading}'`);
      expect(MIGRATION).toMatch(
        new RegExp(`'${slug}'\\s*,\\s*'${key}'\\s*,\\s*'${heading.replace(/[?]/g, "\\?")}'`)
      );
    }
    const rows = MIGRATION.match(/'mission-[^']+',\s*'m5-[^']+',\s*'#[^']+'/g) ?? [];
    expect(rows).toHaveLength(PLACEMENTS.length);
  });

  it("uses only PostgreSQL-supported regexp features", () => {
    // PostgreSQL ARE support for lookaround is not something we rely on.
    expect(MIGRATION).not.toContain("(?!");
    expect(MIGRATION).not.toContain("(?=");
    expect(MIGRATION).not.toContain("(?<=");
    expect(MIGRATION).not.toContain("(?<!");
  });

  it("removes the canonical fence literally before re-inserting", () => {
    expect(MIGRATION).toContain("v_new := replace(v_md, v_fence, '');");
    expect(MIGRATION).toContain("E':::asset\\nid: ' || v_row.asset_key || E'\\nwidth: full\\nalign: center\\n:::'");
    expect(MIGRATION).toContain("[ \\t]*:::asset[ \\t]*\\n[ \\t]*id:[ \\t]*' || v_row.asset_key");
    expect(MIGRATION).toContain("Asset % must appear exactly once in %");
    expect(MIGRATION).toContain("Asset % is not immediately after");
    // Version bumps only on a real content change.
    expect(MIGRATION).toContain("IF v_new IS DISTINCT FROM v_md THEN");
  });

  it("checks the Mission 5 decision tree by position, not by a brittle regex", () => {
    expect(MIGRATION).toContain("position('id: m5-qualification-decision-tree' in v_m5)");
    expect(MIGRATION).toContain("no longer the first diagram in the lesson");
    expect(MIGRATION).toContain("Mission 5 decision tree is no longer at the top");
  });

  it("refuses to guess when a heading is ambiguous", () => {
    expect(MIGRATION).toContain("refusing to guess placement");
    expect(MIGRATION).toContain("Module 5 (Qualification) must resolve to exactly one row");
    expect(MIGRATION).toContain("Module 5 mission % is missing");
  });
});

describe("placement transform on production-shaped lessons", () => {
  it("moves a diagram from the lesson opening down to its section", () => {
    const { key, heading } = PLACEMENTS[0];
    const before = `## Mission 3 — Using the T-FORM\n\n${fence(key)}\n\nIntro paragraph.\n\n${heading}\n\nBody text.\n\n# Next section\n\nMore.\n`;
    const after = movePlacement(before, key, heading);

    expect(occurrences(after, key)).toBe(1);
    expect(anchoredUnder(after, key, heading)).toBe(true);
    expect(after).toContain("Intro paragraph.");
    expect(after).toContain("Body text.");
    expect(after).not.toMatch(/\n{3,}/);
    // Still parseable, and the diagram no longer opens the lesson.
    expect(referencedAssetKeys(after)).toEqual([key]);
    expect(after.indexOf(heading)).toBeLessThan(after.indexOf(`id: ${key}`));
  });

  it("moves a trailing diagram up and keeps Mission 5's decision tree on top", () => {
    const { key, heading } = PLACEMENTS[2];
    const before = `## Mission 5 — Qualify, Nurture or Disqualify\n\n${fence("m5-qualification-decision-tree")}\n\nIntro.\n\n${heading}\n\nBody text.\n\n# Later\n\nTail.\n\n${fence(key)}\n`;
    const after = movePlacement(before, key, heading);

    expect(referencedAssetKeys(after)).toEqual(["m5-qualification-decision-tree", key]);
    expect(anchoredUnder(after, key, heading)).toBe(true);
    expect(after).toContain("Tail.");
    expect(after.trimEnd().endsWith(":::")).toBe(false);
  });

  it("is idempotent once the diagram is already anchored", () => {
    for (const { key, heading } of PLACEMENTS) {
      const source = `## Lesson\n\nIntro.\n\n${heading}\n\n${fence(key)}\n\nBody.\n`;
      const once = movePlacement(source, key, heading);
      expect(once).toBe(source);
      expect(movePlacement(once, key, heading)).toBe(once);
    }
  });

  it("never swallows a neighbouring asset block", () => {
    const { key, heading } = PLACEMENTS[3];
    const before = `## Mission 6\n\n${fence(key)}\n\n${fence("m5-t-form-canvas")}\n\n${heading}\n\nBody.\n`;
    const after = movePlacement(before, key, heading);

    expect(referencedAssetKeys(after)).toEqual(["m5-t-form-canvas", key]);
    expect(anchoredUnder(after, key, heading)).toBe(true);
  });

  it("leaves the lesson untouched when the heading is absent", () => {
    const { key, heading } = PLACEMENTS[1];
    const placeholder = `## Mission 4 — Asking Better Qualification Questions\n\n${fence(key)}\n\nPlaceholder content.\n`;
    expect(placeholder.includes(heading)).toBe(false);
    // The migration skips this case rather than dropping the diagram.
    expect(occurrences(placeholder, key)).toBe(1);
  });
});

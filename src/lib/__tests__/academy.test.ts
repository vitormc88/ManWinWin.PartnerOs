import { describe, expect, it } from "vitest";
import {
  actionLabel,
  countableMissions,
  deriveModuleStatus,
  formatDuration,
  moduleProgressPct,
  nextMission,
  parseContentBlocks,
  parseRichBlocks,
  simpleStatus,
  checklistCompletion,
  checklistItemIds,
  difficultyLabel,
  isMissionUnlocked,
  joinContentSegments,
  moveSegment,
  resourceTypeLabel,
  splitContentSegments,
  parseInline,
  plainText,
  headingToc,
  readingTimeMinutes,
  formatReadingTime,
  saveReadingPosition,
  loadReadingPosition,
  clearReadingPosition,
  draftKey,
  isDraftStale,
  isSafeExternalUrl,
  validateAcademyUpload,
  academyObjectPath,
  validatePublication,
  canHardDelete,

  type AcademyMission,
  type RichBlock,
} from "@/lib/academy";

const mission = (over: Partial<AcademyMission>): AcademyMission => ({
  id: "m1",
  module_id: "mod",
  mission_number: 1,
  title: "T",
  slug: "t",
  short_description: null,
  estimated_duration_minutes: 10,
  content_markdown: null,
  item_kind: "mission",
  is_locked: false,
  sort_order: 1,
  is_required: true,
  status: "published",
  version: 1,
  ...over,
});

describe("academy progress", () => {
  it("counts locked missions but excludes unpublished ones", () => {
    const list = [
      mission({ id: "a" }),
      mission({ id: "b", is_locked: true }),
      mission({ id: "c", status: "draft" }),
    ];
    // `is_locked` means sequentially gated, not excluded from progress.
    expect(countableMissions(list).map((m) => m.id)).toEqual(["a", "b"]);
    expect(moduleProgressPct(list, new Set(["a"]))).toBe(50);
  });


  it("computes partial progress", () => {
    const list = [mission({ id: "a" }), mission({ id: "b" }), mission({ id: "c" })];
    expect(moduleProgressPct(list, new Set(["a"]))).toBe(33);
    expect(moduleProgressPct(list, new Set())).toBe(0);
  });

  it("maps internal status to simple UI status", () => {
    expect(simpleStatus("not_started")).toBe("Not Started");
    expect(simpleStatus("ready_for_certification")).toBe("In Progress");
    expect(simpleStatus("certification_failed")).toBe("In Progress");
    expect(simpleStatus("certified")).toBe("Completed");
    expect(simpleStatus(undefined)).toBe("Not Started");
  });

  it("derives module status and action label from percentage", () => {
    expect(deriveModuleStatus(0)).toBe("not_started");
    expect(deriveModuleStatus(50)).toBe("in_progress");
    // 100% learning completion is never self-awarded certification.
    expect(deriveModuleStatus(100)).toBe("completed");
    expect(actionLabel(0)).toBe("Start");
    expect(actionLabel(40)).toBe("Continue");
    expect(actionLabel(100)).toBe("Review");
  });


  it("suggests the first incomplete unlocked mission", () => {
    const list = [
      mission({ id: "a", sort_order: 1, slug: "a" }),
      mission({ id: "b", sort_order: 2, slug: "b" }),
    ];
    expect(nextMission(list, new Set(["a"]))?.id).toBe("b");
    expect(nextMission(list, new Set(["a", "b"]))?.id).toBe("a");
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1h 30min");
    expect(formatDuration(120)).toBe("2h");
  });
});

describe("content callouts", () => {
  it("parses known callouts and keeps surrounding text", () => {
    const blocks = parseContentBlocks("Intro\n\n:::best-practice\nDo this\n:::\n\nOutro");
    expect(blocks).toEqual([
      { type: "text", text: "Intro" },
      { type: "callout", kind: "best-practice", text: "Do this" },
      { type: "text", text: "Outro" },
    ]);
  });

  it("preserves unknown callout kinds as text", () => {
    const blocks = parseContentBlocks(":::mystery\nhidden\n:::");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as { text: string }).text).toContain("hidden");
  });

  it("returns nothing for empty content", () => {
    expect(parseContentBlocks(null)).toEqual([]);
  });
});

describe("rich content blocks", () => {
  it("parses headings, lists, quotes, tables and dividers", () => {
    const md = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "- a",
      "- b",
      "",
      "1. one",
      "2. two",
      "",
      "> quoted",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "---",
    ].join("\n");
    const blocks = parseRichBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "bullets",
      "numbered",
      "quote",
      "table",
      "divider",
    ]);
    const table = blocks[5] as Extract<RichBlock, { type: "table" }>;
    expect(table.headers).toEqual(["A", "B"]);
    expect(table.rows).toEqual([["1", "2"]]);
  });

  it("parses callouts and checklists", () => {
    const blocks = parseRichBlocks(":::key-takeaways\n- one\n:::\n\n:::checklist\n- do this\n- do that\n:::");
    expect(blocks[0]).toMatchObject({ type: "callout", kind: "key-takeaways" });
    expect(blocks[1]).toMatchObject({ type: "checklist", key: "checklist-0" });
    expect(checklistItemIds(":::checklist\n- a\n- b\n:::")).toEqual(["checklist-0#0", "checklist-0#1"]);
  });

  it("tracks checklist completion", () => {
    const md = ":::checklist\n- a\n- b\n:::";
    expect(checklistCompletion(md, {})).toEqual({ total: 2, done: 0, allDone: false });
    expect(checklistCompletion(md, { "checklist-0#0": true, "checklist-0#1": true })).toEqual({
      total: 2,
      done: 2,
      allDone: true,
    });
    expect(checklistCompletion("plain text", {}).allDone).toBe(true);
  });
});

describe("authoring helpers", () => {
  it("splits and reorders segments losslessly", () => {
    const md = "# Title\n\n:::best-practice\nDo it\n:::\n\nOutro";
    const segments = splitContentSegments(md);
    expect(segments).toHaveLength(3);
    const moved = moveSegment(segments, 2, -1);
    expect(joinContentSegments(moved)).toBe("# Title\n\nOutro\n\n:::best-practice\nDo it\n:::");
    expect(moveSegment(segments, 0, -1)).toEqual(segments);
  });
});

describe("mission unlocking", () => {
  const list = [
    mission({ id: "a", sort_order: 1 }),
    mission({ id: "b", sort_order: 2, is_locked: true }),
  ];
  it("unlocks a locked mission once the previous one is completed", () => {
    expect(isMissionUnlocked(list, list[1], new Set())).toBe(false);
    expect(isMissionUnlocked(list, list[1], new Set(["a"]))).toBe(true);
    expect(isMissionUnlocked(list, list[0], new Set())).toBe(true);
  });
});

describe("labels", () => {
  it("formats difficulty and resource types", () => {
    expect(difficultyLabel("advanced")).toBe("Advanced");
    expect(difficultyLabel(null)).toBe("Beginner");
    expect(resourceTypeLabel("pdf")).toBe("PDF");
    expect(resourceTypeLabel("powerpoint")).toBe("PowerPoint");
    expect(resourceTypeLabel("mystery")).toBe("mystery");
  });
});

describe("inline markdown", () => {
  it("parses bold, italic, code and links", () => {
    const nodes = parseInline("A **b** and *i* with `c` and [x](https://e.com)");
    expect(nodes.map((n) => n.type)).toEqual([
      "text", "bold", "text", "italic", "text", "code", "text", "link",
    ]);
    expect(nodes[7]).toEqual({ type: "link", text: "x", href: "https://e.com" });
  });

  it("keeps plain text intact and strips markers", () => {
    expect(plainText("**Bold** plain")).toBe("Bold plain");
    expect(parseInline("no markup")).toEqual([{ type: "text", text: "no markup" }]);
  });
});

describe("table of contents and reading time", () => {
  const md = "# Intro\n\nText here.\n\n## Step\n\nMore.\n\n## Step\n\nMore.";

  it("builds de-duplicated heading ids", () => {
    const toc = headingToc(md);
    expect(toc.map((t) => t.id)).toEqual(["intro", "step", "step-2"]);
    expect(toc[0].level).toBe(1);
  });

  it("returns no toc entries for empty content", () => {
    expect(headingToc(null)).toEqual([]);
  });

  it("estimates reading time with a 1 minute floor", () => {
    expect(readingTimeMinutes(null)).toBe(0);
    expect(readingTimeMinutes("just a few words")).toBe(1);
    expect(readingTimeMinutes(Array(600).fill("word").join(" "))).toBe(3);
    expect(formatReadingTime("short text")).toBe("1 min read");
  });
});

describe("reading position memory", () => {
  it("stores, reads and clears positions above the threshold", () => {
    saveReadingPosition("m1", 500);
    expect(loadReadingPosition("m1")).toBe(500);
    saveReadingPosition("m1", 5);
    expect(loadReadingPosition("m1")).toBe(0);
    saveReadingPosition("m1", 400);
    clearReadingPosition("m1");
    expect(loadReadingPosition("m1")).toBe(0);
  });

  it("namespaces draft keys per user and record", () => {
    expect(draftKey("academy_missions", "abc", "u1")).toBe("academy:draft:u1:academy_missions:abc");
    expect(draftKey("academy_missions", undefined)).toBe("academy:draft:anon:academy_missions:new");
  });
});

describe("draft staleness", () => {
  it("flags drafts branched from an older server revision", () => {
    expect(isDraftStale("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBe(true);
    expect(isDraftStale("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(false);
    expect(isDraftStale(null, "2026-01-01T00:00:00Z")).toBe(true);
    expect(isDraftStale(null, null)).toBe(false);
  });
});

describe("safe URLs and uploads", () => {
  it("accepts only http(s) external URLs", () => {
    expect(isSafeExternalUrl("https://example.com/a.pdf")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("/local/path.pdf")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });

  it("validates uploads by extension and size", () => {
    expect(validateAcademyUpload({ name: "guide.pdf", size: 1024 })).toBeNull();
    expect(validateAcademyUpload({ name: "hack.exe", size: 10 })).toContain("Unsupported");
    expect(validateAcademyUpload({ name: "big.pdf", size: 200 * 1024 * 1024 })).toContain("larger");
    expect(validateAcademyUpload({ name: "noext", size: 10 })).toContain("extension");
  });

  it("builds private, prefixed object paths", () => {
    const path = academyObjectPath("Partner Guide v2.PDF");
    expect(path.startsWith("academy/partner-guide-v2-")).toBe(true);
    expect(path.endsWith(".pdf")).toBe(true);
  });
});

describe("publication validation and deletion safety", () => {
  it("blocks publishing missions with missing essentials", () => {
    const issues = validatePublication("academy_missions", {
      title: "",
      slug: "Bad Slug",
      module_id: "",
      content_markdown: "",
    });
    expect(issues).toContain("Title is required.");
    expect(issues).toContain("Slug must be lowercase words separated by hyphens.");
    expect(issues).toContain("A parent module is required.");
    expect(issues).toContain("Mission content cannot be empty when publishing.");
  });

  it("rejects duplicate slugs and unpublished parents", () => {
    const issues = validatePublication(
      "academy_missions",
      { title: "T", slug: "intro", module_id: "m", content_markdown: "x" },
      { siblingSlugs: ["intro"], parentStatus: "draft" }
    );
    expect(issues).toContain("Slug is already used.");
    expect(issues.some((i) => i.includes("publish it first"))).toBe(true);
  });

  it("requires a usable source for resources", () => {
    expect(
      validatePublication("academy_resources", {
        title: "Doc",
        module_id: "m",
        resource_type: "pdf",
      })
    ).toContain("Add a file, an external URL or inline content.");

    expect(
      validatePublication("academy_resources", {
        title: "Doc",
        module_id: "m",
        resource_type: "pdf",
        file_path: "academy/doc.pdf",
      })
    ).toEqual([]);

    expect(
      validatePublication("academy_resources", {
        title: "Link",
        module_id: "m",
        resource_type: "link",
        external_url: "javascript:alert(1)",
      }).some((i) => i.includes("http(s)"))
    ).toBe(true);
  });

  it("only allows hard deletion of non-published records", () => {
    expect(canHardDelete("published")).toBe(false);
    expect(canHardDelete("draft")).toBe(true);
    expect(canHardDelete("archived")).toBe(true);
  });
});


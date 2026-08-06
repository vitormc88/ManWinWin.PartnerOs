import { describe, expect, it } from "vitest";
import { parseRichBlocks, parseInline } from "@/lib/academy";
import {
  assetSnippet,
  buildAssetUsageIndex,
  filterAssets,
  parseAssetFence,
  referencedAssetKeys,
  suggestAssetKey,
  type AcademyAsset,
} from "@/lib/academy-assets";

const asset = (over: Partial<AcademyAsset>): AcademyAsset => ({
  id: "1",
  asset_key: "k",
  title: "Title",
  asset_type: "diagram",
  category: "diagrams",
  tags: [],
  description: null,
  alt_text: null,
  caption: null,
  file_path: null,
  external_url: null,
  mime_type: null,
  file_size: null,
  settings: {},
  current_version: 1,
  status: "published",
  created_by: null,
  updated_by: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

describe("academy asset markdown", () => {
  it("parses an asset fence with defaults", () => {
    const ref = parseAssetFence("id: qualification-decision-matrix\n");
    expect(ref).toEqual({
      id: "qualification-decision-matrix",
      width: "large",
      align: "center",
      params: { id: "qualification-decision-matrix" },
    });
  });

  it("honours caption, width and alignment", () => {
    const ref = parseAssetFence("id: x\ncaption: Matrix\nwidth: small\nalign: left");
    expect(ref?.caption).toBe("Matrix");
    expect(ref?.width).toBe("small");
    expect(ref?.align).toBe("left");
  });

  it("falls back to defaults on unsupported options", () => {
    const ref = parseAssetFence("id: x\nwidth: gigantic\nalign: nowhere");
    expect(ref?.width).toBe("large");
    expect(ref?.align).toBe("center");
  });

  it("returns null without an id", () => {
    expect(parseAssetFence("caption: nothing")).toBeNull();
  });

  it("produces an asset rich block", () => {
    const blocks = parseRichBlocks(`Intro\n\n${assetSnippet("flow-1", "Flow")}\n\nOutro`);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "asset", "paragraph"]);
    const [, block] = blocks;
    expect(block.type === "asset" && block.reference.id).toBe("flow-1");
  });

  it("keeps legacy inline images working", () => {
    const nodes = parseInline("See ![Diagram](https://x/y.png) here");
    expect(nodes.some((n) => n.type === "image" && n.href === "https://x/y.png")).toBe(true);
  });

  it("collects referenced keys and usage", () => {
    const md = `${assetSnippet("a")}\n${assetSnippet("b")}\n${assetSnippet("a")}`;
    expect(referencedAssetKeys(md)).toEqual(["a", "b"]);
    const index = buildAssetUsageIndex([
      { surface: "mission", recordId: "m1", label: "Mission 1", markdown: md },
    ]);
    expect(index.a).toHaveLength(1);
    expect(index.b[0].label).toBe("Mission 1");
  });
});

describe("asset library helpers", () => {
  it("suggests a slug key", () => {
    expect(suggestAssetKey("Qualification Decision Matrix")).toBe("qualification-decision-matrix");
  });

  it("filters by search, category and tag", () => {
    const assets = [
      asset({ id: "1", asset_key: "a", title: "Matrix", category: "diagrams", tags: ["sales"] }),
      asset({ id: "2", asset_key: "b", title: "Funnel", category: "frameworks", tags: ["ops"] }),
    ];
    expect(filterAssets(assets, { search: "matrix" })).toHaveLength(1);
    expect(filterAssets(assets, { category: "frameworks" })[0].id).toBe("2");
    expect(filterAssets(assets, { tag: "ops" })[0].id).toBe("2");
  });
});

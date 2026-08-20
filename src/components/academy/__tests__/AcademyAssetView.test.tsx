import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AcademyAssetView } from "@/components/academy/AcademyAssetView";
import type { AcademyAsset } from "@/lib/academy-assets";

const scorecard: AcademyAsset = {
  id: "a1",
  asset_key: "m5-qualification-opportunity-scorecard",
  title: "Qualification Opportunity Scorecard",
  asset_type: "diagram",
  category: "frameworks",
  tags: ["qualification", "module-5"],
  description: null,
  alt_text: "Six evidence signals of a good opportunity.",
  caption: "Evidence over assumptions.",
  file_path: null,
  external_url: "/academy-assets/module-5/qualification-opportunity-scorecard.svg",
  mime_type: "image/svg+xml",
  file_size: null,
  settings: {},
  current_version: 1,
  status: "published",
  created_by: null,
  updated_by: null,
  created_at: "2026-08-20",
  updated_at: "2026-08-20",
};

vi.mock("@/hooks/useAcademyAssets", () => ({
  useAssetsByKey: () => ({ byKey: { [scorecard.asset_key]: scorecard }, isLoading: false }),
  // Root-relative assets are served by the app, so the hook returns them as-is.
  useAssetUrl: (asset: AcademyAsset | null | undefined) =>
    asset?.file_path ? `signed:${asset.file_path}` : (asset?.external_url ?? null),
}));

describe("AcademyAssetView", () => {
  it("renders a root-relative SVG with meaningful alt text and caption", () => {
    render(
      <AcademyAssetView
        reference={{
          id: "m5-qualification-opportunity-scorecard",
          width: "full",
          align: "center",
          params: { id: "m5-qualification-opportunity-scorecard" },
        }}
      />
    );

    const img = screen.getByAltText("Six evidence signals of a good opportunity.");
    expect(img).toHaveAttribute(
      "src",
      "/academy-assets/module-5/qualification-opportunity-scorecard.svg"
    );
    expect(img).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Evidence over assumptions.")).toBeInTheDocument();
  });

  it("loads eagerly when the reference opts in", () => {
    render(
      <AcademyAssetView
        reference={{
          id: "m5-qualification-opportunity-scorecard",
          width: "full",
          align: "center",
          params: { id: "m5-qualification-opportunity-scorecard", loading: "eager" },
        }}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
  });

  it("explains a missing asset instead of rendering a broken image", () => {
    render(
      <AcademyAssetView
        reference={{ id: "does-not-exist", width: "large", align: "center", params: { id: "does-not-exist" } }}
      />
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/not available in the Asset Library/i)).toBeInTheDocument();
  });
});

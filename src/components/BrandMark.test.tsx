import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BrandMark } from "./BrandMark";
import { readFileSync } from "node:fs";
const css = readFileSync("src/components/BrandLoadingMark.css", "utf8");

afterEach(cleanup);
describe("PartnerOS loading mark", () => {
  it("keeps existing navigation branding static by default", () => {
    render(<BrandMark transparent className="h-6 w-6" />);
    expect(screen.getByRole("img", { name: "PartnerOS" }).tagName).toBe("IMG");
    expect(document.querySelector(".partneros-loading-mark")).toBeNull();
  });
  it("uses three separately moving layers only when animated is requested", () => {
    render(<BrandMark animated className="h-12 w-12" />);
    const mark = screen.getByRole("img", { name: "PartnerOS" });
    expect(mark.tagName.toLowerCase()).toBe("svg");
    expect(mark).toHaveClass("h-12", "w-12");
    expect(mark.querySelectorAll(".partneros-loading-orbit, .partneros-loading-counter, .partneros-loading-core")).toHaveLength(3);
  });
  it("returns to the original static mark when loading ends", () => {
    const { rerender } = render(<BrandMark animated />);
    rerender(<BrandMark animated={false} />);
    expect(screen.getByRole("img", { name: "PartnerOS" }).tagName).toBe("IMG");
  });
  it("supports the reverse mark on dark surfaces", () => {
    render(<BrandMark animated reverse />);
    expect(screen.getByRole("img", { name: "PartnerOS" })).toHaveClass("partneros-loading-mark--reverse");
  });
  it("disables every animated layer for reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/@media[\s\S]*\.partneros-loading-orbit,[\s\S]*\.partneros-loading-counter,[\s\S]*\.partneros-loading-core\s*\{ animation: none; transform: none; \}/);
  });
});

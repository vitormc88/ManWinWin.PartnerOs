import { describe, it, expect } from "vitest";
import { businessPaymentSection, businessNotesTitle, withCurrentBusinessDocumentText, assertSavedBusinessDocumentText } from "../proposal-business-terms";
import { tBusiness } from "../proposal-business-i18n";
import type { Proposal } from "@/types/proposal";
describe("Business entered terms", () => {
  it("uses standard conditions only for empty terms", () => {
    for (const lang of ["EN", "PT", "ES"] as const) {
      const defaults = tBusiness(lang);
      expect(businessPaymentSection("  ", defaults).lines).toEqual([defaults.paymentLine1, defaults.paymentLine2]);
      expect(businessPaymentSection("30 days after acceptance", defaults)).toEqual({ heading: null, lines: ["30 days after acceptance"], footnotes: [] });
    }
  });
  it("keeps entered lines and avoids duplicated heading or standard footnotes", () => {
    const defaults = tBusiness("EN");
    expect(businessPaymentSection(`${defaults.standardTerms}\n• 25% on award\n• 75% after acceptance`, defaults)).toEqual({ heading: defaults.standardTerms, lines: ["25% on award", "75% after acceptance"], footnotes: [] });
  });
  it("includes current unsaved text without mutating persisted proposal", () => {
    const saved = { payment_terms: "old", notes: "old note", status: "Ready" } as Proposal;
    expect(withCurrentBusinessDocumentText(saved, "new", "new note")).toMatchObject({ payment_terms: "new", notes: "new note", status: "Ready" });
    expect(saved.payment_terms).toBe("old");
  });
  it("requires explicit saving before generating a stored Word document", () => {
    const saved = { payment_terms: "30 days", notes: null } as Proposal;
    expect(() => assertSavedBusinessDocumentText(saved, "30 days", "")).not.toThrow();
    expect(() => assertSavedBusinessDocumentText(saved, "60 days", "")).toThrow("Save as Draft first");
    expect(() => assertSavedBusinessDocumentText(saved, "30 days", "new notes")).toThrow("Save as Draft first");
  });
  it("uses localized notes headings", () => {
    expect(businessNotesTitle("EN")).toBe("Notes / Special Conditions");
    expect(businessNotesTitle("PT")).toContain("Condições especiais");
    expect(businessNotesTitle("ES")).toContain("Condiciones especiales");
  });
});

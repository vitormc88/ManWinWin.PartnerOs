import { describe, expect, it } from "vitest";
import { additionOperations, additionMatchesSaved } from "../commercial-addition-workflow";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "../commercial-additions";

describe("Addition follow-up controls", () => {
  it("exposes only the next eligible operations and never auto-activates at award", () => {
    expect(additionOperations("Draft",false)).toEqual(["validate","reject"]);
    expect(additionOperations("Ready",false)).toEqual(["sent","accept","revise","reject"]);
    expect(additionOperations("Sent",false)).toEqual(["accept","revise","reject"]);
    expect(additionOperations("Accepted",false)).toEqual(["activate"]);
    for(const status of ["Lost","Won","Unknown"]) expect(additionOperations(status,false)).toEqual([]);
    expect(additionOperations("Accepted",true)).toEqual([]);
  });
  it("blocks workflow operations on unsaved terms, notes or entitlement changes", () => {
    const draft = { schema:"commercial_addition_v1",selection:{ backoffice:1,web:0 },quote:{ annualIncrease:472 } } as AdditionDraft;
    const saved = { business_config:{ commercial_addition:draft },payment_terms:"100% upfront",notes:"Reviewed" } as Proposal;
    expect(additionMatchesSaved(saved,draft,"100% upfront","Reviewed")).toBe(true);
    expect(additionMatchesSaved(saved,draft,"30 days","Reviewed")).toBe(false);
    expect(additionMatchesSaved(saved,draft,"100% upfront","Changed")).toBe(false);
    expect(additionMatchesSaved(saved,{...draft,selection:{...draft.selection,backoffice:2}},"100% upfront","Reviewed")).toBe(false);
  });
});

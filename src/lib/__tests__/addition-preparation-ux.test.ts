import { describe, expect, it } from "vitest";
import { additionPreparationBlockers, additionReviews, needsAdditionCalculationChoice, needsAdditionHostingShare, normalizeAdditionScope } from "../addition-preparation-ux";
import { initialAdditionSelection, type AdditionBaseline } from "../commercial-additions";

const b: AdditionBaseline = { clientId:"c",clientName:"QA",partnerId:null,licenseId:"l",contractId:"k",family:"Business",model:"useit",plan:null,deployment:"saas",backoffice:1,web:1,owned:[],renewalDate:"2027-10-30",priceTable:"current",recordedAnnual:1000,satActive:true };
const s = initialAdditionSelection(b,"2026-10-30");
describe("Proposal preparation responsibilities", () => {
  it("requires a real confirmed annual baseline even when all calculation checks pass", () => {
    expect(additionPreparationBlockers(b,s)).toHaveLength(1);
    expect(additionPreparationBlockers(b,{...s,baselineAnnualConfirmed:true})).toEqual([]);
    expect(additionPreparationBlockers({...b,recordedAnnual:null},{...s,baselineAnnualConfirmed:true})).toHaveLength(1);
  });
  it("only asks for a calculation where the alternatives affect a Business UseIT component", () => {
    expect(needsAdditionCalculationChoice(b,{...s,web:1,products:["api"]})).toBe(false);
    expect(needsAdditionCalculationChoice(b,{...s,backoffice:1})).toBe(true);
    expect(needsAdditionCalculationChoice(b,{...s,products:["requests"]})).toBe(true);
    expect(needsAdditionCalculationChoice({...b,family:"Professional",plan:1},{...s,products:["requests"]})).toBe(false);
    expect(needsAdditionCalculationChoice({...b,model:"keepit"},{...s,backoffice:1})).toBe(false);
    expect(normalizeAdditionScope(b,{...s,web:1},[]).pricingBasis).toBe("direct");
  });
  it("does not ask for an unused hosting share, but keeps a real hosting share unresolved", () => {
    expect(normalizeAdditionScope(b,{...s,web:1,offerBasis:"partner",licenseShare:60},[]).hostingShare).toBe(100);
    expect(needsAdditionHostingShare(b,{...s,backoffice:1})).toBe(true);
    expect(normalizeAdditionScope(b,{...s,backoffice:1,offerBasis:"partner",licenseShare:60},[]).hostingShare).toBeNull();
  });
  it("groups dependent errors without losing actionable tasks or source failures", () => {
    const tasks=additionReviews(["Select at least one additional access or component.","The incremental quote must have finite, positive amounts within the supported range.","Choose customer prices or a confirmed Navaltik/partner basis.","Confirm both partner revenue shares (0–100%); they are never inferred from notes.","Source contract changed"],false);
    expect(tasks).toHaveLength(3);
    expect(tasks.find(t=>t.id==="basis")?.details).toHaveLength(2);
    expect(tasks[0].target).toBe("addition-items");
    expect(tasks.some(t=>t.owner==="HQ / contract owner")).toBe(true);
  });
});

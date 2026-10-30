// @vitest-environment node
import { describe,it,expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createAdditionPdf } from "../commercial-addition-pdf";
import type { AdditionDraft } from "../commercial-additions";

const draft={schema:"commercial_addition_v1",action:"add_users",baseline:{clientId:"qa",clientName:"Qualidade — demonstração",family:"Business",model:"useit",deployment:"saas",backoffice:1,web:1},selection:{effectiveDate:"2026-07-01",renewalDate:"2027-06-01",monthPolicy:"complete",offerBasis:"customer",implementationReview:"not_needed",commercial:{version:2,language:"PT",proposalDate:"2026-07-01",validityDays:30}},quote:{blockers:[],months:11,dueNow:594,annualIncrease:720,renewalAnnual:1720,afterBackoffice:1,afterWeb:4,lines:[{label:"Additional WEB / Mobility",quantity:3,oneTime:0,annual:720,dueNow:594,referenceUnitPrice:20,unitPrice:20,unitPeriod:"month",initialDiscountPct:10,renewalDiscountPct:0}]}} as unknown as AdditionDraft;
const assets=async (asset:string)=>new Uint8Array(await readFile(path.join(process.cwd(),"public",asset)));
describe("Official addition PDF",()=>{
 it("creates a direct Portuguese PDF with actual bundled branding and fonts",async()=>{
  const bytes=await createAdditionPdf({version:1,payment_terms:"Fatura de 100% na adjudicação, pagamento a 30 dias."},draft,assets);
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getAuthor()).toBe("ManWinWin Software");expect(pdf.getTitle()).toContain("Ampliação");expect(bytes.length).toBeGreaterThan(10000);
 });
 it("paginates large conditions without dropping the last page",async()=>{
  const bytes=await createAdditionPdf({notes:Array(150).fill("Condição de demonstração para verificar a paginação das propostas oficiais.").join("\n")},draft,assets);
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(2);
 });
 it("fails visibly if required branding cannot be loaded",async()=>{
  await expect(createAdditionPdf({},draft,async()=>{throw new Error("Asset unavailable");})).rejects.toThrow("Asset unavailable");
 });
});

import { describe,expect,it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createBrandedProposalPdf } from "../proposal-branded-pdf";
const assets=async(url:string)=>new Uint8Array(await readFile(path.join(process.cwd(),"public",url)));
const html=(rows:string)=>`<html><head><title>KeepIT and UseIT frozen comparison</title></head><body><header class="brand-header"><div class="identity"><strong>Investment proposal</strong>MWW-QA · r1 · v2<br>Draft · not validated</div></header><main><h1>Frozen proposal</h1><table><thead><tr><th>Component</th><th class="num">KeepIT</th><th class="num">UseIT</th></tr></thead><tbody>${rows}</tbody></table><h2>Payment</h2><p>25% upfront\n75% upon acceptance</p></main><footer class="brand-footer"><span class="reference">MWW-QA · r1 · v2</span></footer></body></html>`;
describe("Direct opportunity PDF",()=>{
  it("creates a valid PDF using the official embedded assets without opening browser print",async()=>{
    const bytes=await createBrandedProposalPdf(html('<tr class="total-row"><td>Frozen total</td><td class="num">10,270.00 €</td><td class="num">2,270.00 €</td></tr>'),assets);
    const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getTitle()).toBe("KeepIT and UseIT frozen comparison");expect(pdf.getAuthor()).toBe("ManWinWin Software");expect(bytes.length).toBeGreaterThan(10000);
  },15000);
  it("paginates long rows and unbroken customer text without recursion or dropped pages",async()=>{
    const rows=Array.from({length:30},(_,i)=>`<tr><td>Scope ${i+1}: ${i===0?"X".repeat(3600):"Implementation, training and acceptance criteria"}</td><td class="num">100.00 €</td><td class="num">80.00 €</td></tr>`).join("");
    const pdf=await PDFDocument.load(await createBrandedProposalPdf(html(rows),assets));expect(pdf.getPageCount()).toBeGreaterThan(2);expect(pdf.getPageCount()).toBeLessThan(12);
  },15000);
});

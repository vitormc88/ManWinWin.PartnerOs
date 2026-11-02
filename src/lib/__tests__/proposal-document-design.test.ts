import { afterEach, describe, expect, it, vi } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { generateBrandedDocx } from "../proposal-branded-docx";
import { brandOpportunityHtml, documentChrome, documentReference, PROPOSAL_DESIGN_CSS } from "../proposal-document-design";
import type { Proposal } from "@/types/proposal";

afterEach(()=>vi.unstubAllGlobals());
describe("Approved proposal identity across PDF and editable Word",()=>{
  it("keeps revisions, unsaved previews and draft validation states explicit",()=>{
    expect(documentReference({language:"PT"})).toBe("Pré-visualização não guardada");
    const chrome=documentChrome({id:"abcdef12",version:4,status:"Draft",language:"PT"},"Proposta");
    expect(chrome.header).toContain("MWW-ABCDEF12 · r1 · v4");
    expect(chrome.header).toContain("Rascunho · por validar");
    expect(chrome.footer).toContain("iso9001.png");
  });
  it("escapes client content and retains the single authoritative investment table",()=>{
    const p={id:"12345678",version:1,language:"EN",client_name:'A & B <script>alert(1)</script>',proposal_date:"2026-11-02",validity_days:30} as Proposal;
    const source='<body><div class="cover"><h1>Investment</h1></div><div class="header">\n</div><p>Scope remains intact</p><section class="summary-section"><h2>Investment</h2><table><tr><td>Frozen amount</td><td>123.45 €</td></tr></table></section><div class="footer"></div></body>';
    const before=JSON.stringify(p),html=brandOpportunityHtml(source,p,"Business");
    const dom=new DOMParser().parseFromString(html,"text/html");
    expect(dom.querySelectorAll("table")).toHaveLength(1);
    expect(dom.querySelector("main")?.textContent).toContain("123.45 €");
    expect(dom.querySelector("main script")).toBeNull();
    expect(dom.querySelector(".client")?.textContent).toBe(p.client_name);
    expect(html.indexOf("Frozen amount")).toBeLessThan(html.indexOf("Scope remains intact"));
    expect(JSON.stringify(p)).toBe(before);
    expect(PROPOSAL_DESIGN_CSS).not.toContain("overflow:hidden");
  });
  it("keeps comparison amounts, discounts, line breaks and footer pagination editable in Word",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));
    let bytes:Buffer|undefined;
    const spy=vi.spyOn(Packer,"toBlob").mockImplementation(async doc=>{bytes=await Packer.toBuffer(doc);return new Blob();});
    try{
      await generateBrandedDocx(`<html><head><title>Comparison</title></head><body><header class="brand-header"><div class="identity">Client · v2</div></header><main><h1>Investment</h1><table><thead><tr><th>Item</th><th class="num">KeepIT</th><th class="num">UseIT</th></tr></thead><tbody><tr><td>Services discount 25%</td><td class="num">−90.00 €</td><td class="num">−90.00 €</td></tr><tr class="total-row"><td>Total</td><td class="num">10,270.00 €</td><td class="num">2,270.00 €</td></tr></tbody></table><h2>Special conditions</h2><p>First condition\nSecond condition &amp; taxes</p></main><footer class="brand-footer"><span class="reference">MWW-TEST · r1 · v2</span></footer></body></html>`);
      const zip=await JSZip.loadAsync(bytes!);const xml=await zip.file("word/document.xml")!.async("string");
      const text=new DOMParser().parseFromString(xml,"application/xml").documentElement.textContent;
      for(const value of ["KeepIT","UseIT","25%","−90.00 €","10,270.00 €","2,270.00 €","First condition","Second condition & taxes"])expect(text).toContain(value);
      expect(xml).toContain("<w:tblHeader/>");expect(xml).toContain("<w:cantSplit/>");expect(xml).toContain("Ubuntu");
      const footerName=Object.keys(zip.files).find(x=>/word\/footer\d+\.xml$/.test(x))!;
      const footer=await zip.file(footerName)!.async("string");expect(footer).toContain("PAGE");expect(footer).toContain("NUMPAGES");expect(footer).toContain("ISO 9001");
    }finally{spy.mockRestore();}
  });
  it("stops visibly if the official Word branding cannot load",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false}));
    await expect(generateBrandedDocx("<main><p>Terms</p></main>")).rejects.toThrow("official document branding");
  });
});

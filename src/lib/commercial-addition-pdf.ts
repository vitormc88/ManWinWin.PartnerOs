import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "./commercial-additions";
import { additionDocumentContent } from "./commercial-addition-documents";

type AssetLoader = (path: string) => Promise<Uint8Array>;
const loadAsset: AssetLoader = async path => { const r = await fetch(path); if (!r.ok) throw new Error("Unable to load official PDF branding. Please try again."); return new Uint8Array(await r.arrayBuffer()); };
const W = 595.28, H = 841.89, M = 36, WIDTH = W-2*M;
const navy=rgb(.10,.22,.28), muted=rgb(.39,.46,.50), border=rgb(.87,.90,.92), red=rgb(.98,.13,.25);

export async function createAdditionPdf(proposal: Partial<Proposal>, draft: AdditionDraft, assets: AssetLoader = loadAsset) {
  const c = additionDocumentContent(proposal,draft), doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [font,bold,logo,iso]=await Promise.all([
    assets("/customer-export/Ubuntu-R.ttf").then(b=>doc.embedFont(b,{subset:true})),
    assets("/customer-export/Ubuntu-B.ttf").then(b=>doc.embedFont(b,{subset:true})),
    assets("/customer-export/manwinwin.png").then(b=>doc.embedPng(b)),
    assets("/customer-export/iso9001.png").then(b=>doc.embedPng(b)),
  ]);
  doc.setAuthor("ManWinWin Software"); doc.setTitle(c.title);
  let page: PDFPage, y=0;
  function wrap(text:string,f:PDFFont,size:number,width:number) {
    const result:string[]=[];
    for(const p of text.replace(/→/g," > ").split(/\r?\n/)) {
      let line="";
      for(const word of p.split(/\s+/).filter(Boolean)) {
        if(f.widthOfTextAtSize(word,size)>width) {
          if(line){result.push(line);line="";}
          for(const ch of word) {if(line&&f.widthOfTextAtSize(line+ch,size)>width){result.push(line);line="";}line+=ch;}
        } else if(line&&f.widthOfTextAtSize(`${line} ${word}`,size)>width){result.push(line);line=word;}else line+=(line?" ":"")+word;
      }
      result.push(line);
    }
    return result;
  }
  function newPage() {
    page=doc.addPage([W,H]);
    const ratio=Math.min(145/logo.width,42/logo.height);
    page.drawImage(logo,{x:M,y:H-64,width:logo.width*ratio,height:logo.height*ratio});
    page.drawText(c.pt?"INDICAÇÃO DE INVESTIMENTO":"INVESTMENT PROPOSAL",{x:W-226,y:H-40,size:8,font:bold,color:muted});
    page.drawText(`PartnerOS · v${proposal.version??(c.pt?"rascunho":"draft")}`,{x:W-226,y:H-55,size:7.5,font,color:muted});
    page.drawLine({start:{x:M,y:H-79},end:{x:W-M,y:H-79},color:border,thickness:.6});y=H-108;
  }
  function paragraph(text:string,size=9,strong=false,color=navy) {
    for(const line of wrap(text,strong?bold:font,size,WIDTH)) {
      if(y<103)newPage();
      page.drawText(line,{x:M,y,size,font:strong?bold:font,color});y-=size*1.45;
    }
    y-=7;
  }
  const widths=[220,32,82,99,WIDTH-433];
  function row(cells:string[],heading=false) {
    const size=heading?7.2:8, lines=cells.map((s,i)=>wrap(s,heading?bold:font,size,widths[i]-12));
    const height=Math.max(...lines.map(s=>s.length))*11.6+16;
    if(height>H-220) {
      // Break unusually long customer-controlled descriptions into bounded rows.
      const count=Math.max(...lines.map(s=>s.length));
      for(let start=0;start<count;start+=35) row(lines.map(s=>s.slice(start,start+35).join("\n")),heading);
      return;
    }
    if(y-height<100){newPage();if(!heading)row(c.headers,true);}
    if(heading)page.drawRectangle({x:M,y:y-height+4,width:WIDTH,height,color:rgb(.95,.965,.97)});
    let x=M;
    for(let i=0;i<cells.length;i++){
      for(let j=0;j<lines[i].length;j++)page.drawText(lines[i][j],{x:x+6,y:y-10-j*11.6,size,font:heading?bold:font,color:heading?muted:navy});
      x+=widths[i];
    }
    y-=height;page.drawLine({start:{x:M,y:y+4},end:{x:W-M,y:y+4},color:border,thickness:.5});
  }
  newPage();paragraph(c.title,19,true);
  for(const detail of c.details)paragraph(detail,8.5,false,muted);
  y-=6;paragraph(c.headings.investment,12,true);row(c.headers,true);
  for(const cells of c.rows)row(cells);
  y-=16;
  for(let i=0;i<c.summary.length;i++)paragraph(c.summary[i],i<2?10:8.5,i<2,i===0?red:navy);
  y-=5;paragraph(c.headings.terms,12,true);paragraph(c.terms);
  if(c.notes){paragraph(c.headings.notes,12,true);paragraph(c.notes);}
  const pages=doc.getPages();
  for(let i=0;i<pages.length;i++) {
    page=pages[i];page.drawLine({start:{x:M,y:68},end:{x:W-M,y:68},color:border,thickness:.6});
    for(const [text,yy] of [["ManWinWin Software",55],["(+351) 214 309 100",44],["support@manwinwin.com",33],["www.manwinwin.com",22]] as const)page.drawText(text,{x:40,y:yy,size:6.5,font,color:muted});
    const ratio=Math.min(90/iso.width,42/iso.height);page.drawImage(iso,{x:W-M-90,y:20,width:iso.width*ratio,height:iso.height*ratio});
    page.drawText(`${i+1} / ${pages.length}`,{x:W/2-8,y:14,size:6.5,font,color:muted});
  }
  return doc.save();
}
export async function downloadAdditionPdf(proposal:Partial<Proposal>,draft:AdditionDraft) {
  const bytes=await createAdditionPdf(proposal,draft);
  const blob=new Blob([bytes as BlobPart],{type:"application/pdf"}),url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=`ManWinWin_${draft.baseline.clientName.replace(/[^a-zA-Z0-9_-]/g,"_")}_v${proposal.version??"draft"}.pdf`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

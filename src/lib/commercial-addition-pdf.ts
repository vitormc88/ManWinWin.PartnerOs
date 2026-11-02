import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "./commercial-additions";
import { additionDocumentLayout } from "./commercial-addition-documents";
import { DOCUMENT_DESIGN as D, documentReference } from "./proposal-document-design";

type AssetLoader = (path: string) => Promise<Uint8Array>;
const loadAsset: AssetLoader = async path => { const r = await fetch(path); if (!r.ok) throw new Error("Unable to load official PDF branding. Please try again."); return new Uint8Array(await r.arrayBuffer()); };
const W = 595.28, H = 841.89, M = 36, WIDTH = W-2*M;
const color=(hex:string)=>rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
const navy=color(D.navy), muted=color(D.muted), border=color(D.border), red=color(D.red);

export async function createAdditionPdf(proposal: Partial<Proposal>, draft: AdditionDraft, assets: AssetLoader = loadAsset) {
  const m = additionDocumentLayout(proposal,draft),c=m.c, doc = await PDFDocument.create();
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
    page.drawText(c.pt?"PROPOSTA DE INVESTIMENTO":"INVESTMENT PROPOSAL",{x:W-226,y:H-40,size:8,font:bold,color:muted});
    for(const [i,text] of wrap(documentReference({...proposal,language:c.pt?"PT":"EN"}),font,7,190).entries())page.drawText(text,{x:W-226,y:H-53-i*9,size:7,font,color:muted});
    if(proposal.status==="Draft")page.drawText(c.versionLabel,{x:W-226,y:H-66,size:6.8,font,color:muted});
    page.drawLine({start:{x:M,y:H-79},end:{x:W-M,y:H-79},color:border,thickness:.6});y=H-108;
  }
  function paragraph(text:string,size=9,strong=false,color=navy,after=7) {
    for(const line of wrap(text,strong?bold:font,size,WIDTH)) {
      if(y<103)newPage();
      page.drawText(line,{x:M,y,size,font:strong?bold:font,color});y-=size*1.45;
    }
    y-=after;
  }
  function heading(text:string) {
    // Reserve the heading plus at least two lines of following content.
    if(y<150)newPage();
    page.drawRectangle({x:M,y:y-2,width:2,height:11,color:red});
    page.drawText(text,{x:M+8,y,size:10.5,font:bold,color:navy});y-=16;
  }
  const widths=[246,82,94,WIDTH-422];
  function row(cells:string[],heading=false) {
    const size=heading?7:8, lines=cells.map((s,i)=>wrap(s,heading?bold:font,size,widths[i]-12));
    const height=Math.max(...lines.map(s=>s.length))*10.5+14;
    if(height>H-220) {
      // Break unusually long customer-controlled descriptions into bounded rows.
      const count=Math.max(...lines.map(s=>s.length));
      for(let start=0;start<count;start+=35) row(lines.map(s=>s.slice(start,start+35).join("\n")),heading);
      return;
    }
    if(y-height<100){newPage();if(!heading)row(m.headers,true);}
    if(heading)page.drawRectangle({x:M,y:y-height+4,width:WIDTH,height,color:rgb(.95,.965,.97)});
    let x=M;
    for(let i=0;i<cells.length;i++){
      for(let j=0;j<lines[i].length;j++)page.drawText(lines[i][j],{x:i?x+widths[i]-6-(heading?bold:font).widthOfTextAtSize(lines[i][j],size):x+6,y:y-10-j*10.5,size,font:heading?bold:font,color:heading?muted:navy});
      x+=widths[i];
    }
    y-=height;page.drawLine({start:{x:M,y:y+4},end:{x:W-M,y:y+4},color:border,thickness:.5});
  }
  newPage();paragraph(m.title,21,true,navy,2);paragraph(m.customer,11,true,navy,8);
  const metaWidth=WIDTH/3,metaLines=m.meta.map(([label,value])=>[label,...wrap(value,font,7.5,metaWidth-22)]),metaHeight=Math.max(...metaLines.map(lines=>lines.length))*10+18;
  page.drawRectangle({x:M,y:y-metaHeight+5,width:WIDTH,height:metaHeight,color:color(D.surface)});
  metaLines.forEach((lines,i)=>lines.forEach((line,j)=>page.drawText(line,{x:M+12+i*metaWidth,y:y-8-j*10,size:j?7.5:7,font:j?bold:font,color:j?navy:muted})));y-=metaHeight+12;
  for(const detail of m.details)paragraph(detail,7.5,false,muted,3);
  y-=5;heading(c.headings.investment);row(m.headers,true);
  for(const cells of m.rows)row(cells);
  y-=10;
  const renewalHeight=c.summary.slice(1,3).reduce((sum,t)=>sum+wrap(t,bold,9,WIDTH).length*13+6,0);
  if(y-55-renewalHeight<103)newPage();
  page.drawRectangle({x:M,y:y-45,width:WIDTH,height:47,color:navy});
  page.drawText(m.totalLabel,{x:M+13,y:y-16,size:10,font:bold,color:rgb(1,1,1)});
  page.drawText(c.pt?"Acresce IVA à taxa legal aplicável":"Excluding applicable taxes",{x:M+13,y:y-31,size:7,font,color:color("D1DDE3")});
  const totalSize=Math.min(21,190/bold.widthOfTextAtSize(m.total,1));
  page.drawText(m.total,{x:W-M-13-bold.widthOfTextAtSize(m.total,totalSize),y:y-27,size:totalSize,font:bold,color:rgb(1,1,1)});y-=59;
  for(const line of c.summary.slice(1,3))paragraph(line,9,true,navy,6);
  y-=5;for(const line of c.summary.slice(3))paragraph(line,7.5,false,muted,4);
  if(draft.selection.implementationReview==="separate"){heading(c.pt?"Orçamento de serviços ligado":"Linked services budget");for(const line of c.services)paragraph(line,8.5);}
  y-=4;heading(c.headings.terms);paragraph(c.terms,8.5);
  if(c.notes){heading(c.headings.notes);paragraph(c.notes,8.5);}
  const pages=doc.getPages();
  for(let i=0;i<pages.length;i++) {
    page=pages[i];page.drawLine({start:{x:M,y:68},end:{x:W-M,y:68},color:border,thickness:.6});
    for(const [text,yy] of [["ManWinWin Software",55],["(+351) 214 309 100",44],["support@manwinwin.com",33],["www.manwinwin.com",22]] as const)page.drawText(text,{x:40,y:yy,size:6.5,font,color:muted});
    const ratio=Math.min(90/iso.width,42/iso.height);page.drawImage(iso,{x:W-M-90,y:20,width:iso.width*ratio,height:iso.height*ratio});
    const ref=documentReference({...proposal,language:c.pt?"PT":"EN"});page.drawText(ref,{x:W/2-font.widthOfTextAtSize(ref,5.5)/2,y:28,size:5.5,font,color:muted});
    page.drawText(`${i+1} / ${pages.length}`,{x:W/2-8,y:16,size:6.5,font,color:muted});
  }
  return doc.save();
}
export async function downloadAdditionPdf(proposal:Partial<Proposal>,draft:AdditionDraft) {
  const bytes=await createAdditionPdf(proposal,draft);
  const blob=new Blob([bytes as BlobPart],{type:"application/pdf"}),url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=`ManWinWin_${draft.baseline.clientName.replace(/[^a-zA-Z0-9_-]/g,"_")}_${proposal.id && proposal.version ? `v${proposal.version}` : "preview"}.pdf`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

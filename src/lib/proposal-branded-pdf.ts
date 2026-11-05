import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { DOCUMENT_DESIGN as D } from "./proposal-document-design";

type Assets=(url:string)=>Promise<Uint8Array>;
const load:Assets=async url=>{const r=await fetch(url);if(!r.ok)throw new Error("Unable to load official PDF branding. Please try again.");return new Uint8Array(await r.arrayBuffer());};
const W=595.28,H=841.89,M=40,CW=W-M*2,FLOOR=95;
const col=(hex:string)=>rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);

/** Same semantic composition as Word; PDF pagination does not depend on browser printing. */
export async function createBrandedProposalPdf(html:string,assets:Assets=load) {
  const dom=new DOMParser().parseFromString(html,"text/html"),doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const [font,bold,logo,iso]=await Promise.all([
    assets("/customer-export/Ubuntu-R.ttf").then(b=>doc.embedFont(b,{subset:true})),
    assets("/customer-export/Ubuntu-B.ttf").then(b=>doc.embedFont(b,{subset:true})),
    assets(D.logo).then(b=>doc.embedPng(b)),assets(D.iso).then(b=>doc.embedPng(b)),
  ]);
  const ink=col(D.ink),navy=col(D.navy),muted=col(D.muted),border=col(D.border),surface=col(D.surface),white=rgb(1,1,1);
  const header=dom.querySelector(".brand-header .identity"),heading=header?.querySelector("strong")?.textContent||"Investment proposal";
  const ref=dom.querySelector(".brand-footer .reference")?.textContent||"";
  const state=header?text(header).replace(heading,"").replace(ref,"").trim():"";
  const main=dom.querySelector("main");if(!main)throw new Error("Missing proposal document content.");
  const compact=main.classList.contains("document-compact");
  let page:PDFPage,y=0;
  doc.setAuthor("ManWinWin Software");doc.setTitle(dom.title);
  function text(el:Element){const clone=el.cloneNode(true) as Element;clone.querySelectorAll("br").forEach(br=>br.replaceWith(dom.createTextNode("\n")));clone.querySelectorAll("small").forEach(s=>s.prepend(dom.createTextNode("\n")));return (clone.textContent?.trim()||"").replace(/→/g," > ");}
  function wrap(s:string,f:PDFFont,size:number,width:number):string[]{
    const lines:string[]=[];
    for(const p of s.split(/\r?\n/)){
      let line="";
      for(const word of p.split(/\s+/).filter(Boolean)){
        if(f.widthOfTextAtSize(word,size)>width){if(line){lines.push(line);line="";}for(const ch of word){if(line&&f.widthOfTextAtSize(line+ch,size)>width){lines.push(line);line="";}line+=ch;}}
        else if(line&&f.widthOfTextAtSize(line+" "+word,size)>width){lines.push(line);line=word;}else line+=(line?" ":"")+word;
      }
      lines.push(line);
    }
    return lines;
  }
  function newPage(){
    page=doc.addPage([W,H]);const ratio=Math.min(140/logo.width,42/logo.height);page.drawImage(logo,{x:M,y:H-62,width:logo.width*ratio,height:logo.height*ratio});
    const headLines=wrap(heading,bold,7.3,238),refLines=wrap(ref,font,6.7,238);
    [...headLines,...refLines,...(state?[state]:[])].slice(0,4).forEach((s,i)=>page.drawText(s,{x:W-M-(i<headLines.length?bold:font).widthOfTextAtSize(s,i<headLines.length?7.3:6.7),y:H-35-i*10,font:i<headLines.length?bold:font,size:i<headLines.length?7.3:6.7,color:muted}));
    page.drawLine({start:{x:M,y:H-78},end:{x:W-M,y:H-78},color:border,thickness:.6});y=H-105;
  }
  function ensure(height:number){if(y-height<FLOOR)newPage();}
  function paragraph(s:string,size=9,strong=false,fill=ink,gap=compact?4:6,width=CW,x=M){
    const f=strong?bold:font;
    const height=wrap(s,f,size,width).length*size*1.45;
    // Keep short notes/conditions together; long customer text still flows safely.
    if(height<=90)ensure(height+gap);
    for(const line of wrap(s,f,size,width)){ensure(size*1.45);page.drawText(line,{x,y,size,font:f,color:fill});y-=size*1.45;}y-=gap;
  }
  function title(s:string,size=11,accent=true){
    const lines=wrap(s,bold,size,CW-9);ensure(lines.length*size*1.4+(compact?25:40));y-=compact?2:4;
    if(accent)page.drawRectangle({x:M,y:y-2,width:2,height:size+1,color:col(D.red)});
    paragraph(s,size,true,navy,compact?4:5,CW-9,M+9);
  }
  function table(el:Element){
    const rows:Element[]=[...el.querySelectorAll("tr")],count=Math.max(...rows.map(row=>[...row.children].reduce((n,c)=>n+Number(c.getAttribute("colspan")||1),0)));
    const widths=Array.from({length:count},(_,i)=>count===1?CW:i===0?CW*.51:CW*.49/(count-1));
    const headers=rows.filter(r=>r.parentElement?.tagName==="THEAD");
    function drawRow(row:Element,repeating=false){
      const head=row.parentElement?.tagName==="THEAD",total=row.classList.contains("total-row"),group=row.classList.contains("header-row"),discount=row.classList.contains("discount-row");
      const size=head?7.1:compact?8:8.5,f=total||group?bold:font,cells=[...row.children];let offset=0;
      const data=cells.map(cell=>{const span=Number(cell.getAttribute("colspan")||1),width=widths.slice(offset,offset+span).reduce((a,b)=>a+b,0);offset+=span;return {cell,width,lines:wrap(text(cell),f,size,width-14)};});
      const lineHeight=compact?10.5:size*1.4,height=Math.max(...data.map(c=>c.lines.length))*lineHeight+10;
      if(height>H-210){
        const chunks=Math.ceil(Math.max(...data.map(c=>c.lines.length))/28);
        for(let k=0;k<chunks;k++){const clone=row.cloneNode(true) as Element;[...clone.children].forEach((c,i)=>c.textContent=data[i].lines.slice(k*28,(k+1)*28).join("\n"));rowChunk(clone);}
        return;
      }
      function rowChunk(chunk:Element){drawRow(chunk);}
      const nextTotal=row.nextElementSibling?.classList.contains("total-row");
      const subtotal=row.classList.contains("subtotal-row");
      const tailTotal=rows.indexOf(row)>=rows.length-2 && el.nextElementSibling?.classList.contains("year-total");
      const reserve=tailTotal?62+(rows.length-rows.indexOf(row)-1)*27:subtotal?(rows.length-rows.indexOf(row)-1)*25:nextTotal?39:head?55:0;
      if(y-height-reserve<FLOOR){newPage();if(!head&&!repeating)headers.forEach(h=>drawRow(h,true));}
      const bg=total?navy:head||group||row.classList.contains("subtotal-row")?surface:null;
      if(bg)page.drawRectangle({x:M,y:y-height+4,width:CW,height,color:bg});
      let x=M;
      data.forEach(({cell,width,lines})=>{
        const numeric=cell.classList.contains("num"),fill=total?white:head?muted:discount||cell.classList.contains("disc")||cell.classList.contains("discount")?col(D.green):ink;
        lines.forEach((line,j)=>page.drawText(line,{x:numeric?x+width-7-f.widthOfTextAtSize(line,size):x+7,y:y-10-j*lineHeight,font:f,size,color:fill}));x+=width;
      });
      y-=height;page.drawLine({start:{x:M,y:y+4},end:{x:W-M,y:y+4},color:border,thickness:.4});
    }
    rows.forEach(r=>drawRow(r));y-=10;
  }
  function total(el:Element){
    const cells=[...el.children],left=cells[0]?text(cells[0]):"",right=cells[1]?text(cells[1]):"";
    const [label,...caption]=left.split("\n"),leftLines=wrap(label,bold,9,CW*.56-24),rightSize=Math.min(14,(CW*.4-24)/bold.widthOfTextAtSize(right,1));
    const captionLines=caption.length?wrap(caption.join(" "),font,7,CW*.56-24):[];
    const height=Math.max(32,leftLines.length*12+captionLines.length*10+16);ensure(height+8);page.drawRectangle({x:M,y:y-height,width:CW,height,color:navy});
    const top=y-height/2+(leftLines.length*12+captionLines.length*10)/2-9;
    leftLines.forEach((s,i)=>page.drawText(s,{x:M+11,y:top-i*12,font:bold,size:9,color:white}));
    captionLines.forEach((s,i)=>page.drawText(s,{x:M+11,y:top-leftLines.length*12-i*10,font,size:7,color:col("D1DDE3")}));
    page.drawText(right,{x:W-M-11-bold.widthOfTextAtSize(right,rightSize),y:y-height/2-4.5,font:bold,size:rightSize,color:white});y-=height+10;
  }
  function walk(el:Element):void{
    if(el.matches("script,style,button,.brand-header,.brand-footer"))return;
    if(el.tagName==="TABLE"){table(el);return;}
    if(el.matches(".scope-grid")){
      const groups=[...el.children],width=(CW-18*(groups.length-1))/groups.length;
      const blocks=groups.map(group=>[...group.querySelectorAll("h2,li,p")].map(node=>({heading:node.tagName==="H2",lines:wrap((node.tagName==="LI"?"• ":"")+text(node),node.tagName==="H2"?bold:font,node.tagName==="H2"?10:8.5,width-9)})));
      const heights=blocks.map(block=>block.reduce((sum,b)=>sum+b.lines.length*(b.heading?14:12)+(b.heading?12:4),0));
      // Reserve the full tallest column and a real gap before the next section.
      const height=Math.max(...heights)+12;
      if(height<H-210){
        ensure(height);const start=y;
        let bottom=start;
        blocks.forEach((block,i)=>{let yy=start;const x=M+i*(width+18);block.forEach(b=>{b.lines.forEach(line=>{page.drawText(line,{x:x+7,y:yy,font:b.heading?bold:font,size:b.heading?10:8.5,color:b.heading?navy:ink});yy-=b.heading?14:12;});yy-=b.heading?12:4;});bottom=Math.min(bottom,yy);});
        y=bottom-12;return;
      }
    }
    if(el.matches(".year-total,.investment-total")){total(el);return;}
    if(el.matches(".document-meta")){
      const cells=[...el.children],width=CW/cells.length,metric=el.classList.contains("renewal-metrics"),size=metric?8.5:7.6;
      const lines=cells.map(c=>wrap(text(c),font,size,width-18)),height=Math.max(...lines.map(l=>l.length))*(size*1.5)+(compact?14:20);ensure(height+12);
      page.drawRectangle({x:M,y:y-height+4,width:CW,height,color:surface});lines.forEach((ls,i)=>ls.forEach((s,j)=>page.drawText(s,{x:M+10+i*width,y:y-10-j*size*1.5,font:j?bold:font,size,color:j?navy:muted})));y-=height+(compact?9:13);return;
    }
    if(el.matches(".summary-section,.renewal-section")){
      // Start the investment on a clean page when its complete table cannot fit.
      const rowCount=el.querySelectorAll("tr").length;
      const estimate=rowCount*23+el.querySelectorAll("thead").length*18+el.querySelectorAll(".year-total").length*42+45;
      ensure(Math.min(estimate,H-205));
    }
    if(el.matches(".services-section,.document-conditions")){
      const height=[...el.querySelectorAll("h2,h3,li,p")].reduce((n,c)=>n+wrap(text(c),font,9,CW-18).length*14+(c.matches("h2,h3")?18:5),0);
      if(height<H-210)ensure(height);
    }
    if(el.tagName==="H1"){ensure(65);paragraph(text(el),21,true,navy,compact?3:8);return;}
    if(el.matches("h2,h3,.subsection,.year-bar")){
      if(el.nextElementSibling?.tagName==="TABLE")ensure(compact?65:120);
      else if(el.nextElementSibling?.tagName==="P"){
        const following=wrap(text(el.nextElementSibling),font,9,CW).length*13.05;
        ensure(35+Math.min(following,100));
      }
      title(text(el),el.tagName==="H2"?11:9.5,el.tagName==="H2");return;
    }
    if(el.tagName==="LI"){paragraph("• "+text(el),8.5,false,ink,1.5,CW-9,M+9);return;}
    if(el.tagName==="P"){
      const small=el.matches(".small,.footnote,.y1-note,.eyebrow"),strong=el.querySelector("strong"),value=text(el);
      const allBold=!!strong&&strong.textContent?.trim()===value;
      paragraph(value,el.classList.contains("customer")?11:small?7.8:9,allBold,small?muted:ink,compact?3:5);return;
    }
    if(el.tagName==="DIV"&&![...el.children].some(c=>c.matches("div,section,table,h1,h2,h3,p,ul"))){if(text(el))paragraph(text(el),8.5);return;}
    [...el.children].forEach(walk);
  }
  newPage();
  const cover=dom.querySelector(".cover");
  if(cover){
    y=H-250;page.drawRectangle({x:M,y,width:38,height:3,color:col(D.red)});y-=36;
    for(const el of cover.children){if(el.classList.contains("cover-rule"))continue;
      if(el.tagName==="H1")paragraph(text(el),35,true,navy,18);
      else if(el.classList.contains("product")){paragraph(text(el),14,false,muted,55);}
      else if(el.classList.contains("client"))paragraph(text(el),20,true,navy,15);
      else paragraph(text(el),9,false,muted,8);
    }
    newPage();
  }
  [...main.children].forEach(walk);
  const pages=doc.getPages();pages.forEach((p,i)=>{
    p.drawLine({start:{x:M,y:68},end:{x:W-M,y:68},color:border,thickness:.6});
    ["ManWinWin Software","(+351) 214 309 100","support@manwinwin.com","www.manwinwin.com"].forEach((s,j)=>p.drawText(s,{x:M,y:55-j*10,font,size:6.3,color:muted}));
    const ratio=Math.min(86/iso.width,40/iso.height);p.drawImage(iso,{x:W-M-86,y:20,width:iso.width*ratio,height:iso.height*ratio});
    p.drawText(ref,{x:W/2-font.widthOfTextAtSize(ref,5.5)/2,y:29,font,size:5.5,color:muted});
    p.drawText(`${i+1} / ${pages.length}`,{x:W/2-8,y:16,font,size:6.5,color:muted});
  });
  return doc.save();
}

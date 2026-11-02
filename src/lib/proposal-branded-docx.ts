import { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType, type IRunOptions, type IParagraphOptions } from "docx";
import { DOCUMENT_DESIGN as D } from "./proposal-document-design";

type Block = Paragraph | Table;
const WIDTH = 10318;
const none = {style:BorderStyle.NONE,size:0,color:"FFFFFF"};
const line = {style:BorderStyle.SINGLE,size:3,color:D.border};

/** Converts our own semantic document markup to editable Word elements, not an image. */
export async function generateBrandedDocx(html: string): Promise<Blob> {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const load = async (url:string) => {const r=await fetch(url);if(!r.ok)throw new Error("Unable to load official document branding. Please try again.");return new Uint8Array(await r.arrayBuffer());};
  const [logo,iso,embeddedFont]=await Promise.all([load(D.logo),load(D.iso),load("/customer-export/Ubuntu-R.ttf")]);
  const identityElement=dom.querySelector(".brand-header .identity")?.cloneNode(true) as Element|undefined;
  identityElement?.querySelectorAll("strong,br").forEach(el=>el.replaceWith(dom.createTextNode((el.textContent||"")+"\n")));
  const identity=identityElement?.textContent?.trim() || "ManWinWin Software";
  const reference=dom.querySelector(".brand-footer .reference")?.textContent?.trim() || "";
  function runs(node:Node, options:IRunOptions={}):TextRun[] {
    if(node.nodeType===3) {
      const value=node.textContent || "";
      if(!value.trim() && /[\r\n]/.test(value))return [];
      return value.split(/\r?\n/).flatMap((text,i)=>[...(i?[new TextRun({break:1})]:[]),new TextRun({text,font:D.font,size:19,color:D.ink,...options})]);
    }
    if(node.nodeType!==1)return [];
    const el=node as Element;
    if(el.tagName==="BR")return [new TextRun({break:1})];
    const opts={...options,...(el.matches("strong,b")?{bold:true}:{}),...(el.matches("em,i")?{italics:true}:{}),...(el.matches(".discount,.disc")?{color:D.green}:{}),...(el.matches(".muted,.item-note,small")?{color:options.color==="FFFFFF"?"D1DDE3":D.muted,size:16}:{})};
    return [...el.childNodes].flatMap(n=>runs(n,opts));
  }
  function paragraph(el:Element, extra:IParagraphOptions={}):Paragraph {
    const heading=/^H[1-3]$/.test(el.tagName), size=el.tagName==="H1"?42:el.tagName==="H2"?23:el.tagName==="H3"?21:19;
    const isSmall=el.matches(".small,.footnote,.y1-note,.eyebrow");
    return new Paragraph({spacing:{before:heading?160:0,after:heading?80:75,line:254},keepNext:heading,keepLines:true,widowControl:true,
      ...(el.tagName==="H2"?{border:{left:{style:BorderStyle.SINGLE,color:D.red,size:12,space:6}}}:{}),
      children:runs(el,{size:isSmall?16:size,bold:heading,color:heading?D.navy:isSmall?D.muted:D.ink}),...extra});
  }
  function table(el:Element):Table {
    const rows=[...el.querySelectorAll("tr")];
    const count=Math.max(...rows.map(r=>[...r.children].reduce((n,c)=>n+Number(c.getAttribute("colspan")||1),0)));
    const widths=Array.from({length:count},(_,i)=>Math.round(i===0?WIDTH*.5:WIDTH*.5/(count-1)));
    return new Table({width:{size:WIDTH,type:WidthType.DXA},columnWidths:widths,layout:TableLayoutType.FIXED,
      borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:line,insideVertical:none},
      rows:rows.map(row=>{let offset=0;const total=row.classList.contains("total-row"),head=row.parentElement?.tagName==="THEAD",group=row.classList.contains("header-row");
        return new TableRow({tableHeader:head,cantSplit:true,children:[...row.children].map(cell=>{
          const span=Number(cell.getAttribute("colspan")||1),width=widths.slice(offset,offset+span).reduce((a,b)=>a+b,0);offset+=span;
          const numeric=cell.classList.contains("num") || cell.classList.contains("numeric");
          const fill=total?D.navy:head||group||row.classList.contains("subtotal-row")?D.surface:undefined;
          return new TableCell({width:{size:width,type:WidthType.DXA},columnSpan:span>1?span:undefined,margins:{top:110,bottom:110,left:90,right:90},borders:{top:none,bottom:line,left:none,right:none},shading:fill?{fill,type:ShadingType.CLEAR,color:"auto"}:undefined,
            children:[new Paragraph({alignment:numeric?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:0,line:245},keepLines:true,children:runs(cell,{size:head?16:18,bold:total||group||cell.classList.contains("strong"),color:total?"FFFFFF":head?D.muted:cell.classList.contains("disc")?D.green:D.ink})})]});
        })});})});
  }
  function totalBlock(el:Element):Table {
    const spans=[...el.children];
    return new Table({width:{size:WIDTH,type:WidthType.DXA},columnWidths:[5700,4618],layout:TableLayoutType.FIXED,borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none},rows:[new TableRow({cantSplit:true,children:spans.slice(0,2).map((s,i)=>new TableCell({width:{size:i?4618:5700,type:WidthType.DXA},margins:{top:170,bottom:170,left:180,right:180},shading:{fill:D.navy,type:ShadingType.CLEAR,color:"auto"},borders:{top:none,bottom:none,left:none,right:none},children:[new Paragraph({alignment:i?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:0},children:runs(s,{bold:true,size:i?30:21,color:"FFFFFF"})})]}))})]});
  }
  function walk(el:Element):Block[] {
    if(el.matches("script,style,button,.brand-header,.brand-footer"))return [];
    if(el.tagName==="TABLE")return [table(el)];
    if(el.matches(".year-total,.investment-total"))return [totalBlock(el),new Paragraph({spacing:{after:80},children:[]})];
    if(el.matches(".document-meta"))return [paragraph(el,{shading:{fill:D.surface,type:ShadingType.CLEAR,color:"auto"},spacing:{before:0,after:200},children:[new TextRun({text:[...el.children].map(c=>{const copy=c.cloneNode(true) as Element;copy.querySelectorAll("br").forEach(br=>br.replaceWith(dom.createTextNode(": ")));return copy.textContent;}).join("   ·   "),font:D.font,size:17,color:D.muted})]})];
    if(el.tagName==="LI")return [paragraph(el,{spacing:{after:35,line:240},indent:{left:180,hanging:180},children:[new TextRun({text:"•  ",font:D.font,size:18,color:D.muted}),...runs(el)]})];
    if(el.matches("h1,h2,h3,p,.subsection,.year-bar"))return [paragraph(el)];
    if(el.tagName==="DIV" && ![...el.children].some(c=>c.matches("div,section,table,h1,h2,h3,p,ul")))return el.textContent?.trim()?[paragraph(el)]:[];
    return [...el.children].flatMap(walk);
  }
  function header(){
    return new Header({children:[new Table({width:{size:WIDTH,type:WidthType.DXA},columnWidths:[3600,6718],borders:{top:none,bottom:line,left:none,right:none,insideHorizontal:none,insideVertical:none},rows:[new TableRow({children:[new TableCell({borders:{top:none,bottom:line,left:none,right:none},margins:{bottom:130},children:[new Paragraph({children:[new ImageRun({data:logo,type:"png",transformation:{width:140,height:43},altText:{name:"logo",title:"ManWinWin Software",description:"ManWinWin Software"}})]})]}),new TableCell({borders:{top:none,bottom:line,left:none,right:none},margins:{bottom:130},children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:identity,font:D.font,size:15,color:D.muted})]})]})]})]})]});
  }
  function footer(){
    const contact=["ManWinWin Software","(+351) 214 309 100","support@manwinwin.com","www.manwinwin.com"];
    return new Footer({children:[new Table({width:{size:WIDTH,type:WidthType.DXA},columnWidths:[4000,4618,1700],borders:{top:line,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none},rows:[new TableRow({children:[new TableCell({borders:{top:line,bottom:none,left:none,right:none},margins:{top:90},children:contact.map(text=>new Paragraph({spacing:{after:0,line:165},children:[new TextRun({text,font:D.font,size:13,color:D.muted})]}))}),new TableCell({borders:{top:line,bottom:none,left:none,right:none},margins:{top:150},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:reference,font:D.font,size:12,color:D.muted})]}),new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],font:D.font,size:12,color:D.muted}),new TextRun({text:" / ",font:D.font,size:12,color:D.muted}),new TextRun({children:[PageNumber.TOTAL_PAGES],font:D.font,size:12,color:D.muted})]})]}),new TableCell({borders:{top:line,bottom:none,left:none,right:none},margins:{top:90},children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new ImageRun({data:iso,type:"png",transformation:{width:88,height:41},altText:{name:"iso9001",title:"ISO 9001",description:"Bureau Veritas Certification"}})]})]})]})]})]});
  }
  const properties={page:{size:{width:11906,height:16838},margin:{top:1580,bottom:1450,left:794,right:794,header:420,footer:380}}};
  const cover=dom.querySelector(".cover"),main=dom.querySelector("main");
  if(!main)throw new Error("Missing proposal document content.");
  const sections=[];
  if(cover){
    const children:Block[]=[new Paragraph({spacing:{before:2700,after:160},children:[]}),new Paragraph({spacing:{after:240},children:[new TextRun({text:"━━━━",font:D.font,size:20,color:D.red})]})];
    for(const el of cover.children){
      if(el.classList.contains("cover-rule"))continue;
      children.push(paragraph(el,{spacing:{before:el.classList.contains("client")?650:0,after:el.tagName==="H1"?280:150},children:runs(el,{font:D.font,size:el.tagName==="H1"?68:el.classList.contains("client")?40:el.classList.contains("product")?28:19,bold:el.tagName==="H1"||el.classList.contains("client"),color:el.matches(".product,.cover-meta,.restricted")?D.muted:D.navy})}));
    }
    sections.push({properties,headers:{default:header()},footers:{default:footer()},children});
  }
  sections.push({properties,headers:{default:header()},footers:{default:footer()},children:[...main.children].flatMap(walk)});
  const doc=new Document({creator:"ManWinWin Software",title:dom.title,fonts:[{name:D.font,data:embeddedFont as unknown as Buffer}],styles:{default:{document:{run:{font:D.font,size:19,color:D.ink},paragraph:{spacing:{after:90,line:270}}}}},sections});
  return Packer.toBlob(doc);
}

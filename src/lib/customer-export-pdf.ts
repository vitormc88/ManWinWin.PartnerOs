import {PDFDocument,PDFString,rgb,type PDFFont,type PDFPage,type PDFImage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {supabase} from '@/integrations/supabase/client';
import {countryGroups,countryName,UNKNOWN_SECTOR,type ExplorerClient,type ExplorerFilters} from './customer-explorer';
import {customerWebsite,exportFilterLabel,reviewedExportStudy,type ExportOptions} from './customer-export';

const W=595.28,H=841.89,M=36;
const navy=rgb(.086,.22,.286),red=rgb(.98,.137,.27),gray=rgb(.39,.47,.51),border=rgb(.88,.91,.93);
const NOTE='For comparable projects or a possible reference conversation, speak to your ManWinWin partner. Customer presence does not imply availability for a reference call.';
type AssetLoader=(path:string)=>Promise<Uint8Array>;
const loadAsset:AssetLoader=async path=>{const r=await fetch(path);if(!r.ok)throw new Error('Required PDF branding could not be loaded. Please try again.');return new Uint8Array(await r.arrayBuffer())};

export function wrapPdfText(value:string,font:PDFFont,size:number,width:number){
 const lines:string[]=[];
 for(const paragraph of value.replace(/[\r\n]+/g,' ').split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(font.widthOfTextAtSize(word,size)>width){
    if(line){lines.push(line);line=''}
    let chunk='';for(const char of word){if(chunk&&font.widthOfTextAtSize(chunk+char,size)>width){lines.push(chunk);chunk=''}chunk+=char}line=chunk;
   }else if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line=word}else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
 }
 return lines;
}

export async function createCustomerPdf(rows:ExplorerClient[],options:ExportOptions,filters:ExplorerFilters,date=new Date(),assets:AssetLoader=loadAsset){
 if(!rows.length)throw new Error('Choose at least one visible customer.');
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const [font,bold,brand,iso,phone,email,web]=await Promise.all([
  assets('/customer-export/Ubuntu-R.ttf').then(b=>doc.embedFont(b,{subset:true})),
  assets('/customer-export/Ubuntu-B.ttf').then(b=>doc.embedFont(b,{subset:true})),
  assets('/customer-export/manwinwin.png').then(b=>doc.embedPng(b)),
  assets('/customer-export/iso9001.png').then(b=>doc.embedPng(b)),
  assets('/customer-export/phone.png').then(b=>doc.embedPng(b)),
  assets('/customer-export/email.png').then(b=>doc.embedPng(b)),
  assets('/customer-export/web.png').then(b=>doc.embedPng(b)),
 ]);
 doc.setAuthor('ManWinWin Software');doc.setTitle('ManWinWin | Selected customer experience');doc.setCreationDate(date);
 const printedDate=date.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
 let page:PDFPage,y=0;
 function text(s:string,x:number,yy:number,size=10,strong=false,color=navy){page.drawText(s,{x,y:yy,size,font:strong?bold:font,color})}
 function lines(s:string,x:number,top:number,width:number,size=9,strong=false,color=navy){const ls=wrapPdfText(s,strong?bold:font,size,width);for(let i=0;i<ls.length;i++)text(ls[i],x,top-i*size*1.4,size,strong,color);return ls.length*size*1.4}
 function contain(image:PDFImage,x:number,yy:number,width:number,height:number){const ratio=Math.min(width/image.width,height/image.height);const w=image.width*ratio,h=image.height*ratio;page.drawImage(image,{x:x+(width-w)/2,y:yy+(height-h)/2,width:w,height:h})}
 function link(label:string,url:string,x:number,yy:number,size=8){
  text(label,x,yy,size,true,red);
  const ref=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,yy-2,x+bold.widthOfTextAtSize(label,size),yy+size+2],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(url)}}));page.node.addAnnot(ref);
 }
 function newPage(heading?:string){
  page=doc.addPage([W,H]);contain(brand,M,H-68,145,44);
  text('CUSTOMER EXPLORER',W-172,H-42,8,true,gray);text(printedDate,W-172,H-57,7.2,false,gray);
  page.drawLine({start:{x:M,y:H-79},end:{x:W-M,y:H-79},color:border,thickness:.6});
  y=H-112;if(heading){text(heading,M,y,20,true);y-=38}
 }
 newPage();
 text('SELECTED CUSTOMER EXPERIENCE',M,y,8.5,true,red);y-=36;
 y-=lines(filters.sector||'Selected customers',M,y,W-2*M,28,true)+5;
 y-=lines('A focused selection from the ManWinWin customer network.',M,y,W-2*M,10,false,gray)+20;
 const countries=countryGroups(rows),studies=options.caseStudies?rows.filter(reviewedExportStudy):[];
 text(`${rows.length} SELECTED ${rows.length===1?'CUSTOMER':'CUSTOMERS'}`,M,y,9,true);text(`${countries.length} ${countries.length===1?'COUNTRY':'COUNTRIES'}`,225,y,9,true);
 if(studies.length)text(`${studies.length} PUBLIC ${studies.length===1?'STORY':'STORIES'}`,367,y,9,true);y-=22;
 y-=lines(exportFilterLabel(filters),M,y,W-2*M,8,false,gray)+14;
 if(options.map){
  const geo=JSON.parse(new TextDecoder().decode(await assets('/customer-explorer-world.geojson'))) as {features:{properties:{NAME:string;ISO_A2:string};geometry:{type:string;coordinates:number[][][]|number[][][][]}}[]};
  const top=y,height=170,left=M+12,mw=W-2*M-24,mh=123;
  page.drawRectangle({x:M,y:top-height,width:W-2*M,height,color:rgb(.96,.975,.98)});
  text('CUSTOMER PRESENCE IN THIS SELECTION',M+14,top-19,8,true,gray);
  const project=(lon:number,lat:number)=>[(lon+180)/360*mw,(83-lat)/143*mh];
  const codes=new Set(countries.map(g=>g.code));
  for(const f of geo.features.filter(f=>f.properties.NAME!=='Antarctica')){
   const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates as number[][][]]:f.geometry.coordinates as number[][][][];
   const path=polygons.map(p=>p.map(r=>r.map(([lon,lat],i)=>{const [x,yy]=project(lon,lat);return `${i?'L':'M'}${x.toFixed(2)},${yy.toFixed(2)}`}).join(' ')+' Z').join(' ')).join(' ');
   page.drawSvgPath(path,{x:left,y:top-27,color:codes.has(f.properties.ISO_A2)?rgb(1,.85,.89):rgb(.88,.91,.93),borderColor:rgb(1,1,1),borderWidth:.3});
  }
  for(const g of countries.filter(g=>g.lon!==undefined&&g.lat!==undefined)){
   const [xx,yy]=project(g.lon!,g.lat!);const x=left+xx,py=top-27-yy;
   page.drawCircle({x,y:py,size:6,color:red});const label=String(g.count);text(label,x-bold.widthOfTextAtSize(label,5.5)/2,py-2,5.5,true,rgb(1,1,1));
  }
  text('Country-level markers, not customer addresses. Map: Natural Earth.',M+14,top-height+9,6.7,false,gray);y=top-height-18;
 }
 // Private Storage remains the authoritative logo source. Missing/inaccessible images are omitted.
 async function logo(row:ExplorerClient){
  if(!options.logos||!row.logo_path)return null;
  try{
   const {data,error}=await supabase.storage.from('customer-explorer-logos').download(row.logo_path);
   if(error||!data)return null;const bytes=new Uint8Array(await data.arrayBuffer());
   if(data.type==='image/jpeg')return await doc.embedJpg(bytes);
   if(data.type==='image/png')return await doc.embedPng(bytes);
   // Convert WebP to PNG locally; never send customer data to a rendering service.
   const bitmap=await createImageBitmap(data),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();return null}ctx.drawImage(bitmap,0,0);bitmap.close();
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));return blob?await doc.embedPng(await blob.arrayBuffer()):null;
  }catch{return null}
 }
 const cw=(W-2*M-12)/2;
 for(let i=0;i<rows.length;i+=2){
  const pair=rows.slice(i,i+2);
  const images=await Promise.all(pair.map(logo));
  const models=pair.map((r,j)=>{
   const title=wrapPdfText(r.name,bold,12,cw-28),sector=wrapPdfText(r.sector||UNKNOWN_SECTOR,font,8.5,cw-28);
   const website=options.websites?customerWebsite(r):null,study=options.caseStudies?reviewedExportStudy(r):null;
   return {r,image:images[j],title,sector,website,study,height:32+(images[j]?38:0)+title.length*16+sector.length*12+((website||study)?24:8)};
  });
  const height=Math.max(...models.map(m=>m.height));
  if(y-height<112){newPage('Selected customers (continued)')}
  for(let j=0;j<models.length;j++){
   const m=models[j],x=M+j*(cw+12),bottom=y-height;
   page.drawRectangle({x,y:bottom,width:cw,height,borderColor:border,borderWidth:.6});
   text(countryName(m.r.country),x+14,y-19,8,false,gray);
   let cy=y-36;if(m.image){if(m.r.logo_dark)page.drawRectangle({x:x+14,y:cy-28,width:76,height:28,color:navy});contain(m.image,x+14,cy-28,76,28);cy-=38}
   for(const line of m.title){text(line,x+14,cy,12,true);cy-=16}
   for(const line of m.sector){text(line,x+14,cy,8.5,false,gray);cy-=12}
   if(m.website){link(new URL(m.website).hostname.replace(/^www\./,''),m.website,x+14,bottom+13,7.5)}
   if(m.study)link('Public story >',m.study.url,x+cw-90,bottom+13,7.5);
  }
  y-=height+12;
 }
 if(y<144)newPage();
 y-=lines(NOTE,M,y-7,W-2*M,8.1,false,gray);
 if(studies.length){
  newPage('Public implementation stories');
  y-=lines('Summaries reviewed by HQ. Article claims, not independently audited results.',M,y,W-2*M,9,false,gray)+20;
  for(const row of studies){
   const s=reviewedExportStudy(row)!;
   if(y<220)newPage('Public implementation stories (continued)');
   y-=lines(row.name,M,y,W-2*M,14,true)+4;
   y-=lines(s.title,M,y,W-2*M,10,false,gray)+9;
   for(const [label,value] of [['Project scope',s.scope],['Starting point',s.problem],['Implementation',s.approach],['Published account',s.evidence],['Keep in mind',s.limitation]]){
    const ls=wrapPdfText(`${label}: ${value}`,font,9,W-2*M);
    for(const line of ls){if(y<110)newPage(`${row.name} (continued)`);text(line,M,y,9);y-=12.6}y-=6;
   }
   if(y<125)newPage(`${row.name} (continued)`);
   link('Read the full case study on manwinwin.com >',s.url,M,y,8);y-=18;
   text(`Source reviewed ${s.reviewed_at} | ${s.language}`,M,y,7,false,gray);y-=26;
  }
 }
 const pages=doc.getPages();for(let i=0;i<pages.length;i++){
  page=pages[i];page.drawLine({start:{x:M,y:65},end:{x:W-M,y:65},color:border,thickness:.6});
  text('ManWinWin Software',40,53,6.5,false,gray);
  for(const [icon,label,yy] of [[phone,'(+351) 214 309 100',42],[email,'support@manwinwin.com',31],[web,'www.manwinwin.com',20]] as const){contain(icon,40,yy-1,7,7);text(label,61,yy,6.3,false,gray)}
  contain(iso,W-132,17,90,42);text(`${i+1} / ${pages.length}`,W/2-8,12,6.3,false,gray);
 }
 return doc.save();
}

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, Header, Footer, ImageRun } from "docx";
import { saveAs } from "file-saver";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "./commercial-additions";
import { additionDocumentContent } from "./commercial-addition-documents";
import logoUrl from "@/assets/manwinwin-logo.png";

export async function generateAdditionDocx(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const c = additionDocumentContent(proposal, draft);
  const p = (text: string, bold = false) => new Paragraph({ spacing: { after: 130 }, children: [new TextRun({ text, bold, size: bold ? 25 : 21 })] });
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error("Unable to load ManWinWin document logo.");
  const logo = new Uint8Array(await response.arrayBuffer());
  const headers = c.headers;
  const isoResponse = await fetch("/customer-export/iso9001.png");
  if (!isoResponse.ok) throw new Error("Unable to load ISO document footer.");
  const iso = new Uint8Array(await isoResponse.arrayBuffer());
  const document = new Document({ creator: "PartnerOS", title: c.title, sections: [{
    headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ data: logo, type: "png", transformation: { width: 180, height: 45 } })] })] }) },
    footers: { default: new Footer({ children: [new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:{top:{style:"single",size:3,color:"DDE3E8"},bottom:{style:"none"},left:{style:"none"},right:{style:"none"},insideHorizontal:{style:"none"},insideVertical:{style:"none"}},rows:[new TableRow({children:[new TableCell({width:{size:78,type:WidthType.PERCENTAGE},children:[new Paragraph({children:[new TextRun({text:"ManWinWin Software\n(+351) 214 309 100\nsupport@manwinwin.com\nwww.manwinwin.com",size:14,color:"687680"})]})]}),new TableCell({children:[new Paragraph({children:[new ImageRun({data:iso,type:"png",transformation:{width:90,height:42}})]})]})]})]})] }) },
    children: [p(c.title, true), ...c.details.map(x => p(x)), p(c.headings.investment, true),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headers, ...c.rows].map((row, i) => new TableRow({ tableHeader: i === 0, children: row.map(text => new TableCell({ children: [p(text, i === 0)] })) })) }),
      ...c.summary.map(x => p(x)), p(c.headings.terms, true), ...c.terms.split(/\r?\n/).map(x => p(x)),
      ...(c.notes ? [p(c.headings.notes, true), ...c.notes.split(/\r?\n/).map(x => p(x))] : []),
    ],
  }] });
  return Packer.toBlob(document);
}
export async function downloadAdditionDocx(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const blob = await generateAdditionDocx(proposal, draft);
  saveAs(blob, `Addition_${draft.baseline.clientName.replace(/[^a-zA-Z0-9_-]/g, "_")}_v${proposal.version ?? "draft"}.docx`);
}

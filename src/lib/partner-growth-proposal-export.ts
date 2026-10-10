import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Footer, PageNumber, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { StrategicProposalSnapshot } from "./partner-growth-proposal";

const BRAND = "D5222B";
const DARK = "25364B";
const MUTED = "617184";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 58;
const safeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "partner";
const fileName = (snapshot: StrategicProposalSnapshot, version: number, ext: string) =>
  "ManWinWin_" + safeName(snapshot.prospect_name) + "_Strategic_Proposal_v" + version + "." + ext;

function textRun(value: string, size = 21, bold = false, color = DARK) {
  return new TextRun({ text: value, font: "Aptos", size, bold, color });
}
function paragraph(text: string, after = 140) {
  return new Paragraph({ spacing: { after }, children: [textRun(text)] });
}
export async function exportStrategicProposalDocx(
  snapshot: StrategicProposalSnapshot, version: number, approved: boolean,
) {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 220 },
      children: [textRun("MANWINWIN", 38, true, BRAND)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 350 },
      children: [textRun("PARTNERSHIP DEVELOPMENT", 20, true, MUTED)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 260, after: 260 },
      children: [textRun(snapshot.title, 40, true)],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [textRun(snapshot.subtitle, 24, true, BRAND)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 750 }, children: [textRun(snapshot.prospect_name + " · " + snapshot.country, 20, false, MUTED)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [textRun(snapshot.proposal_notice, 18, true, BRAND)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [textRun(approved ? "APPROVED FOR HQ USE" : "DRAFT — INTERNAL REVIEW", 20, true, approved ? DARK : BRAND)] }),
    new Paragraph({ pageBreakBefore: true, spacing: { after: 160 }, children: [textRun("Prepared by ManWinWin Partner Growth", 20, true, MUTED)] }),
  ];
  for (const s of snapshot.sections) {
    paragraphs.push(new Paragraph({
      text: s.heading,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, color: BRAND, size: 12, space: 8 } },
    }));
    for (const t of s.paragraphs) paragraphs.push(paragraph(t));
    for (const b of s.bullets ?? []) paragraphs.push(new Paragraph({
      spacing: { after: 100 }, bullet: { level: 0 }, children: [textRun(b)],
    }));
  }
  if (snapshot.evidence.length) {
    paragraphs.push(new Paragraph({ text: "Source Register", heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }));
    snapshot.evidence.forEach((e, i) => {
      paragraphs.push(paragraph((i + 1) + ". " + e.title + " — " + e.finding));
      if (e.url) paragraphs.push(new Paragraph({ children: [textRun(e.url, 17, false, MUTED)], spacing: { after: 80 } }));
    });
  }
  if (snapshot.missing_inputs.length) {
    paragraphs.push(new Paragraph({ text: "Preflight — items to confirm before approval", heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }));
    snapshot.missing_inputs.forEach(t => paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: [textRun(t, 19, false, BRAND)] })));
  }
  paragraphs.push(new Paragraph({ spacing: { before: 350 }, children: [textRun(snapshot.research_limitations, 17, false, MUTED)] }));
  const doc = new Document({
    creator: "ManWinWin Partner Growth",
    title: snapshot.title,
    description: "Strategic partnership discussion document — not a contract",
    sections: [{
      properties: { page: { margin: { top: 1050, bottom: 850, left: 950, right: 950 } } },
      children: paragraphs,
      footers: { default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [textRun("ManWinWin • " + (approved ? "HQ APPROVED" : "DRAFT") + " •  ", 16, false, MUTED), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })],
        })],
      }) },
    }],
  });
  saveAs(await Packer.toBlob(doc), fileName(snapshot, version, "docx"));
}

function asciiSafe(text: string) {
  // Standard PDF fonts cannot render all Unicode characters; substitute common punctuation.
  return text.replace(/[–—]/g, "-").replace(/[•·]/g, "-").replace(/[“”]/g, '"')
    .replace(/[’]/g, "'").replace(/[^\x20-\x7e\u00c0-\u00ff]/g, "?");
}
function wrap(text: string, font: { widthOfTextAtSize: (t: string, size: number) => number }, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of asciiSafe(text).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const attempt = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(attempt, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else current = attempt;
    }
    lines.push(current);
  }
  return lines;
}
export async function exportStrategicProposalPdf(
  snapshot: StrategicProposalSnapshot, version: number, approved: boolean,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(snapshot.title);
  pdf.setAuthor("ManWinWin Partner Growth");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.84, 0.13, 0.18);
  const ink = rgb(0.15, 0.21, 0.29);
  const gray = rgb(0.42, 0.47, 0.53);
  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;
  const nextPage = () => { page = pdf.addPage([A4_WIDTH, A4_HEIGHT]); y = A4_HEIGHT - MARGIN; };
  const add = (txt: string, size = 10.5, style: "normal"|"bold" = "normal", color = ink, indent = 0, after = 12) => {
    const font = style === "bold" ? bold : regular;
    const lines = wrap(txt, font, size, A4_WIDTH - 2 * MARGIN - indent);
    for (const line of lines) {
      if (y < MARGIN + 25) nextPage();
      page.drawText(line, { x: MARGIN + indent, y, size, font, color });
      y -= size * 1.45;
    }
    y -= after;
  };
  add("MANWINWIN", 23, "bold", red, 0, 22);
  add("PARTNERSHIP DEVELOPMENT", 12, "bold", gray, 0, 52);
  add(snapshot.title, 19, "bold", ink, 0, 20);
  add(snapshot.subtitle, 12, "bold", red, 0, 18);
  add(snapshot.prospect_name + " | " + snapshot.country, 11, "normal", gray, 0, 55);
  add(snapshot.proposal_notice, 10, "bold", red, 0, 16);
  add(approved ? "HQ APPROVED" : "DRAFT - INTERNAL REVIEW", 12, "bold", red);
  nextPage();
  for (const section of snapshot.sections) {
    if (y < 110) nextPage();
    add(section.heading, 13, "bold", red, 0, 14);
    for (const t of section.paragraphs) add(t, 10.5, "normal", ink);
    for (const b of section.bullets ?? []) add("- " + b, 10, "normal", ink, 12, 8);
    y -= 13;
  }
  if (snapshot.evidence.length) {
    add("SOURCE REGISTER", 13, "bold", red);
    for (const source of snapshot.evidence) {
      add(source.title + ": " + source.finding, 9.5);
      if (source.url) add(source.url, 8.5, "normal", gray);
    }
  }
  if (snapshot.missing_inputs.length) {
    add("PREFLIGHT - TO CONFIRM BEFORE APPROVAL", 12, "bold", red);
    snapshot.missing_inputs.forEach(x => add("- " + x, 9.5));
  }
  add(snapshot.research_limitations, 8.5, "normal", gray);
  const bytes = await pdf.save();
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), fileName(snapshot, version, "pdf"));
}

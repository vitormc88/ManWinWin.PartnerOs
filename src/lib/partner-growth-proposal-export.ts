/**
 * Partner Growth | Proposal Design System v2.
 * Client-side export only. It never modifies the approved JSON snapshot,
 * partner permissions, a sales opportunity, or a commercial agreement.
 * The design is deliberately shared between DOCX and PDF.
 */
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Footer, PageNumber,
  HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import logoUrl from "@/assets/manwinwin-logo.png";
import type { StrategicProposalSnapshot, ProposalSection } from "./partner-growth-proposal";

const BRAND = "D5222B";
const NAVY = "172B43";
const INK = "26374A";
const MUTED = "617184";
const LIGHT = "EEF3F7";
const PALE_RED = "FFF1F1";
const WHITE = "FFFFFF";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 52;
const CONTENT = A4_WIDTH - 2 * MARGIN;
const safeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "partner";
const fileName = (snapshot: StrategicProposalSnapshot, version: number, ext: string) =>
  "ManWinWin_" + safeName(snapshot.prospect_name) + "_Strategic_Proposal_v" + version + "." + ext;
const colorRgb = (hex: string) => rgb(
  parseInt(hex.slice(0, 2), 16) / 255,
  parseInt(hex.slice(2, 4), 16) / 255,
  parseInt(hex.slice(4, 6), 16) / 255,
);
const short = (value: string, max = 350) => value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;
const bodyText = (value: string, size = 20, bold = false, color = INK): TextRun =>
  new TextRun({ text: value, font: "Aptos", size, bold, color });
const bodyParagraph = (value: string, after = 140): Paragraph =>
  new Paragraph({ spacing: { after, line: 330 }, children: [bodyText(value)] });
const whitespace = (size = 180) => new Paragraph({ spacing: { after: size }, children: [] });
const thinBorders = {
  top: { style: BorderStyle.SINGLE, color: "DDE5EC", size: 4 },
  bottom: { style: BorderStyle.SINGLE, color: "DDE5EC", size: 4 },
  left: { style: BorderStyle.SINGLE, color: "DDE5EC", size: 4 },
  right: { style: BorderStyle.SINGLE, color: "DDE5EC", size: 4 },
};

async function logoBytes(): Promise<Uint8Array | null> {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch { return null; }
}
function docxCell(value: string, options: { fill?: string; textColor?: string; bold?: boolean; width?: number } = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill, color: "auto" } : undefined,
    borders: thinBorders,
    margins: { top: 130, bottom: 130, left: 140, right: 140 },
    children: [new Paragraph({ spacing: { after: 0 }, children: [
      bodyText(value, 18, options.bold ?? false, options.textColor || INK),
    ] })],
  });
}
function docxSectionHeading(value: string) {
  return new Paragraph({
    text: value,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 380, after: 180 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 8 } },
  });
}
function docxBullet(value: string) {
  return new Paragraph({
    spacing: { after: 95, line: 290 },
    indent: { left: 380, hanging: 160 },
    children: [bodyText("•  ", 20, true, BRAND), bodyText(value, 19)],
  });
}

export async function exportStrategicProposalDocx(snapshot: StrategicProposalSnapshot, version: number, approved: boolean) {
  const logo = await logoBytes();
  const cover: Paragraph[] = [];
  if (logo) {
    // Preserve logo aspect in a restrained header position. It is a brand mark, not a hero photo.
    cover.push(new Paragraph({
      spacing: { before: 420, after: 560 },
      children: [new ImageRun({ data: logo, type: "png", transformation: { width: 175, height: 59 } })],
    }));
  } else {
    cover.push(new Paragraph({ spacing: { before: 400, after: 500 }, children: [bodyText("MANWINWIN", 34, true, BRAND)] }));
  }
  cover.push(new Paragraph({
    spacing: { after: 170 },
    children: [bodyText("P A R T N E R S H I P   D E V E L O P M E N T", 17, true, BRAND)],
  }));
  cover.push(new Paragraph({ spacing: { after: 100 }, children: [bodyText("STRATEGIC", 57, true, NAVY)] }));
  cover.push(new Paragraph({ spacing: { after: 420 }, children: [bodyText("PARTNERSHIP PROPOSAL", 48, true, NAVY)] }));
  cover.push(new Paragraph({ spacing: { after: 70 }, children: [bodyText("ManWinWin  ×  " + snapshot.prospect_name, 28, true, BRAND)] }));
  cover.push(new Paragraph({ spacing: { after: 370 }, children: [bodyText(snapshot.subtitle + "  |  " + snapshot.country, 20, false, MUTED)] }));
  const opportunity = short(snapshot.executive_message || snapshot.objective, 420);
  const opportunityCard = new Table({
    width: { size: 9750, type: WidthType.DXA },
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: NAVY, color: "auto" },
      margins: { top: 270, bottom: 270, left: 320, right: 320 },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        new Paragraph({ spacing: { after: 110 }, children: [bodyText("THE COLLABORATION OPPORTUNITY", 17, true, "F4A3A6")] }),
        new Paragraph({ spacing: { after: 0, line: 380 }, children: [bodyText(opportunity, 24, true, WHITE)] }),
      ],
    })] })],
  });
  const content: (Paragraph | Table)[] = [
    ...cover,
    whitespace(120),
    opportunityCard,
    whitespace(200),
  ];
  if (snapshot.value_pillars?.length) {
    content.push(new Table({
      width: { size: 9750, type: WidthType.DXA },
      rows: [new TableRow({ children: snapshot.value_pillars.slice(0, 3).map(p =>
        new TableCell({
          shading: { fill: LIGHT, type: ShadingType.CLEAR, color: "auto" },
          borders: thinBorders, margins: { top: 160, bottom: 150, left: 140, right: 140 },
          children: [
            new Paragraph({ spacing: { after: 100 }, children: [bodyText(p.label, 16, true, BRAND)] }),
            new Paragraph({ spacing: { after: 0 }, children: [bodyText(short(p.detail, 180), 18)] }),
          ],
        }),
      ) })],
    }));
  }
  content.push(whitespace(310));
  content.push(new Paragraph({ spacing: { after: 90 },
    children: [bodyText(approved ? "HQ APPROVED PROPOSAL" : "DRAFT • FOR HQ REVIEW", 18, true, BRAND)] }));
  content.push(new Paragraph({ spacing: { after: 0 },
    children: [bodyText("Confidential discussion document. Not a contract.  •  Version " + version, 17, false, MUTED)] }));
  content.push(new Paragraph({
    pageBreakBefore: true,
    spacing: { after: 170 },
    children: [bodyText("THE PARTNERSHIP IN CONTEXT", 20, true, BRAND)],
  }));
  content.push(new Paragraph({ spacing: { after: 90 }, children: [bodyText("A practical collaboration, not a generic software pitch.", 31, true, NAVY)] }));
  content.push(bodyParagraph(
    "The approach below is tailored to the available evidence and to the operating responsibilities proposed for " + snapshot.prospect_name + ".",
    280,
  ));
  for (const section of snapshot.sections) {
    content.push(docxSectionHeading(section.heading));
    section.paragraphs.forEach(p => content.push(bodyParagraph(p)));
    (section.bullets || []).forEach(b => content.push(docxBullet(b)));
    if (section.heading.startsWith("03") && snapshot.responsibility_matrix?.length) {
      content.push(whitespace(90));
      const header = new TableRow({ children: [
        docxCell("ACTIVITY", { fill: NAVY, textColor: WHITE, bold: true, width: 3250 }),
        docxCell(snapshot.prospect_name.toUpperCase(), { fill: NAVY, textColor: WHITE, bold: true, width: 3250 }),
        docxCell("MANWINWIN", { fill: NAVY, textColor: WHITE, bold: true, width: 3250 }),
      ] });
      const rows = snapshot.responsibility_matrix.map(row => new TableRow({ children: [
        docxCell(row.activity, { bold: true }), docxCell(row.partner), docxCell(row.manwinwin),
      ] }));
      content.push(new Table({ width: { size: 9750, type: WidthType.DXA }, rows: [header, ...rows] }));
      content.push(new Paragraph({ spacing: { before: 80, after: 150 }, children: [
        bodyText("Illustrative responsibilities only — final allocation is agreed per opportunity.", 17, false, MUTED),
      ] }));
    }
  }
  if (snapshot.evidence.length) {
    content.push(docxSectionHeading("SOURCE REGISTER | HQ-VERIFIED INPUTS"));
    snapshot.evidence.forEach((e, i) => {
      content.push(bodyParagraph((i + 1) + ". " + e.title + " — " + e.finding, 55));
      if (e.url) content.push(new Paragraph({ spacing: { after: 130 }, children: [bodyText(e.url, 16, false, MUTED)] }));
    });
  }
  if (snapshot.missing_inputs.length) {
    content.push(docxSectionHeading("INTERNAL PREFLIGHT | NOT FOR EXTERNAL DISTRIBUTION"));
    snapshot.missing_inputs.forEach(m => content.push(docxBullet(m)));
  }
  content.push(whitespace(170));
  content.push(new Paragraph({ spacing: { before: 100 }, children: [bodyText(snapshot.research_limitations, 16, false, MUTED)] }));
  const doc = new Document({
    creator: "ManWinWin Partner Growth",
    title: snapshot.title,
    description: "Strategic partnership discussion proposal, not a contract.",
    styles: {
      paragraphStyles: [{
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { color: NAVY, bold: true, size: 26, font: "Aptos Display" },
        paragraph: { spacing: { before: 380, after: 180 }, keepNext: true },
      }],
    },
    sections: [{
      properties: { page: { margin: { top: 950, bottom: 950, left: 930, right: 930 } } },
      children: content,
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          bodyText("ManWinWin  |  " + (approved ? "HQ Approved" : "Confidential Draft") + "  |  v" + version + "  •  ", 16, false, MUTED),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
        ],
      })] }) },
    }],
  });
  saveAs(await Packer.toBlob(doc), fileName(snapshot, version, "docx"));
}

// pdf-lib's StandardFonts use WinAnsi rather than full Unicode.
function pdfSafe(text: string) {
  return text.replace(/[–—−]/g, "-").replace(/[•·]/g, "-").replace(/[“”]/g, '"')
    .replace(/[’]/g, "'").replace(/[×]/g, "x").replace(/[→]/g, "->")
    .replace(/[^\x20-\x7e\u00c0-\u00ff]/g, "?");
}
function pdfWrap(text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, width: number) {
  const result: string[] = [];
  for (const logicalLine of pdfSafe(text).split("\n")) {
    let current = "";
    const words = logicalLine.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (current && font.widthOfTextAtSize(candidate, size) > width) {
        result.push(current); current = word;
      } else current = candidate;
      if (font.widthOfTextAtSize(current, size) > width) {
        let chunk = "";
        for (const char of current) {
          if (chunk && font.widthOfTextAtSize(chunk + char, size) > width) {
            result.push(chunk); chunk = char;
          } else chunk += char;
        }
        current = chunk;
      }
    }
    result.push(current);
  }
  return result;
}
export async function exportStrategicProposalPdf(snapshot: StrategicProposalSnapshot, version: number, approved: boolean) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(snapshot.title);
  pdf.setAuthor("ManWinWin Partner Growth");
  pdf.setSubject("Confidential partnership discussion document, not a contract");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = colorRgb(BRAND), navy = colorRgb(NAVY), ink = colorRgb(INK);
  const muted = colorRgb(MUTED), pale = colorRgb(LIGHT), white = rgb(1,1,1);
  const logo = await logoBytes();
  let embeddedLogo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (logo) {
    try { embeddedLogo = await pdf.embedPng(logo); } catch { embeddedLogo = null; }
  }

  // Cover follows the existing ManWinWin strategic-partnership design language:
  // white canvas, bold red rules, partner identity, value-chain graphic and
  // three compact outcome cards. No guessed partner logo or stock imagery.
  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, color: white });
  page.drawText("STRATEGIC PARTNERSHIP PROPOSITION", {
    x: MARGIN, y: 796, size: 9, font: bold, color: brand,
  });
  page.drawRectangle({ x: MARGIN, y: 771, width: CONTENT, height: 2, color: brand });
  // Two-party header, using the real ManWinWin identity and the partner's
  // verified name (never an automatically guessed logo).
  page.drawRectangle({ x: MARGIN, y: 673, width: 222, height: 80, color: pale });
  if (embeddedLogo) {
    const factor = Math.min(187 / embeddedLogo.width, 57 / embeddedLogo.height);
    const width = embeddedLogo.width * factor, height = embeddedLogo.height * factor;
    page.drawImage(embeddedLogo, {
      x: MARGIN + (222 - width) / 2, y: 673 + (80 - height) / 2, width, height,
    });
  } else {
    page.drawText("MANWINWIN", { x: MARGIN + 20, y: 704, size: 20, font: bold, color: navy });
  }
  page.drawText("×".replace("×", "x"), { x: MARGIN + 245, y: 702, size: 20, font: bold, color: brand });
  page.drawRectangle({ x: MARGIN + 280, y: 673, width: CONTENT - 280, height: 80, color: navy });
  const partnerLines = pdfWrap(snapshot.prospect_name, bold, 14, CONTENT - 309).slice(0, 3);
  partnerLines.forEach((line, i) => page.drawText(line, {
    x: MARGIN + 293, y: 714 - i * 18, size: 14, font: bold, color: white,
  }));
  page.drawText("STRATEGIC", { x: MARGIN - 1, y: 625, size: 31, font: bold, color: navy });
  page.drawText("PARTNERSHIP", { x: MARGIN - 1, y: 588, size: 31, font: bold, color: navy });
  page.drawText("PROPOSAL", { x: MARGIN - 1, y: 551, size: 31, font: bold, color: navy });
  const subtitleLines = pdfWrap(snapshot.subtitle, regular, 11, CONTENT);
  subtitleLines.slice(0, 2).forEach((line, i) => page.drawText(line, {
    x: MARGIN, y: 522 - i * 15, size: 11, font: regular, color: muted,
  }));
  page.drawText("THE COLLABORATION OPPORTUNITY", {
    x: MARGIN, y: 471, size: 9, font: bold, color: brand,
  });
  const coverSummary = short(snapshot.executive_message || snapshot.objective, 290);
  const executiveLines = pdfWrap(coverSummary, regular, 10.8, CONTENT).slice(0, 4);
  executiveLines.forEach((line, i) => page.drawText(line, {
    x: MARGIN, y: 452 - i * 16, size: 10.8, font: regular, color: navy,
  }));
  const bandTop = 367, bandH = 72;
  const widths = [CONTENT * 0.38, CONTENT * 0.24, CONTENT * 0.38];
  const labels = ["PARTNER INSIGHT", "SHARED CUSTOMER VALUE", "MAINTENANCE ACTION"];
  const bandColors = [brand, pale, navy];
  let bandX = MARGIN;
  widths.forEach((w, i) => {
    page.drawRectangle({ x: bandX, y: bandTop - bandH, width: w, height: bandH, color: bandColors[i] });
    const lines = pdfWrap(labels[i], bold, i === 1 ? 8 : 10.3, w - 20);
    const start = bandTop - 29 + (lines.length === 1 ? 0 : 8);
    lines.forEach((l, j) => page.drawText(l, {
      x: bandX + 10, y: start - j * 14, size: i === 1 ? 8 : 10.3,
      font: bold, color: i === 1 ? muted : white,
    }));
    bandX += w;
  });
  page.drawText("FROM CUSTOMER OPPORTUNITY TO MAINTENANCE IMPACT.", {
    x: MARGIN, y: 268, size: 12.1, font: bold, color: brand,
  });
  page.drawText(approved ? "HQ APPROVED • PROPOSED COMMERCIAL COLLABORATION" : "DISCUSSION DOCUMENT • HQ REVIEW REQUIRED", {
    x: MARGIN, y: 246, size: 8.6, font: bold, color: muted,
  });
  const highlightLabels = [
    ["FOCUSED START", "One meaningful first opportunity"],
    ["CLEAR OWNERSHIP", "Responsibilities agreed per case"],
    ["ROOM TO EVOLVE", "Competency-based progression"],
  ];
  const highlightColors = [pale, navy, brand];
  const w3 = CONTENT / 3;
  highlightLabels.forEach(([top, caption], i) => {
    const x = MARGIN + w3 * i;
    page.drawRectangle({ x, y: 133, width: w3, height: 62, color: highlightColors[i] });
    page.drawText(top, {
      x: x + 11, y: 170, size: 8.3, font: bold, color: i === 0 ? navy : white,
    });
    const lines = pdfWrap(caption, regular, 8, w3 - 21).slice(0, 2);
    lines.forEach((l, j) => page.drawText(l, {
      x: x + 11, y: 151 - j * 11, size: 8, font: regular, color: i === 0 ? ink : white,
    }));
  });
  page.drawText("CONFIDENTIAL  /  NOT A CONTRACT  /  VERSION " + version, {
    x: MARGIN, y: 83, size: 8.4, font: bold, color: brand,
  });
  page.drawText("ManWinWin | Partner Growth | " + snapshot.country, {
    x: MARGIN, y: 66, size: 8, font: regular, color: muted,
  });

  // Subsequent pages use restrained editorial running headers, page numbers,
  // section bars, whitespace and a role matrix. Automatically flow long content.
  let y = 0;
  const bodyPages: ReturnType<typeof pdf.addPage>[] = [];
  const beginBody = () => {
    page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    bodyPages.push(page);
    page.drawRectangle({ x: 0, y: A4_HEIGHT - 12, width: A4_WIDTH, height: 12, color: brand });
    if (embeddedLogo) {
      const scale = Math.min(102 / embeddedLogo.width, 26 / embeddedLogo.height);
      page.drawImage(embeddedLogo, { x: MARGIN, y: A4_HEIGHT - 64,
        width: embeddedLogo.width * scale, height: embeddedLogo.height * scale });
    } else {
      page.drawText("MANWINWIN", { x: MARGIN, y: A4_HEIGHT - 52, size: 13, font: bold, color: brand });
    }
    page.drawText("PARTNERSHIP PROPOSAL", { x: A4_WIDTH - MARGIN - 124, y: A4_HEIGHT - 49,
      size: 8.2, font: bold, color: muted });
    page.drawLine({ start: { x: MARGIN, y: A4_HEIGHT - 75 }, end: { x: A4_WIDTH - MARGIN, y: A4_HEIGHT - 75 },
      thickness: 0.7, color: colorRgb("D6E1E8") });
    y = A4_HEIGHT - 109;
  };
  const ensure = (height: number) => { if (y < 72 + height) beginBody(); };
  const addText = (txt: string, opts: {
    size?: number; weight?: "normal" | "bold"; color?: typeof ink; after?: number; indent?: number;
  } = {}) => {
    const size = opts.size ?? 10.3, f = opts.weight === "bold" ? bold : regular;
    const indent = opts.indent ?? 0;
    const lines = pdfWrap(txt, f, size, CONTENT - indent);
    for (const line of lines) {
      ensure(size * 1.45);
      page.drawText(line, { x: MARGIN + indent, y, size, font: f, color: opts.color ?? ink });
      y -= size * 1.43;
    }
    y -= opts.after ?? 12;
  };
  const sectionHeading = (section: ProposalSection) => {
    ensure(65);
    y -= 11;
    page.drawRectangle({ x: MARGIN, y: y - 2, width: 4, height: 23, color: brand });
    const text = pdfSafe(section.heading);
    const headingLines = pdfWrap(text, bold, 15, CONTENT - 22);
    headingLines.forEach(line => {
      page.drawText(line, { x: MARGIN + 17, y, size: 15, font: bold, color: navy }); y -= 21;
    });
    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: A4_WIDTH - MARGIN, y: y - 2 },
      thickness: 0.75, color: colorRgb("E2E9EE") });
    y -= 20;
  };
  beginBody();
  addText("THE PARTNERSHIP IN CONTEXT", { size: 9, weight: "bold", color: brand, after: 13 });
  addText("An opportunity worth exploring.", { size: 23, weight: "bold", color: navy, after: 18 });
  addText("A tailored discussion framework for " + snapshot.prospect_name + ". Responsibilities and financial rights remain subject to an executed agreement.",
    { size: 10.5, color: muted, after: 25 });
  for (const section of snapshot.sections) {
    sectionHeading(section);
    section.paragraphs.forEach(s => addText(s, { size: 10.35, after: 13 }));
    (section.bullets || []).forEach(s => {
      ensure(32);
      page.drawRectangle({ x: MARGIN + 2, y: y + 1, width: 4, height: 4, color: brand });
      addText(s, { size: 9.9, indent: 16, after: 9 });
    });
    if (section.heading.startsWith("03") && snapshot.responsibility_matrix?.length) {
      y -= 9;
      const data = snapshot.responsibility_matrix;
      const widths = [155, 169, CONTENT - 324];
      const xs = [MARGIN, MARGIN + widths[0], MARGIN + widths[0] + widths[1]];
      const headers = ["ACTIVITY", snapshot.prospect_name.toUpperCase(), "MANWINWIN"];
      const drawRow = (values: string[], header: boolean) => {
        const fonts = header ? bold : regular, size = header ? 8.4 : 8.7;
        const split = values.map((v, i) => pdfWrap(v, fonts, size, widths[i] - 20));
        const h = Math.max(38, 15 + Math.max(...split.map(x => x.length)) * 12);
        ensure(h + 8);
        page.drawRectangle({ x: MARGIN, y: y - h + 9, width: CONTENT, height: h,
          color: header ? navy : pale });
        for (let i = 0; i < 3; i++) {
          split[i].forEach((line, j) => page.drawText(line, {
            x: xs[i] + 10, y: y - 9 - j * 12,
            size, font: fonts, color: header ? white : ink,
          }));
        }
        y -= h + 3;
      };
      drawRow(headers, true);
      data.forEach(row => drawRow([row.activity, row.partner, row.manwinwin], false));
      addText("Illustrative responsibilities. Final allocation is agreed per opportunity.", {
        size: 8.2, color: muted, after: 14,
      });
    }
    y -= 5;
  }
  if (snapshot.evidence.length) {
    sectionHeading({ heading: "SOURCE REGISTER | HQ-VERIFIED INPUTS", paragraphs: [] });
    snapshot.evidence.forEach((e, i) => {
      addText((i + 1) + ". " + e.title + ": " + e.finding, { size: 9.2, after: 6 });
      if (e.url) addText(e.url, { size: 7.8, color: muted, indent: 14, after: 11 });
    });
  }
  if (snapshot.missing_inputs.length) {
    sectionHeading({ heading: "INTERNAL PREFLIGHT | BEFORE EXTERNAL DISTRIBUTION", paragraphs: [] });
    snapshot.missing_inputs.forEach(m => addText("• " + m, { size: 9.2, color: brand, after: 7 }));
  }
  y -= 17;
  addText(snapshot.research_limitations, { size: 8.1, color: muted });

  bodyPages.forEach((pg, i) => {
    pg.drawLine({ start: { x: MARGIN, y: 54 }, end: { x: A4_WIDTH - MARGIN, y: 54 },
      thickness: 0.6, color: colorRgb("D6E1E8") });
    pg.drawText("MANWINWIN  /  " + (approved ? "HQ APPROVED" : "CONFIDENTIAL DRAFT") + "  /  VERSION " + version,
      { x: MARGIN, y: 38, size: 8, color: muted, font: regular });
    pg.drawText(String(i + 2).padStart(2, "0"), {
      x: A4_WIDTH - MARGIN - 14, y: 38, size: 9, color: brand, font: bold,
    });
  });
  const bytes = await pdf.save();
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), fileName(snapshot, version, "pdf"));
}

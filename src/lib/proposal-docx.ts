import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageOrientation,
  Header,
  Footer,
  PageNumber,
} from "docx";
import { saveAs } from "file-saver";
import type { Proposal, ProposalItem } from "@/types/proposal";
import { computeTotals } from "@/lib/proposal-engine";
import { t, formatEuro } from "@/lib/proposal-i18n";

const RED = "E01F2C";
const DARK = "2C3E50";
const GREY_BG = "EFEFEF";

function p(text: string, opts: { bold?: boolean; size?: number; color?: string; italic?: boolean; align?: any; spacing?: any } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing,
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italic,
        color: opts.color || DARK,
        size: opts.size || 22,
        font: "Calibri",
      }),
    ],
  });
}

function bullet(text: string, color = DARK) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: "● ", bold: true, color: RED, size: 22, font: "Calibri" }),
      new TextRun({ text, color, size: 22, font: "Calibri" }),
    ],
  });
}

function smallBullet(text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: "○  ", color: DARK, size: 20, font: "Calibri" }),
      new TextRun({ text, color: DARK, size: 20, font: "Calibri" }),
    ],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: DARK, size: 28, font: "Calibri" })],
  });
}

function cell(text: string, opts: { bold?: boolean; bg?: string; align?: any; width?: number; color?: string } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
    },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            color: opts.color || DARK,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });
}

export async function generateProposalDocx(proposal: Proposal, items: ProposalItem[]): Promise<Blob> {
  const lang = proposal.language;
  const s = t(lang);
  const totals = computeTotals(items, proposal.discount_pct || 0);

  const headerRight = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: `${proposal.client_name} | `, bold: true, color: DARK, size: 20, font: "Calibri" }),
        new TextRun({
          text: proposal.project_name || "Maintenance Software Implementation",
          italics: true,
          color: RED,
          size: 20,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: new Date(proposal.proposal_date).toLocaleDateString("en-GB").replace(/\//g, "."),
          color: DARK,
          size: 20,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: s.restricted, bold: true, color: RED, size: 20, font: "Calibri" })],
    }),
  ];

  // Cover page
  const cover = [
    new Paragraph({ children: [new TextRun({ text: "", size: 24 })], spacing: { before: 1200 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "MANWINWIN", bold: true, color: DARK, size: 56, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
      children: [
        new TextRun({ text: "S O F T W A R E", color: DARK, size: 24, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: s.investmentProposal, bold: true, color: RED, size: 56, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({ text: "ManWinWin ", bold: true, color: DARK, size: 36, font: "Calibri" }),
        new TextRun({ text: `Professional (${proposal.hosting})`, bold: true, color: RED, size: 36, font: "Calibri" }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })], pageBreakBefore: false }),
  ];

  // Title block
  const titleBlock = [
    new Paragraph({
      shading: { fill: RED, type: ShadingType.CLEAR, color: "auto" },
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({ text: "  " + s.investmentProposal, bold: true, color: "FFFFFF", size: 36, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `${s.forImplementation} ${proposal.client_name.toUpperCase()}`,
          bold: true,
          color: RED,
          size: 24,
          font: "Calibri",
        }),
      ],
    }),
  ];

  // Plan description
  const planDesc = [
    sectionHeading(s.professional),
    new Paragraph({
      children: [
        new TextRun({ text: s.annualLicenseDescription(proposal.plan).replace(`${proposal.plan}`, ""), color: DARK, size: 22, font: "Calibri" }),
        new TextRun({ text: ` ${proposal.plan} `, bold: true, color: RED, size: 22, font: "Calibri" }),
        new TextRun({ text: lang === "EN" ? "with:" : ":", color: DARK, size: 22, font: "Calibri" }),
      ],
    }),
    bullet(s.backofficeAccess),
    bullet(s.webAccess),
    p(s.includes + ":", { bold: true, spacing: { before: 180, after: 60 } }),
    bullet(s.maintenanceModule),
    p(s.optionalNotIncluded, { bold: true, spacing: { before: 180, after: 60 } }),
    bullet(s.requestsModuleDesc),
    bullet(s.webAdditionalDesc),
  ];

  // License pricing block
  const license = items.find((i) => i.category === "software");
  const pricingBlock = [
    new Paragraph({
      spacing: { before: 360, after: 120 },
      children: [
        new TextRun({
          text: s.annualLicenseHeading(proposal.plan, proposal.hosting),
          bold: true,
          color: DARK,
          size: 28,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      indent: { left: 360 },
      children: [
        new TextRun({ text: "○  " + s.annualLicensePrice + " ", color: DARK, size: 22, font: "Calibri" }),
        new TextRun({
          text: license ? formatEuro(license.total, lang) : "—",
          bold: true,
          color: RED,
          size: 22,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      indent: { left: 360 },
      spacing: { after: 240 },
      children: [
        new TextRun({ text: "○  " + s.satIncluded, color: DARK, size: 22, font: "Calibri" }),
      ],
    }),
  ];

  // Services block
  const serviceItems = items.filter((i) => i.category === "service");
  const servicesBlock = [
    sectionHeading(s.services),
    p("● " + s.implementation, { bold: true, color: RED, size: 22 }),
  ];
  for (const sv of serviceItems) {
    servicesBlock.push(
      new Paragraph({
        indent: { left: 240 },
        children: [
          new TextRun({ text: `${sv.item_name}: `, color: DARK, size: 22, font: "Calibri" }),
          new TextRun({ text: formatEuro(sv.total, lang), bold: true, color: RED, size: 22, font: "Calibri" }),
        ],
      }),
    );
    if (sv.description) {
      servicesBlock.push(p(sv.description, { italic: true, size: 20, spacing: { after: 120 } }));
    }
  }

  // Investment table
  const investmentTitle = sectionHeading(s.investmentInProject);

  const planLabel = `${s.year1.includes("1") || lang !== "EN" ? "Annual " : ""}Professional License - Plan ${proposal.plan}`;
  const recurringItems = items.filter((i) => i.is_recurring);
  const oneTimeItems = items.filter((i) => !i.is_recurring);

  const tableRows: TableRow[] = [];

  // Header row
  tableRows.push(
    new TableRow({
      children: [
        cell("", { width: 2400 }),
        cell("", { width: 4400 }),
        cell(planLabel, { bold: true, bg: GREY_BG, align: AlignmentType.CENTER, width: 2800 }),
      ],
    }),
  );

  // Year 1 — Software section + services
  const y1Rows: { label: string; value: string }[] = [
    ...recurringItems.map((i) => ({ label: i.item_name, value: formatEuro(i.total, lang) })),
    ...oneTimeItems.map((i) => ({ label: i.item_name, value: formatEuro(i.total, lang) })),
  ];

  y1Rows.forEach((r, idx) => {
    const isFirst = idx === 0;
    tableRows.push(
      new TableRow({
        children: [
          isFirst
            ? new TableCell({
                rowSpan: y1Rows.length + 1,
                shading: { fill: GREY_BG, type: ShadingType.CLEAR, color: "auto" },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                  left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                  right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                },
                verticalAlign: "center" as any,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: s.year1, bold: true, color: DARK, size: 22, font: "Calibri" })],
                  }),
                ],
              })
            : (null as any),
          cell(r.label),
          cell(r.value, { align: AlignmentType.RIGHT }),
        ].filter(Boolean) as TableCell[],
      }),
    );
  });

  // Year 1 total row
  tableRows.push(
    new TableRow({
      children: [
        cell(s.totalOfYear, { bold: true, bg: GREY_BG }),
        cell(formatEuro(totals.totalYear1, lang), { bold: true, bg: GREY_BG, align: AlignmentType.RIGHT }),
      ],
    }),
  );

  // Year 2+ rows
  recurringItems.forEach((r, idx) => {
    const isFirst = idx === 0;
    tableRows.push(
      new TableRow({
        children: [
          isFirst
            ? new TableCell({
                rowSpan: recurringItems.length + 1,
                shading: { fill: GREY_BG, type: ShadingType.CLEAR, color: "auto" },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                  left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                  right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
                },
                verticalAlign: "center" as any,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: s.year2Onwards, bold: true, color: DARK, size: 22, font: "Calibri" })],
                  }),
                ],
              })
            : (null as any),
          cell(r.item_name),
          cell(formatEuro(r.total, lang), { align: AlignmentType.RIGHT }),
        ].filter(Boolean) as TableCell[],
      }),
    );
  });

  tableRows.push(
    new TableRow({
      children: [
        cell(s.totalPerYear, { bold: true, bg: GREY_BG }),
        cell(`${formatEuro(totals.totalRecurring, lang)} ${s.perYear}`, { bold: true, bg: GREY_BG, align: AlignmentType.RIGHT }),
      ],
    }),
  );

  const investmentTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: [2400, 4400, 2800],
    rows: tableRows,
  });

  // Billing
  const billingBlock = [
    sectionHeading(s.billingHeader),
    p(s.standardTerms, { bold: true, spacing: { after: 120 } }),
    smallBullet(s.paymentLine1),
    smallBullet(s.paymentLine2),
    p(s.footnote1, { size: 18, italic: true, spacing: { before: 180 } }),
    p(s.footnote2, { size: 18, italic: true }),
  ];

  // Other info
  const otherBlock = [
    sectionHeading(s.otherInfo),
    smallBullet(s.vatNote),
    smallBullet(s.validityNote(proposal.validity_days)),
  ];

  // SaaS features (only for SaaS)
  const saasBlock =
    proposal.hosting === "SaaS"
      ? [sectionHeading(s.saasFeatures), ...s.saasFeaturesList.map(smallBullet)]
      : [];

  // S&AT
  const satBlock = [sectionHeading(s.satTitle), ...s.satList.map(smallBullet)];

  // Notes
  const notesBlock = proposal.notes
    ? [sectionHeading(s.notes), p(proposal.notes)]
    : [];

  const doc = new Document({
    creator: "PartnerOS",
    title: `${s.investmentProposal} - ${proposal.client_name}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children: [...cover],
      },
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        headers: {
          default: new Header({ children: headerRight }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "ManWinWin Software · support@manwinwin.com · www.manwinwin.com",
                    color: "888888",
                    size: 16,
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...titleBlock,
          ...planDesc,
          ...pricingBlock,
          ...servicesBlock,
          investmentTitle,
          investmentTable,
          p(s.assumingSameYear1, { italic: true, size: 18, spacing: { before: 120, after: 240 } }),
          ...billingBlock,
          ...otherBlock,
          ...saasBlock,
          ...satBlock,
          ...notesBlock,
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function downloadProposalDocx(proposal: Proposal, items: ProposalItem[]) {
  const blob = await generateProposalDocx(proposal, items);
  const fileName = `Proposal_${proposal.client_name.replace(/\s+/g, "_")}_v${proposal.version}.docx`;
  saveAs(blob, fileName);
  return { blob, fileName };
}

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageOrientation,
  Header,
  Footer,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import type { Proposal, ProposalItem } from "@/types/proposal";
import { computeTotals } from "@/lib/proposal-engine";
import { getCommercialIncludes, getCommercialItemLabel, getInvestmentSummary } from "@/lib/proposal-commercial";
import { t, formatEuro } from "@/lib/proposal-i18n";
import logoUrl from "@/assets/manwinwin-logo.png";

const RED = "E01F2C";
const DARK = "2C3E50";
const GREY_BG = "F5F5F5";
const GREY_BORDER = "D0D0D0";
const MUTED = "6B7280";

/* -------------------------------------------------------------------------- */
/*                              small helpers                                 */
/* -------------------------------------------------------------------------- */

function p(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    italic?: boolean;
    align?: any;
    spacing?: any;
    indent?: any;
  } = {},
) {
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing,
    indent: opts.indent,
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
    indent: { left: 360, hanging: 200 },
    children: [
      new TextRun({ text: "•  ", bold: true, color: RED, size: 22, font: "Calibri" }),
      new TextRun({ text, color, size: 22, font: "Calibri" }),
    ],
  });
}

function smallBullet(text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 540, hanging: 200 },
    children: [
      new TextRun({ text: "○  ", color: DARK, size: 20, font: "Calibri" }),
      new TextRun({ text, color: DARK, size: 20, font: "Calibri" }),
    ],
  });
}

/** Red bar section heading (ManWinWin "title bar" look). */
function redBarHeading(text: string) {
  return new Paragraph({
    shading: { fill: RED, type: ShadingType.CLEAR, color: "auto" },
    spacing: { before: 320, after: 160 },
    children: [
      new TextRun({
        text: "  " + text,
        bold: true,
        color: "FFFFFF",
        size: 28,
        font: "Calibri",
      }),
    ],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 4 },
    },
    children: [new TextRun({ text, bold: true, color: DARK, size: 26, font: "Calibri" })],
  });
}

function cell(
  text: string,
  opts: {
    bold?: boolean;
    bg?: string;
    align?: any;
    width?: number;
    color?: string;
    italic?: boolean;
    size?: number;
  } = {},
) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg
      ? { fill: opts.bg, type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
      left: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
    },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            italics: opts.italic,
            color: opts.color || DARK,
            size: opts.size || 20,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });
}

/** Tries to load the logo as a Uint8Array. Returns null on failure
 *  (so generation never breaks if the asset is missing). */
async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                            main DOCX generator                             */
/* -------------------------------------------------------------------------- */

export async function generateProposalDocx(
  proposal: Proposal,
  items: ProposalItem[],
): Promise<Blob> {
  const lang = proposal.language;
  const s = t(lang);
  const totals = computeTotals(items, proposal.discount_pct || 0, proposal.discount_scope || "none");
  const logoBytes = await loadLogo();
  const investment = getInvestmentSummary(proposal, items, totals);

  const dateStr = new Date(proposal.proposal_date)
    .toLocaleDateString("en-GB")
    .replace(/\//g, ".");

  /* ------------------------------- header ------------------------------- */

  const headerChildren: Paragraph[] = [];
  if (logoBytes) {
    // small top-left logo
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new ImageRun({
            type: "png",
            data: logoBytes,
            transformation: { width: 90, height: 28 },
            altText: { title: "ManWinWin", description: "ManWinWin Software", name: "logo" },
          }),
        ],
      }),
    );
  }
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `${proposal.client_name} | `,
          bold: true,
          color: DARK,
          size: 18,
          font: "Calibri",
        }),
        new TextRun({
          text: proposal.project_name || "Maintenance Software Implementation",
          italics: true,
          color: RED,
          size: 18,
          font: "Calibri",
        }),
        new TextRun({
          text: `   ·   ${dateStr}   ·   `,
          color: MUTED,
          size: 18,
          font: "Calibri",
        }),
        new TextRun({
          text: s.restricted,
          bold: true,
          color: RED,
          size: 18,
          font: "Calibri",
        }),
      ],
    }),
  );

  /* ------------------------------- footer ------------------------------- */

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 4 },
        },
        children: [
          new TextRun({
            text: "ManWinWin Software · support@manwinwin.com · www.manwinwin.com",
            color: MUTED,
            size: 16,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });

  /* ------------------------------- cover -------------------------------- */

  const cover: Paragraph[] = [];
  cover.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 1400 } }));

  if (logoBytes) {
    cover.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
        children: [
          new ImageRun({
            type: "png",
            data: logoBytes,
            transformation: { width: 360, height: 110 },
            altText: { title: "ManWinWin", description: "ManWinWin Software", name: "logo" },
          }),
        ],
      }),
    );
  } else {
    cover.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MANWINWIN", bold: true, color: RED, size: 64, font: "Calibri" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
        children: [
          new TextRun({ text: "S O F T W A R E", color: DARK, size: 22, font: "Calibri" }),
        ],
      }),
    );
  }

  cover.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({
          text: s.investmentProposal,
          bold: true,
          color: RED,
          size: 56,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({ text: "ManWinWin ", bold: true, color: DARK, size: 32, font: "Calibri" }),
        new TextRun({
          text: `Professional (${proposal.hosting})`,
          bold: true,
          color: RED,
          size: 32,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200 },
      children: [
        new TextRun({
          text: proposal.client_name.toUpperCase(),
          bold: true,
          color: DARK,
          size: 28,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: dateStr, color: MUTED, size: 22, font: "Calibri" }),
      ],
    }),
  );

  /* --------------------------- inner page title ------------------------- */

  const titleBlock = [
    redBarHeading(s.investmentProposal),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `${s.forImplementation} ${proposal.client_name.toUpperCase()}`,
          bold: true,
          color: RED,
          size: 22,
          font: "Calibri",
        }),
      ],
    }),
  ];

  /* --------------------------- plan description ------------------------- */
  // Use the i18n string directly (already correctly worded).
  const planDescIntro = new Paragraph({
    spacing: { before: 120, after: 180 },
    children: [
      new TextRun({
        text: s.annualLicenseDescription(proposal.plan),
        bold: true,
        color: DARK,
        size: 22,
        font: "Calibri",
      }),
    ],
  });

  const commercialIncludes = getCommercialIncludes(
    proposal.plan,
    proposal.language,
    proposal.include_requests_module,
    proposal.web_users,
  );
  const includedItems: Paragraph[] = commercialIncludes.included.map((text) => bullet(text));
  const optionalItems: Paragraph[] = commercialIncludes.optional.map((text) => bullet(text));

  const planDesc = [
    sectionHeading(s.professional),
    planDescIntro,
    p(s.includes + ":", { bold: true, color: RED, spacing: { before: 120, after: 80 } }),
    ...includedItems,
  ];
  if (optionalItems.length > 0) {
    planDesc.push(
      p(s.optionalNotIncluded, { bold: true, color: MUTED, spacing: { before: 180, after: 80 } }),
      ...optionalItems,
    );
  }

  /* ----------------------- detailed line items ------------------------- */

  const softwareItems = items.filter(
    (i) => i.category === "software" || i.category === "addon",
  );
  const serviceItems = items.filter((i) => i.category === "service");
  const customItems = items.filter((i) => i.category === "custom");

  const renderLineItem = (i: ProposalItem) => {
    const freqSuffix = i.is_recurring ? ` / ${s.perYear.replace(/^per /, "").replace(/^por /, "")}` : "";
    const paragraphs: Paragraph[] = [
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 360 },
        children: [
          new TextRun({
            text: `•  ${getCommercialItemLabel(i, proposal)}: `,
            color: DARK,
            size: 22,
            font: "Calibri",
          }),
          new TextRun({
            text: formatEuro(i.total, lang) + freqSuffix,
            bold: true,
            color: RED,
            size: 22,
            font: "Calibri",
          }),
        ],
      }),
    ];
    return paragraphs;
  };

  const softwareBlock: Paragraph[] = [];
  if (softwareItems.length > 0) {
    softwareBlock.push(
      sectionHeading(s.software),
      ...softwareItems.flatMap(renderLineItem),
      new Paragraph({
        spacing: { before: 80, after: 80 },
        indent: { left: 360 },
        children: [
          new TextRun({ text: s.satIncluded, italics: true, color: MUTED, size: 18, font: "Calibri" }),
        ],
      }),
    );
  }

  const servicesBlock: Paragraph[] = [];
  if (serviceItems.length > 0) {
    servicesBlock.push(sectionHeading(s.services), ...serviceItems.flatMap(renderLineItem));
  }
  if (customItems.length > 0) {
    servicesBlock.push(...customItems.flatMap(renderLineItem));
  }

  /* ----------------------- investment summary table -------------------- */

  const recurringItems = investment.recurringLines;

  const y1SoftwareRows = investment.softwareLines.map((i) => ({
    label: i.label,
    value: `${i.value}${i.suffix ? ` ${i.suffix}` : ""}`,
  }));
  const y1ServiceRows = investment.serviceLines.map((i) => ({
    label: i.label,
    value: `${i.value}${i.suffix ? ` ${i.suffix}` : ""}`,
  }));

  const tableRows: TableRow[] = [];

  // Header
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        cell("", { bg: RED, width: 2200 }),
        cell(s.colItem, { bold: true, bg: RED, color: "FFFFFF", width: 5000 }),
        cell(s.colTotal, {
          bold: true,
          bg: RED,
          color: "FFFFFF",
          align: AlignmentType.RIGHT,
          width: 2400,
        }),
      ],
    }),
  );

  // ---- Year 1 ----
  const y1RowCount =
    (y1SoftwareRows.length > 0 ? y1SoftwareRows.length + 1 : 0) +
    (y1ServiceRows.length > 0 ? y1ServiceRows.length + 1 : 0) +
    (totals.discountAmount > 0 ? 1 : 0) +
    1; // total row

  let y1FirstRow = true;
  const pushY1Row = (children: TableCell[]) => {
    const labelCell = y1FirstRow
      ? new TableCell({
          rowSpan: y1RowCount,
          shading: { fill: RED, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
          },
          verticalAlign: "center" as any,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: s.year1,
                  bold: true,
                  color: "FFFFFF",
                  size: 22,
                  font: "Calibri",
                }),
              ],
            }),
          ],
        })
      : null;
    y1FirstRow = false;
    tableRows.push(
      new TableRow({
        children: [labelCell, ...children].filter(Boolean) as TableCell[],
      }),
    );
  };

  if (y1SoftwareRows.length > 0) {
    pushY1Row([
      cell(s.software, { bold: true, bg: GREY_BG }),
      cell("", { bg: GREY_BG }),
    ]);
    y1SoftwareRows.forEach((r) =>
      pushY1Row([cell(r.label), cell(r.value, { align: AlignmentType.RIGHT })]),
    );
  }
  if (y1ServiceRows.length > 0) {
    pushY1Row([
      cell(s.services, { bold: true, bg: GREY_BG }),
      cell("", { bg: GREY_BG }),
    ]);
    y1ServiceRows.forEach((r) =>
      pushY1Row([cell(r.label), cell(r.value, { align: AlignmentType.RIGHT })]),
    );
  }
  if (totals.discountAmount > 0) {
    pushY1Row([
      cell(investment.discountLabel, { italic: true }),
      cell(`- ${formatEuro(totals.discountAmount, lang)}`, {
        align: AlignmentType.RIGHT,
        italic: true,
      }),
    ]);
  }
  pushY1Row([
    cell(s.totalOfYear, { bold: true, bg: GREY_BG }),
    cell(formatEuro(totals.totalYear1, lang), {
      bold: true,
      bg: GREY_BG,
      align: AlignmentType.RIGHT,
    }),
  ]);

  // ---- Year 2+ : recurring only ----
  const y2RowCount = recurringItems.length + 1;
  let y2FirstRow = true;
  const pushY2Row = (children: TableCell[]) => {
    const labelCell = y2FirstRow
      ? new TableCell({
          rowSpan: y2RowCount,
          shading: { fill: DARK, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
          },
          verticalAlign: "center" as any,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: s.year2Onwards,
                  bold: true,
                  color: "FFFFFF",
                  size: 22,
                  font: "Calibri",
                }),
              ],
            }),
          ],
        })
      : null;
    y2FirstRow = false;
    tableRows.push(
      new TableRow({
        children: [labelCell, ...children].filter(Boolean) as TableCell[],
      }),
    );
  };

  recurringItems.forEach((r) =>
    pushY2Row([
      cell(r.label),
      cell(`${r.value}${r.suffix ? ` ${r.suffix}` : ""}`, { align: AlignmentType.RIGHT }),
    ]),
  );
  pushY2Row([
    cell(s.totalPerYear, { bold: true, bg: GREY_BG }),
    cell(`${formatEuro(totals.totalRecurring, lang)} ${s.perYear}`, {
      bold: true,
      bg: GREY_BG,
      align: AlignmentType.RIGHT,
    }),
  ]);

  const investmentTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: [2200, 5000, 2400],
    rows: tableRows,
  });

  /* ------------------------------ billing ------------------------------ */

  const billingBlock = [
    sectionHeading(s.billingHeader),
    p(s.standardTerms, { bold: true, spacing: { after: 120 } }),
    smallBullet(s.paymentLine1),
    smallBullet(s.paymentLine2),
    p(s.footnote1, { size: 18, italic: true, color: MUTED, spacing: { before: 180 } }),
    p(s.footnote2, { size: 18, italic: true, color: MUTED }),
  ];

  /* ----------------------------- other info ---------------------------- */

  const otherBlock = [
    sectionHeading(s.otherInfo),
    smallBullet(s.vatNote),
    smallBullet(s.validityNote(proposal.validity_days)),
  ];

  const saasBlock =
    proposal.hosting === "SaaS"
      ? [sectionHeading(s.saasFeatures), ...s.saasFeaturesList.map(smallBullet)]
      : [];

  const satBlock = [sectionHeading(s.satTitle), ...s.satList.map(smallBullet)];

  const notesBlock = proposal.notes
    ? [sectionHeading(s.notes), p(proposal.notes)]
    : [];

  /* ------------------------------- doc --------------------------------- */

  const doc = new Document({
    creator: "PartnerOS",
    title: `${s.investmentProposal} - ${proposal.client_name}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      // Cover (no header)
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        footers: { default: footer },
        children: cover,
      },
      // Inner pages with header + footer
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1800, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: footer },
        children: [
          ...titleBlock,
          ...planDesc,
          ...softwareBlock,
          ...servicesBlock,
          sectionHeading(s.investmentInProject),
          investmentTable,
          p(s.assumingSameYear1, {
            italic: true,
            size: 18,
            color: MUTED,
            spacing: { before: 120, after: 240 },
          }),
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

export async function downloadProposalDocx(
  proposal: Proposal,
  items: ProposalItem[],
) {
  const blob = await generateProposalDocx(proposal, items);
  const fileName = `Proposal_${proposal.client_name.replace(/\s+/g, "_")}_v${proposal.version}.docx`;
  saveAs(blob, fileName);
  return { blob, fileName };
}

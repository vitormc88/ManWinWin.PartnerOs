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
import { computeTotals, enrichProposalItem, getItemEffectiveDiscount, getItemRenewalValue, getSectionDiscountSummary } from "@/lib/proposal-engine";
import { getCommercialIncludes, getCommercialItemLabel } from "@/lib/proposal-commercial";
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
  const totals = computeTotals(
    items,
    proposal.software_discount_pct || 0,
    proposal.services_discount_pct || 0,
  );
  const logoBytes = await loadLogo();
  const softwareDiscountSummary = getSectionDiscountSummary(items, "software", Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));
  const servicesDiscountSummary = getSectionDiscountSummary(items, "services", Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));

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
        new TextRun({ text: `${proposal.client_name} | ${proposal.project_name || "Maintenance Software Implementation"}`, bold: true, color: DARK, size: 18, font: "Calibri" }),
      ],
    }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: dateStr, color: MUTED, size: 18, font: "Calibri" })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: s.restricted, bold: true, color: DARK, size: 18, font: "Calibri" })] }),
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
  // Note: detailed line items are rendered inside the Investment Summary table
  // below (Year 1 / Year 2+). We intentionally do NOT render bullet-list
  // duplicates of Software / Services here to avoid repeating section labels.

  const softwareItems = items.filter(
    (i) => i.category === "software" || i.category === "addon",
  );
  const serviceItems = items.filter((i) => i.category === "service");
  const customItems = items.filter((i) => i.category === "custom");

  /* ----------------------- investment summary table -------------------- */

  const softwareUniformLabel = softwareDiscountSummary.mode === "uniform-section"
    ? s.softwareDiscountLabel(Number(softwareDiscountSummary.pct || 0))
    : s.softwareDiscountsTotalLabel;
  const servicesUniformLabel = servicesDiscountSummary.mode === "uniform-section"
    ? s.servicesDiscountLabel(Number(servicesDiscountSummary.pct || 0))
    : s.servicesDiscountsTotalLabel;

  // ---- Detailed Year 1 table (Item | Gross | Discount | Net) ----
  const Y1_COL_ITEM = 4200;
  const Y1_COL_GROSS = 1800;
  const Y1_COL_DISCOUNT = 1800;
  const Y1_COL_NET = 1800;
  const Y1_TABLE_WIDTH = Y1_COL_ITEM + Y1_COL_GROSS + Y1_COL_DISCOUNT + Y1_COL_NET;

  const detailHeaderRow = (sectionLabel: string) =>
    new TableRow({
      tableHeader: true,
      children: [
        cell(sectionLabel, { bold: true, bg: RED, color: "FFFFFF", width: Y1_COL_ITEM }),
        cell("Gross", { bold: true, bg: RED, color: "FFFFFF", align: AlignmentType.RIGHT, width: Y1_COL_GROSS }),
        cell("Discount", { bold: true, bg: RED, color: "FFFFFF", align: AlignmentType.RIGHT, width: Y1_COL_DISCOUNT }),
        cell("Net", { bold: true, bg: RED, color: "FFFFFF", align: AlignmentType.RIGHT, width: Y1_COL_NET }),
      ],
    });

  const detailLineRow = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));
    const eff = getItemEffectiveDiscount(rawItem, Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));
    const discountText = eff.amount
      ? `${eff.source === "section" ? `${s.sectionDiscountLabel(eff.value)} ` : eff.type === "percent" ? `${Number(eff.value || 0)}% ` : ""}-${formatEuro(eff.amount || 0, lang)}`
      : "—";
    // getCommercialItemLabel already includes (×qty) for web_user; only append for other items with qty > 1
    const baseLabel = getCommercialItemLabel(it, proposal);
    const labelHasQty = /\(×\d+\)/.test(baseLabel);
    const label = baseLabel + (it.qty > 1 && !labelHasQty ? `  (×${it.qty})` : "");
    return new TableRow({
      children: [
        cell(label, { width: Y1_COL_ITEM }),
        cell(formatEuro(Number(it.gross_total) || 0, lang), { align: AlignmentType.RIGHT, width: Y1_COL_GROSS }),
        cell(discountText, { align: AlignmentType.RIGHT, width: Y1_COL_DISCOUNT, color: eff.amount ? RED : MUTED, italic: Boolean(eff.amount) }),
        cell(formatEuro(Number(it.net_total) || 0, lang), { align: AlignmentType.RIGHT, width: Y1_COL_NET, bold: true }),
      ],
    });
  };

  const subtotalRow = (label: string, value: string, opts: { strong?: boolean; discount?: boolean } = {}) =>
    new TableRow({
      children: [
        cell(label, { bold: opts.strong, bg: GREY_BG, italic: opts.discount, color: opts.discount ? RED : undefined, width: Y1_COL_ITEM + Y1_COL_GROSS + Y1_COL_DISCOUNT }),
        cell(value, { bold: opts.strong, bg: GREY_BG, align: AlignmentType.RIGHT, italic: opts.discount, color: opts.discount ? RED : undefined, width: Y1_COL_NET }),
      ],
    });
  // Need a 2-col-wide row helper (label spans 3 cols)
  const wideSubtotalRow = (label: string, value: string, opts: { strong?: boolean; discount?: boolean } = {}) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: Y1_COL_ITEM + Y1_COL_GROSS + Y1_COL_DISCOUNT, type: WidthType.DXA },
          columnSpan: 3,
          shading: { fill: GREY_BG, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: label,
                  bold: opts.strong,
                  italics: opts.discount,
                  color: opts.discount ? RED : DARK,
                  size: 20,
                  font: "Calibri",
                }),
              ],
            }),
          ],
        }),
        cell(value, { bold: opts.strong, bg: GREY_BG, align: AlignmentType.RIGHT, italic: opts.discount, color: opts.discount ? RED : undefined, width: Y1_COL_NET }),
      ],
    });

  const year1TableRows: TableRow[] = [];

  if (softwareItems.length > 0) {
    year1TableRows.push(detailHeaderRow(s.software));
    softwareItems.forEach((it) => year1TableRows.push(detailLineRow(it)));
    year1TableRows.push(wideSubtotalRow(`${s.software} gross subtotal`, formatEuro(totals.softwareGrossSubtotal, lang)));
    if (totals.softwareDiscountAmount > 0) {
      year1TableRows.push(wideSubtotalRow(softwareUniformLabel, `- ${formatEuro(totals.softwareDiscountAmount, lang)}`, { discount: true }));
    }
    year1TableRows.push(wideSubtotalRow(`${s.software} net subtotal`, formatEuro(totals.softwareSubtotal, lang), { strong: true }));
  }

  if (serviceItems.length > 0 || customItems.length > 0) {
    year1TableRows.push(detailHeaderRow(s.services));
    [...serviceItems, ...customItems.filter((c) => !c.is_recurring)].forEach((it) => year1TableRows.push(detailLineRow(it)));
    year1TableRows.push(wideSubtotalRow(`${s.services} gross subtotal`, formatEuro(totals.servicesGrossSubtotal, lang)));
    if (totals.servicesDiscountAmount > 0) {
      year1TableRows.push(wideSubtotalRow(servicesUniformLabel, `- ${formatEuro(totals.servicesDiscountAmount, lang)}`, { discount: true }));
    }
    year1TableRows.push(wideSubtotalRow(`${s.services} net subtotal`, formatEuro(totals.servicesSubtotal, lang), { strong: true }));
  }

  // Year 1 total bar
  year1TableRows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: Y1_COL_ITEM + Y1_COL_GROSS + Y1_COL_DISCOUNT, type: WidthType.DXA },
          columnSpan: 3,
          shading: { fill: RED, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [new TextRun({ text: s.totalOfYear, bold: true, color: "FFFFFF", size: 24, font: "Calibri" })],
            }),
          ],
        }),
        cell(formatEuro(totals.totalYear1, lang), { bold: true, bg: RED, color: "FFFFFF", align: AlignmentType.RIGHT, width: Y1_COL_NET, size: 24 }),
      ],
    }),
  );

  const investmentTable = new Table({
    width: { size: Y1_TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [Y1_COL_ITEM, Y1_COL_GROSS, Y1_COL_DISCOUNT, Y1_COL_NET],
    rows: year1TableRows,
  });

  // ---- Year 2+ renewal table ----
  const recurringItems = items.filter((i) => i.is_recurring);
  const Y2_COL_LABEL = 7800;
  const Y2_COL_VALUE = 1800;
  const Y2_TABLE_WIDTH = Y2_COL_LABEL + Y2_COL_VALUE;

  const y2Rows: TableRow[] = [];
  y2Rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        cell(s.year2Onwards, { bold: true, bg: DARK, color: "FFFFFF", width: Y2_COL_LABEL }),
        cell(s.colTotal, { bold: true, bg: DARK, color: "FFFFFF", align: AlignmentType.RIGHT, width: Y2_COL_VALUE }),
      ],
    }),
  );

  recurringItems.forEach((rawItem) => {
    const it = enrichProposalItem(rawItem, Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));
    const renewal = getItemRenewalValue(rawItem, Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));
    const discounted = Boolean(rawItem.apply_discount_to_renewal) && renewal < (Number(it.gross_total) || 0);
    const label = discounted
      ? `${getCommercialItemLabel(it, proposal)}  (${s.renewalDiscountApplied})`
      : getCommercialItemLabel(it, proposal);
    y2Rows.push(
      new TableRow({
        children: [
          cell(label, { width: Y2_COL_LABEL, italic: discounted, color: discounted ? RED : undefined }),
          cell(`${formatEuro(renewal, lang)} ${s.perYear}`, { align: AlignmentType.RIGHT, width: Y2_COL_VALUE, bold: true }),
        ],
      }),
    );
  });

  y2Rows.push(
    new TableRow({
      children: [
        cell(s.totalPerYear, { bold: true, bg: GREY_BG, width: Y2_COL_LABEL }),
        cell(`${formatEuro(totals.totalRecurring, lang)} ${s.perYear}`, { bold: true, bg: GREY_BG, align: AlignmentType.RIGHT, width: Y2_COL_VALUE }),
      ],
    }),
  );

  const renewalTable = new Table({
    width: { size: Y2_TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [Y2_COL_LABEL, Y2_COL_VALUE],
    rows: y2Rows,
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
        // Cover has no footer to avoid duplicating the contact line on the last page
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
          sectionHeading(s.investmentInProject),
          p(s.year1, { bold: true, size: 24, color: RED, spacing: { before: 120, after: 100 } }),
          investmentTable,
          ...(recurringItems.length > 0
            ? [
                renewalTable,
                p(s.assumingSameYear1, {
                  italic: true,
                  size: 18,
                  color: MUTED,
                  spacing: { before: 120, after: 80 },
                }),
              ]
            : []),
          ...(totals.recurringDiscountAmount === 0 && totals.discountAmount > 0
            ? [p(s.discountsYear1OnlyNote, { italic: true, size: 18, color: MUTED, spacing: { after: 240 } })]
            : []),
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

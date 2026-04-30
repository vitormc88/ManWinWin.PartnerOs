/**
 * Business proposal DOCX generator.
 *
 * Independent from the Professional generator. Uses the validated Business
 * engine output via `proposal-business-summary.ts` — never recalculates
 * prices itself.
 */
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
  Header,
  Footer,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/manwinwin-logo.png";
import type { PricingRule, Proposal, ProposalLicenseModel, ProposalMode } from "@/types/proposal";
import {
  computeBusinessOptions,
  type BusinessConfig,
  type BusinessOptionTotals,
  ONSITE_RATES,
} from "./proposal-business-engine";
import { buildInvestmentSummaryRows, type SummaryRow } from "./proposal-business-summary";
import { tBusiness, type BusinessStrings } from "./proposal-business-i18n";
import { formatEuro } from "./proposal-i18n";

const RED = "E01F2C";
const DARK = "2C3E50";
const GREY_BG = "F5F5F5";
const GREY_BORDER = "D0D0D0";
const SUBTLE = "6B7280";

/* ---------------------------- small helpers ---------------------------- */

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
): Paragraph {
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

function bullet(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 360, hanging: 200 },
    children: [
      new TextRun({ text: "•  ", bold: true, color: RED, size: 22, font: "Calibri" }),
      new TextRun({ text, color: DARK, size: 22, font: "Calibri" }),
    ],
  });
}

function redBarHeading(text: string): Paragraph {
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

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 4 },
    },
    children: [new TextRun({ text, bold: true, color: DARK, size: 26, font: "Calibri" })],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, color: DARK, size: 24, font: "Calibri" })],
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
    indentLeft?: number;
  } = {},
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR, color: "auto" } : undefined,
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
        indent: opts.indentLeft ? { left: opts.indentLeft } : undefined,
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

async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const fmt = (lang: any, v: number): string => formatEuro(v, lang);

/* --------------------------- builder helpers --------------------------- */

function softwareDescription(
  cfg: BusinessConfig,
  s: BusinessStrings,
): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(p(s.businessSubtitle, { bold: true, size: 24 }));
  out.push(bullet(s.defaultBackoffice));
  out.push(bullet(s.defaultWebMobile));
  if (cfg.additionalBackoffice > 0) {
    out.push(bullet(s.additionalBackofficeAccesses(cfg.additionalBackoffice)));
  }
  if (cfg.additionalWebUsers > 0) {
    out.push(bullet(s.additionalWebMobileAccesses(cfg.additionalWebUsers)));
  }

  out.push(subHeading(s.modulesIncludedHeading));
  out.push(bullet(s.maintenanceModule));
  if (cfg.includeRequests) out.push(bullet(s.requestsModule));
  if (cfg.includeStock) out.push(bullet(s.stockModule));
  if (cfg.includePurchase) out.push(bullet(s.purchaseModule));

  const includedPlugins: string[] = [];
  if (cfg.pluginImport) includedPlugins.push(s.pluginImport);
  if (cfg.pluginWorkflow) includedPlugins.push(s.pluginWorkflow);
  if (cfg.pluginAdvancedReports) includedPlugins.push(s.pluginAdvancedReports);
  if (cfg.pluginSLA) includedPlugins.push(s.pluginSLA);
  if (includedPlugins.length > 0) {
    out.push(subHeading(s.pluginsIncludedHeading));
    includedPlugins.forEach((l) => out.push(bullet(l)));
  }

  if (cfg.api) out.push(bullet(s.apiManwinwin));
  // Hosting is intentionally NOT listed under modules/plugins.
  // It appears in Commercial Licensing Options and Investment Summary.

  const optional: string[] = [];
  if (!cfg.includeRequests) optional.push(s.requestsModule);
  if (!cfg.includeStock) optional.push(s.stockModule);
  if (!cfg.includePurchase) optional.push(s.purchaseModule);
  if (!cfg.pluginImport) optional.push(s.pluginImport);
  if (!cfg.pluginWorkflow) optional.push(s.pluginWorkflow);
  if (!cfg.pluginAdvancedReports) optional.push(s.pluginAdvancedReports);
  if (!cfg.pluginSLA) optional.push(s.pluginSLA);
  if (!cfg.api) optional.push(s.apiManwinwin);
  if (optional.length > 0) {
    out.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({
            text: s.optionalNotIncludedFull,
            bold: true,
            italics: true,
            color: SUBTLE,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
    );
    optional.forEach((l) =>
      out.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 360, hanging: 200 },
          children: [
            new TextRun({ text: "•  ", color: SUBTLE, size: 18, font: "Calibri" }),
            new TextRun({ text: l, color: SUBTLE, size: 18, italics: true, font: "Calibri" }),
          ],
        }),
      ),
    );
  }
  return out;
}

function optionsSection(
  keepit: BusinessOptionTotals | null,
  useit: BusinessOptionTotals | null,
  cfg: BusinessConfig,
  s: BusinessStrings,
  lang: any,
): Paragraph[] {
  const out: Paragraph[] = [];
  if (keepit) {
    out.push(subHeading(s.optionAKeepIT));
    const swNet = keepit.software
      .filter((l) => l.category !== "web_user")
      .reduce((a, l) => a + l.netAmount, 0);
    out.push(bullet(`${s.keepItLicenseAmount}: ${fmt(lang, swNet)}`));
    out.push(bullet(`${s.satAnnual}: ${fmt(lang, keepit.sat?.netAmount || 0)} / ${s.daysWord ? "yr" : "yr"}`));
    if (cfg.additionalWebUsers > 0) {
      const w = keepit.software.find((l) => l.category === "web_user");
      out.push(bullet(`${s.webMobileAdditionalAnnual}: ${fmt(lang, w?.netAmount || 0)}`));
    }
    if (cfg.api && keepit.api) {
      out.push(bullet(`${s.apiAnnual}: ${fmt(lang, keepit.api.netAmount)}`));
    }
    if (cfg.deployment === "saas" && keepit.hosting.length > 0) {
      const ho = keepit.hosting.reduce((a, l) => a + l.netAmount, 0);
      out.push(bullet(`${s.saasHostingAnnual}: ${fmt(lang, ho)}`));
    }
  }
  if (useit) {
    out.push(subHeading(s.optionBUseIT));
    const annual = useit.software
      .filter((l) => l.category !== "web_user")
      .reduce((a, l) => a + l.netAmount, 0);
    out.push(bullet(`${s.useItAnnualLicenseAmount}: ${fmt(lang, annual)}`));
    out.push(bullet(s.satIncluded));
    if (cfg.additionalWebUsers > 0) {
      const w = useit.software.find((l) => l.category === "web_user");
      out.push(bullet(`${s.webMobileAdditionalAnnual}: ${fmt(lang, w?.netAmount || 0)}`));
    }
    if (cfg.api && useit.api) {
      out.push(bullet(`${s.apiAnnual}: ${fmt(lang, useit.api.netAmount)}`));
    }
    if (cfg.deployment === "saas" && useit.hosting.length > 0) {
      const ho = useit.hosting.reduce((a, l) => a + l.netAmount, 0);
      out.push(bullet(`${s.saasHostingAnnual}: ${fmt(lang, ho)}`));
    }
  }
  return out;
}

function servicesSection(
  primary: BusinessOptionTotals,
  cfg: BusinessConfig,
  s: BusinessStrings,
  lang: any,
): Paragraph[] {
  const out: Paragraph[] = [];
  const implType = cfg.implementation.type;
  const title =
    implType === "RCI Business"
      ? s.rciTitle
      : implType === "Onsite"
      ? s.onsiteTitle
      : s.customServicesTitle;
  out.push(subHeading(title));

  const grossSvc = primary.services.reduce((a, l) => a + l.amount, 0);
  const discSvc = primary.services.reduce((a, l) => a + l.discountAmount, 0);
  const netSvc = primary.services.reduce((a, l) => a + l.netAmount, 0);
  const hasDisc = discSvc > 0;

  if (implType === "Onsite") {
    out.push(bullet(`${s.region}: ${cfg.implementation.onsiteRegion || "Portugal"}`));
    const region = cfg.implementation.onsiteRegion || "Portugal";
    const rates = ONSITE_RATES[region];
    const cd = cfg.implementation.onsiteClientDays || 0;
    const bd = cfg.implementation.onsiteBackofficeDays || 0;
    if (cd > 0) out.push(bullet(`${s.clientDays}: ${cd} × ${fmt(lang, rates.client)} = ${fmt(lang, cd * rates.client)}`));
    if (bd > 0)
      out.push(bullet(`${s.backofficeDays}: ${bd} × ${fmt(lang, rates.backoffice)} = ${fmt(lang, bd * rates.backoffice)}`));
    if (hasDisc) {
      out.push(bullet(`${s.servicesGrossTotal}: ${fmt(lang, grossSvc)}`));
      out.push(p(`${s.servicesDiscount}: -${fmt(lang, discSvc)}`, { color: RED, indent: { left: 360 }, spacing: { after: 60 } }));
    }
    out.push(p(`${s.totalOnsite}: ${fmt(lang, netSvc)}`, { bold: true, indent: { left: 360 }, spacing: { after: 60 } }));
    out.push(p(s.travelNote, { italic: true, color: SUBTLE, size: 20, spacing: { before: 100 } }));
  } else {
    primary.services.forEach((l) => {
      out.push(bullet(`${l.label} — ${fmt(lang, l.amount)}`));
    });
    if (primary.services.length === 0) {
      out.push(p("—", { color: SUBTLE }));
    } else {
      if (hasDisc) {
        out.push(bullet(`${s.servicesGrossTotal}: ${fmt(lang, grossSvc)}`));
        out.push(p(`${s.servicesDiscount}: -${fmt(lang, discSvc)}`, { color: RED, indent: { left: 360 }, spacing: { after: 60 } }));
      }
      out.push(p(`${s.servicesNetTotal}: ${fmt(lang, netSvc)}`, { bold: true, indent: { left: 360 }, spacing: { after: 60 } }));
    }
  }
  return out;
}

/* ----------------- Investment Summary table ----------------- */

function investmentSummaryTable(
  rows: SummaryRow[],
  s: BusinessStrings,
  showKeepit: boolean,
  showUseit: boolean,
  lang: any,
): Table {
  const colCount = 1 + (showKeepit ? 1 : 0) + (showUseit ? 1 : 0);
  const tableWidth = 9360;
  const itemCol = colCount === 3 ? 4360 : colCount === 2 ? 6160 : 9360;
  const valCol = colCount === 3 ? 2500 : colCount === 2 ? 3200 : 0;
  const columnWidths =
    colCount === 3
      ? [itemCol, valCol, valCol]
      : colCount === 2
      ? [itemCol, valCol]
      : [itemCol];

  const headerCells: TableCell[] = [cell(s.itemColumn, { bold: true, bg: RED, color: "FFFFFF", width: itemCol })];
  if (showKeepit)
    headerCells.push(
      cell(s.optionAColumn, { bold: true, bg: RED, color: "FFFFFF", width: valCol, align: AlignmentType.RIGHT }),
    );
  if (showUseit)
    headerCells.push(
      cell(s.optionBColumn, { bold: true, bg: RED, color: "FFFFFF", width: valCol, align: AlignmentType.RIGHT }),
    );

  const renderValue = (
    val: number | null | undefined,
    asIncluded: boolean | undefined,
    isDiscount: boolean | undefined,
    isTotal: boolean | undefined,
  ): TableCell => {
    if (val === null || val === undefined) {
      return cell("", { width: valCol, align: AlignmentType.RIGHT, bg: isTotal ? RED : undefined });
    }
    if (asIncluded) {
      return cell(s.satIncludedShort, {
        width: valCol,
        align: AlignmentType.RIGHT,
        italic: true,
        color: SUBTLE,
      });
    }
    const text = fmt(lang, val);
    return cell(text, {
      width: valCol,
      align: AlignmentType.RIGHT,
      bold: isTotal,
      color: isTotal ? "FFFFFF" : isDiscount ? RED : DARK,
      bg: isTotal ? RED : undefined,
    });
  };

  const trs: TableRow[] = [new TableRow({ tableHeader: true, children: headerCells })];
  rows.forEach((r) => {
    if (r.isHeader) {
      const headCells: TableCell[] = [
        cell(r.label, { bold: true, bg: DARK, color: "FFFFFF", width: itemCol }),
      ];
      if (showKeepit) headCells.push(cell("", { bg: DARK, width: valCol }));
      if (showUseit) headCells.push(cell("", { bg: DARK, width: valCol }));
      trs.push(new TableRow({ children: headCells }));
      return;
    }
    const labelCell = cell(r.label, {
      bold: r.isTotal,
      bg: r.isTotal ? RED : undefined,
      width: itemCol,
      indentLeft: r.indent ? r.indent * 220 : 0,
      color: r.isTotal ? "FFFFFF" : r.isDiscount ? RED : DARK,
      italic: r.isDiscount,
    });
    const cells: TableCell[] = [labelCell];
    if (showKeepit)
      cells.push(renderValue(r.keepitY1, r.asIncluded?.keepit, r.isDiscount, r.isTotal));
    if (showUseit) cells.push(renderValue(r.useitY1, r.asIncluded?.useit, r.isDiscount, r.isTotal));
    trs.push(new TableRow({ children: cells }));
  });

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    rows: trs,
  });
}

/* ------------------------------ generator ------------------------------ */

function resolveModels(proposal: Proposal): ProposalLicenseModel[] {
  const mode = (proposal.proposal_mode as ProposalMode) || "compare_keepit_useit";
  if (mode === "keepit_only") return ["keepit"];
  if (mode === "useit_only") return ["useit"];
  if (mode === "compare_keepit_useit") return ["keepit", "useit"];
  if (proposal.license_model) return [proposal.license_model];
  return ["keepit", "useit"];
}

function formatDateLocale(iso: string, lang: any): string {
  try {
    const locale = lang === "PT" ? "pt-PT" : lang === "ES" ? "es-ES" : "en-GB";
    return new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export interface BusinessDocxOptions {
  proposal: Proposal;
  cfg: BusinessConfig;
  rules: PricingRule[];
}

export async function generateBusinessProposalDocx(opts: BusinessDocxOptions): Promise<Blob> {
  const { proposal, cfg, rules } = opts;
  const lang = proposal.language;
  const s = tBusiness(lang);
  const models = resolveModels(proposal);
  const out = computeBusinessOptions(rules, cfg, models);
  const showKeepit = !!out.keepit;
  const showUseit = !!out.useit;
  const primary = out.keepit || out.useit!;

  const { rows } = buildInvestmentSummaryRows({
    keepit: out.keepit,
    useit: out.useit,
    cfg,
    lang,
  });

  const logoBytes = await loadLogo();
  const dateStr = formatDateLocale(proposal.proposal_date, lang);

  const headerChildren: Paragraph[] = [];
  if (logoBytes) {
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
          text: `${proposal.client_name} | ${proposal.project_name || s.businessSubtitle}`,
          bold: true,
          color: DARK,
          size: 18,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: dateStr, color: SUBTLE, size: 18, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: s.restricted, bold: true, color: RED, size: 18, font: "Calibri" }),
      ],
    }),
  );

  const footerChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 4 },
      },
      children: [
        new TextRun({
          text: s.footerLine,
          color: SUBTLE,
          size: 16,
          font: "Calibri",
        }),
      ],
    }),
  ];

  const body: (Paragraph | Table)[] = [];

  // ---- Cover (mirrors Professional layout) ----
  body.push(
    new Paragraph({ spacing: { before: 1400 }, children: [new TextRun({ text: "" })] }),
  );

  if (logoBytes) {
    body.push(
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
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MANWINWIN", bold: true, color: RED, size: 64, font: "Calibri" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
        children: [new TextRun({ text: "S O F T W A R E", color: DARK, size: 22, font: "Calibri" })],
      }),
    );
  }

  body.push(
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
        new TextRun({ text: "Business", bold: true, color: RED, size: 32, font: "Calibri" }),
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
      children: [new TextRun({ text: dateStr, color: SUBTLE, size: 22, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({ text: s.restricted, bold: true, color: RED, size: 18, font: "Calibri" }),
      ],
    }),
  );

  body.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }));

  body.push(redBarHeading(s.investmentProposal));
  body.push(p(s.forImplementation(proposal.client_name), { bold: true, size: 22 }));
  body.push(p(s.businessSubtitle, { bold: true, size: 22, color: RED, spacing: { before: 80, after: 120 } }));

  body.push(sectionHeading(s.softwareConfigHeading));
  softwareDescription(cfg, s).forEach((par) => body.push(par));

  body.push(sectionHeading(s.optionsTitle));
  optionsSection(out.keepit, out.useit, cfg, s, lang).forEach((par) => body.push(par));

  body.push(sectionHeading(s.servicesTitle));
  servicesSection(primary, cfg, s, lang).forEach((par) => body.push(par));

  body.push(sectionHeading(s.investmentSummaryTitle));
  body.push(investmentSummaryTable(rows, s, showKeepit, showUseit, lang));

  body.push(sectionHeading(s.billingHeader));
  body.push(p(s.standardTerms, { bold: true }));
  body.push(bullet(s.paymentLine1));
  body.push(bullet(s.paymentLine2));
  body.push(p(s.footnote1, { italic: true, color: SUBTLE, size: 18 }));
  body.push(p(s.footnote2, { italic: true, color: SUBTLE, size: 18 }));

  body.push(sectionHeading(s.otherInfo));
  body.push(bullet(s.vatNote));
  body.push(bullet(s.validityNote(proposal.validity_days)));
  body.push(bullet(s.satEscalationNote));

  if (cfg.deployment === "saas") {
    body.push(sectionHeading(s.featuresSaasTitle));
    s.saasFeatures.forEach((f) => body.push(bullet(f)));
  } else {
    body.push(sectionHeading(s.featuresClientServerTitle));
    s.clientServerFeatures.forEach((f) => body.push(bullet(f)));
  }

  body.push(sectionHeading(s.satTitle));
  s.satList.forEach((f) => body.push(bullet(f)));

  if (cfg.api) {
    body.push(sectionHeading(s.apiTitle));
    s.apiList.forEach((f) => body.push(bullet(f)));
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1200, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: footerChildren }) },
        children: body,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export interface BusinessDocxResult {
  blob: Blob;
  fileName: string;
}

const safeFile = (s: string) =>
  (s || "Proposal").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);

export async function downloadBusinessProposalDocx(opts: BusinessDocxOptions): Promise<BusinessDocxResult> {
  const blob = await generateBusinessProposalDocx(opts);
  const date = (opts.proposal.proposal_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fileName = `Business_Proposal_${safeFile(opts.proposal.client_name)}_${date}_v${opts.proposal.version}.docx`;
  saveAs(blob, fileName);
  return { blob, fileName };
}

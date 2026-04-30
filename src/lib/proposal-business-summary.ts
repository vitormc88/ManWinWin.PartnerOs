/**
 * Shared helpers to build the Business "Investment Summary" rows from the
 * already-validated engine output. Used by both the DOCX generator and the
 * print/PDF flow so they always match the Preview and Excel.
 *
 * Does NOT recalculate anything. Only formats engine output into row shapes.
 */
import type {
  BusinessConfig,
  BusinessLineItem,
  BusinessOptionTotals,
} from "./proposal-business-engine";
import { tBusiness, type BusinessStrings } from "./proposal-business-i18n";
import type { ProposalLanguage } from "@/types/proposal";

export interface SummaryRow {
  /** Display label */
  label: string;
  /** Optional indent level for visual nesting (0..2). */
  indent?: number;
  /** Year 1 amount for KeepIT (or null if not applicable). */
  keepitY1?: number | null;
  /** Year 1 amount for UseIT (or null if not applicable). */
  useitY1?: number | null;
  /** Whether this row is a section header (no values). */
  isHeader?: boolean;
  /** Whether this row is a totals row (bold styling). */
  isTotal?: boolean;
  /** Whether this row is a discount (negative styling). */
  isDiscount?: boolean;
  /** Whether to render as “included” instead of a number. */
  asIncluded?: { keepit?: boolean; useit?: boolean };
}

const sumNet = (items: BusinessLineItem[]): number =>
  items.reduce((s, l) => s + l.netAmount, 0);

const sumDisc = (items: BusinessLineItem[]): number =>
  items.reduce((s, l) => s + l.discountAmount, 0);

const recurringNet = (items: BusinessLineItem[]): number =>
  items
    .filter((l) => l.recurring)
    .reduce((s, l) => s + (l.discountAppliesToRenewal ? l.netAmount : l.amount), 0);

/** Year 1 software net excluding additional Web/Mobile users (handled separately). */
const softwareCoreY1 = (t: BusinessOptionTotals): number =>
  sumNet(t.software.filter((l) => l.category !== "web_user"));

const webUsersY1 = (t: BusinessOptionTotals): number => {
  const w = t.software.find((l) => l.category === "web_user");
  return w ? w.netAmount : 0;
};

const webUsersY2Plus = (t: BusinessOptionTotals): number => {
  const w = t.software.find((l) => l.category === "web_user");
  if (!w) return 0;
  return w.discountAppliesToRenewal ? w.netAmount : w.amount;
};

/** Year 2+ recurring software (excluding web users which are reported on a separate row). */
const softwareCoreY2Plus = (t: BusinessOptionTotals): number =>
  recurringNet(t.software.filter((l) => l.category !== "web_user"));

const apiY1 = (t: BusinessOptionTotals): number => t.api?.netAmount || 0;
const apiY2Plus = (t: BusinessOptionTotals): number => {
  if (!t.api) return 0;
  return t.api.discountAppliesToRenewal ? t.api.netAmount : t.api.amount;
};

const hostingTotal = (t: BusinessOptionTotals): number => sumNet(t.hosting);
const satY1 = (t: BusinessOptionTotals): number => t.sat?.netAmount || 0;

interface BuildArgs {
  keepit: BusinessOptionTotals | null;
  useit: BusinessOptionTotals | null;
  cfg: BusinessConfig;
  lang: ProposalLanguage | string | null | undefined;
}

/**
 * Returns the rows for the Investment Summary table.
 * Caller decides which value columns to render (KeepIT / UseIT / both).
 */
export function buildInvestmentSummaryRows({
  keepit,
  useit,
  cfg,
  lang,
}: BuildArgs): { rows: SummaryRow[]; s: BusinessStrings } {
  const s = tBusiness(lang);
  const rows: SummaryRow[] = [];

  const pickY1 = (
    fnK: (t: BusinessOptionTotals) => number,
    fnU: (t: BusinessOptionTotals) => number,
  ): { keepitY1: number | null; useitY1: number | null } => ({
    keepitY1: keepit ? fnK(keepit) : null,
    useitY1: useit ? fnU(useit) : null,
  });

  /* ------------------------------ YEAR 1 ------------------------------- */
  rows.push({ label: s.year1, isHeader: true });
  rows.push({ label: s.software, isHeader: true, indent: 0 });

  rows.push({
    label: s.keepItLicenseAmount + " / " + s.useItAnnualLicenseAmount,
    indent: 1,
    ...pickY1(softwareCoreY1, softwareCoreY1),
  });

  if (cfg.additionalWebUsers > 0) {
    rows.push({
      label: s.webMobileAdditional,
      indent: 1,
      ...pickY1(webUsersY1, webUsersY1),
    });
  }

  if (cfg.api) {
    rows.push({ label: s.apiRow, indent: 1, ...pickY1(apiY1, apiY1) });
  }

  if (cfg.deployment === "saas") {
    rows.push({ label: s.saasHostingRow, indent: 1, ...pickY1(hostingTotal, hostingTotal) });
  }

  // S&AT — KeepIT shows amount, UseIT shows "included"
  rows.push({
    label: s.satRow,
    indent: 1,
    keepitY1: keepit ? satY1(keepit) : null,
    useitY1: useit ? 0 : null,
    asIncluded: { useit: !!useit },
  });

  // Services
  const svcY1K = keepit ? sumNet(keepit.services) : null;
  const svcY1U = useit ? sumNet(useit.services) : null;
  const hasServices = (svcY1K || 0) > 0 || (svcY1U || 0) > 0;
  if (hasServices) {
    rows.push({ label: s.services, isHeader: true });
    rows.push({
      label: s.servicesTitle,
      indent: 1,
      keepitY1: svcY1K,
      useitY1: svcY1U,
    });
  }

  // Discount commercial rows (only if any side has them)
  const swDiscK = keepit ? sumDisc(keepit.software.filter((l) => l.category !== "web_user")) : 0;
  const swDiscU = useit ? sumDisc(useit.software.filter((l) => l.category !== "web_user")) : 0;
  if (swDiscK > 0 || swDiscU > 0) {
    rows.push({
      label: s.softwareDiscount,
      indent: 1,
      isDiscount: true,
      keepitY1: keepit ? -swDiscK : null,
      useitY1: useit ? -swDiscU : null,
    });
  }
  const webDiscK = keepit ? sumDisc(keepit.software.filter((l) => l.category === "web_user")) : 0;
  const webDiscU = useit ? sumDisc(useit.software.filter((l) => l.category === "web_user")) : 0;
  if (webDiscK > 0 || webDiscU > 0) {
    rows.push({
      label: s.webMobileDiscount,
      indent: 1,
      isDiscount: true,
      keepitY1: keepit ? -webDiscK : null,
      useitY1: useit ? -webDiscU : null,
    });
  }
  const apiDiscK = keepit?.api?.discountAmount || 0;
  const apiDiscU = useit?.api?.discountAmount || 0;
  if (apiDiscK > 0 || apiDiscU > 0) {
    rows.push({
      label: s.apiDiscount,
      indent: 1,
      isDiscount: true,
      keepitY1: keepit ? -apiDiscK : null,
      useitY1: useit ? -apiDiscU : null,
    });
  }
  const svcDiscK = keepit ? sumDisc(keepit.services) : 0;
  const svcDiscU = useit ? sumDisc(useit.services) : 0;
  if (svcDiscK > 0 || svcDiscU > 0) {
    rows.push({
      label: s.servicesDiscount,
      indent: 1,
      isDiscount: true,
      keepitY1: keepit ? -svcDiscK : null,
      useitY1: useit ? -svcDiscU : null,
    });
  }

  rows.push({
    label: s.totalOfYear1,
    isTotal: true,
    keepitY1: keepit ? keepit.totalYear1 : null,
    useitY1: useit ? useit.totalYear1 : null,
  });

  /* ---------------------------- YEAR 2 + ------------------------------ */
  rows.push({ label: s.year2Onwards, isHeader: true });

  // Software / annual license
  // KeepIT: software is one-time → show "—". UseIT: annual recurring license.
  rows.push({
    label: s.software,
    indent: 1,
    keepitY1: keepit ? softwareCoreY2Plus(keepit) : null, // typically 0
    useitY1: useit ? softwareCoreY2Plus(useit) : null, // = annual license recurring
  });

  if (cfg.additionalWebUsers > 0) {
    rows.push({
      label: s.webMobileAdditional,
      indent: 1,
      keepitY1: keepit ? webUsersY2Plus(keepit) : null,
      useitY1: useit ? webUsersY2Plus(useit) : null,
    });
  }
  if (cfg.api) {
    rows.push({
      label: s.apiRow,
      indent: 1,
      keepitY1: keepit ? apiY2Plus(keepit) : null,
      useitY1: useit ? apiY2Plus(useit) : null,
    });
  }
  if (cfg.deployment === "saas") {
    rows.push({
      label: s.saasHostingRow,
      indent: 1,
      keepitY1: keepit ? hostingTotal(keepit) : null,
      useitY1: useit ? hostingTotal(useit) : null,
    });
  }
  rows.push({
    label: s.satRow,
    indent: 1,
    keepitY1: keepit ? satY1(keepit) : null,
    useitY1: useit ? 0 : null,
    asIncluded: { useit: !!useit },
  });

  rows.push({
    label: s.totalPerYear2Plus,
    isTotal: true,
    keepitY1: keepit ? keepit.totalYear2Plus : null,
    useitY1: useit ? useit.totalYear2Plus : null,
  });

  return { rows, s };
}

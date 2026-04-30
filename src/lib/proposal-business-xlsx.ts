/**
 * Business Excel Exporter
 *
 * Generates a 3-sheet workbook for a Business proposal:
 *   1. Summary           — commercial comparison table
 *   2. Calculation Audit — internal breakdown of how totals were derived
 *   3. Pricing Inputs    — pricing assumptions used (sourced from pricing_rules)
 *
 * Uses already-validated totals from `proposal-business-engine.ts`. Does NOT
 * recalculate independently — purely formats the engine output.
 */
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  computeBusinessOptions,
  ONSITE_RATES,
  type BusinessConfig,
  type BusinessOptionTotals,
  type BusinessLineItem,
} from "./proposal-business-engine";
import type {
  PricingRule,
  Proposal,
  ProposalLicenseModel,
  ProposalMode,
} from "@/types/proposal";

type SheetRow = (string | number | null)[];

const fmtEur = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return `€${(Math.round(n * 100) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtPct = (n: number | null | undefined): string => {
  if (!n) return "0%";
  return `${n}%`;
};

const findRule = (rules: PricingRule[], code: string): PricingRule | undefined =>
  rules.find((r) => r.active && r.code === code);

const safeFile = (s: string) =>
  (s || "Proposal").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);

/* ---------------- Sheet 1: Summary ---------------- */

interface SummaryColumn {
  label: string;
  totals: BusinessOptionTotals;
}

const buildLineRow = (label: string, cols: SummaryColumn[], pick: (t: BusinessOptionTotals) => number): SheetRow => {
  return [label, ...cols.map((c) => fmtEur(pick(c.totals)))];
};

const buildSummarySheet = (
  proposal: Proposal,
  cfg: BusinessConfig,
  cols: SummaryColumn[],
): XLSX.WorkSheet => {
  const rows: SheetRow[] = [];
  rows.push(["Business Proposal — Summary"]);
  rows.push([]);
  rows.push(["Client name", proposal.client_name]);
  rows.push(["Project name", proposal.project_name || ""]);
  rows.push(["Proposal date", proposal.proposal_date]);
  rows.push(["Validity (days)", proposal.validity_days]);
  rows.push(["Country", proposal.country || ""]);
  rows.push(["Product family", "Business"]);
  rows.push([
    "Proposal mode",
    proposal.proposal_mode === "compare_keepit_useit"
      ? "Compare KeepIT vs UseIT"
      : proposal.proposal_mode === "keepit_only"
      ? "KeepIT only"
      : proposal.proposal_mode === "useit_only"
      ? "UseIT only"
      : "",
  ]);
  rows.push(["Hosting", cfg.deployment === "saas" ? "SaaS" : "On-Premise"]);
  rows.push([]);

  rows.push(["Item", ...cols.map((c) => c.label)]);

  rows.push(["YEAR 1"]);
  rows.push(["Software"]);

  const allSwLineLabels = new Set<string>();
  cols.forEach((c) =>
    c.totals.software.forEach((l) => allSwLineLabels.add(l.label)),
  );
  allSwLineLabels.forEach((label) => {
    rows.push([
      `  ${label}`,
      ...cols.map((c) => {
        const l = c.totals.software.find((x) => x.label === label);
        return l ? fmtEur(l.netAmount) : "";
      }),
    ]);
  });

  if (cols.some((c) => c.totals.api)) {
    rows.push([
      "  API ManWinWin",
      ...cols.map((c) => (c.totals.api ? fmtEur(c.totals.api.netAmount) : "")),
    ]);
  }

  if (cols.some((c) => c.totals.hosting.length > 0)) {
    const allHostLabels = new Set<string>();
    cols.forEach((c) => c.totals.hosting.forEach((l) => allHostLabels.add(l.label)));
    allHostLabels.forEach((label) => {
      rows.push([
        `  ${label}`,
        ...cols.map((c) => {
          const l = c.totals.hosting.find((x) => x.label === label);
          return l ? fmtEur(l.netAmount) : "";
        }),
      ]);
    });
  }

  if (cols.some((c) => c.totals.sat)) {
    rows.push([
      "  Support & Technical Assistance (S&AT)",
      ...cols.map((c) => (c.totals.sat ? fmtEur(c.totals.sat.netAmount) : "")),
    ]);
  }

  if (cols.some((c) => c.totals.services.length > 0)) {
    rows.push(["Services"]);
    const allSvcLabels = new Set<string>();
    cols.forEach((c) => c.totals.services.forEach((l) => allSvcLabels.add(l.label)));
    allSvcLabels.forEach((label) => {
      rows.push([
        `  ${label}`,
        ...cols.map((c) => {
          const l = c.totals.services.find((x) => x.label === label);
          return l ? fmtEur(l.netAmount) : "";
        }),
      ]);
    });
  }

  rows.push(buildLineRow("TOTAL OF THE YEAR (Year 1)", cols, (t) => t.totalYear1));

  rows.push([]);
  rows.push(["YEAR 2 AND FOLLOWING (per year)"]);
  rows.push(["Software"]);
  const allRecurringLabels = new Set<string>();
  cols.forEach((c) =>
    c.totals.software
      .filter((l) => l.recurring)
      .forEach((l) => allRecurringLabels.add(l.label)),
  );
  allRecurringLabels.forEach((label) => {
    rows.push([
      `  ${label}`,
      ...cols.map((c) => {
        const l = c.totals.software.find((x) => x.label === label && x.recurring);
        if (!l) return "";
        const amt = l.discountAppliesToRenewal ? l.netAmount : l.amount;
        return fmtEur(amt);
      }),
    ]);
  });
  if (cols.some((c) => c.totals.api)) {
    rows.push([
      "  API ManWinWin",
      ...cols.map((c) => {
        const a = c.totals.api;
        if (!a) return "";
        return fmtEur(a.discountAppliesToRenewal ? a.netAmount : a.amount);
      }),
    ]);
  }
  if (cols.some((c) => c.totals.hosting.length > 0)) {
    const allHostLabels = new Set<string>();
    cols.forEach((c) => c.totals.hosting.forEach((l) => allHostLabels.add(l.label)));
    allHostLabels.forEach((label) => {
      rows.push([
        `  ${label}`,
        ...cols.map((c) => {
          const l = c.totals.hosting.find((x) => x.label === label);
          return l ? fmtEur(l.netAmount) : "";
        }),
      ]);
    });
  }
  if (cols.some((c) => c.totals.sat)) {
    rows.push([
      "  S&AT",
      ...cols.map((c) =>
        c.totals.sat ? fmtEur(c.totals.sat.netAmount) : "",
      ),
    ]);
  }
  rows.push(buildLineRow("TOTAL PER YEAR (Year 2+)", cols, (t) => t.totalYear2Plus));

  return XLSX.utils.aoa_to_sheet(rows);
};

/* ---------------- Sheet 2: Calculation Audit ---------------- */

const buildAuditBlock = (model: "KeepIT" | "UseIT", t: BusinessOptionTotals): SheetRow[] => {
  const rows: SheetRow[] = [];
  rows.push([`${model.toUpperCase()} AUDIT`]);

  if (model === "KeepIT") {
    rows.push(["License base lines"]);
    t.software
      .filter((l) => l.category !== "web_user")
      .forEach((l) => {
        rows.push([
          `  ${l.label}`,
          `qty ${l.qty}`,
          fmtEur(l.amount),
          l.discountPct > 0 ? `disc ${l.discountPct}%` : "",
          fmtEur(l.netAmount),
        ]);
      });
    const baseLines = t.software.filter((l) => l.category !== "web_user");
    const baseGross = baseLines.reduce((s, l) => s + l.amount, 0);
    const baseDisc = baseLines.reduce((s, l) => s + l.discountAmount, 0);
    const baseNet = baseLines.reduce((s, l) => s + l.netAmount, 0);
    rows.push(["License base subtotal (gross)", "", fmtEur(baseGross)]);
    rows.push(["Software discount", "", fmtEur(-baseDisc)]);
    rows.push(["License net subtotal", "", fmtEur(baseNet)]);
    rows.push([]);

    rows.push(["S&AT"]);
    rows.push(["  License base for S&AT", fmtEur(t.satBreakdown.satBase)]);
    rows.push([
      `  ${t.satBreakdown.satPct}% × license base`,
      fmtEur(t.satBreakdown.satPercentageAmount),
    ]);
    rows.push(["  Pre-contracted S&AT day", fmtEur(t.satBreakdown.baseSatDay)]);
    rows.push(["  Default included Web/Mobile user", fmtEur(t.satBreakdown.baseDefaultWeb)]);
    rows.push(["Total S&AT", "", fmtEur(t.sat?.netAmount || 0)]);
    rows.push([
      "Note: additional Web/Mobile users, API, hosting and services are not part of S&AT base.",
    ]);
    rows.push([]);
  } else {
    const d = t.useItDerivation;
    if (d) {
      rows.push(["KeepIT license base used for formula", fmtEur(d.keepitLicenseBase)]);
      rows.push([`UseIT factor`, `${d.factorPct}%`]);
      rows.push([`${d.factorPct}% × KeepIT license base`, fmtEur(d.factorAmount)]);
      rows.push(["Included pre-contracted S&AT day", fmtEur(d.baseSatDay)]);
      rows.push(["Included default Web/Mobile user", fmtEur(d.baseDefaultWeb)]);
      rows.push(["Gross UseIT annual software/license base", fmtEur(d.annualBase)]);
      const swLine = t.software.find((l) => l.code === "BUS_USEIT_ANNUAL_LICENSE");
      if (swLine) {
        rows.push([`Software discount`, fmtPct(swLine.discountPct), fmtEur(-swLine.discountAmount)]);
        rows.push(["Net UseIT annual software/license base", "", fmtEur(swLine.netAmount)]);
      }
      rows.push([]);
    }
  }

  const web = t.software.find((l) => l.category === "web_user");
  rows.push(["Additional Web/Mobile users"]);
  if (web) {
    rows.push([`  qty`, web.qty]);
    rows.push([`  gross`, fmtEur(web.amount)]);
    rows.push([`  discount`, fmtPct(web.discountPct), fmtEur(-web.discountAmount)]);
    rows.push([`  net`, "", fmtEur(web.netAmount)]);
    rows.push([
      `  renewal behavior`,
      web.discountAppliesToRenewal ? "discount applies to Year 2+" : "discount Year 1 only",
    ]);
  } else {
    rows.push(["  (none)"]);
  }
  rows.push([]);

  rows.push(["API"]);
  if (t.api) {
    rows.push(["  gross", fmtEur(t.api.amount)]);
    rows.push(["  discount", fmtPct(t.api.discountPct), fmtEur(-t.api.discountAmount)]);
    rows.push(["  net", "", fmtEur(t.api.netAmount)]);
  } else {
    rows.push(["  (not selected)"]);
  }
  rows.push([]);

  rows.push(["Hosting"]);
  if (t.hosting.length > 0) {
    t.hosting.forEach((h) => rows.push([`  ${h.label}`, fmtEur(h.netAmount)]));
    rows.push(["  total", "", fmtEur(t.hosting.reduce((s, l) => s + l.netAmount, 0))]);
  } else {
    rows.push(["  (On-Premise — none)"]);
  }
  rows.push([]);

  rows.push(["Services"]);
  const svcGross = t.services.reduce((s, l) => s + l.amount, 0);
  const svcDisc = t.services.reduce((s, l) => s + l.discountAmount, 0);
  const svcNet = t.services.reduce((s, l) => s + l.netAmount, 0);
  t.services.forEach((s) => rows.push([`  ${s.label}`, fmtEur(s.amount), fmtEur(s.netAmount)]));
  rows.push(["  gross", "", fmtEur(svcGross)]);
  rows.push(["  discount", "", fmtEur(-svcDisc)]);
  rows.push(["  net", "", fmtEur(svcNet)]);
  rows.push([]);

  rows.push(["Year 1 total (formula: software net + api net + hosting + S&AT + services net)", "", fmtEur(t.totalYear1)]);
  rows.push(["Year 2+ total (formula: recurring software + api + hosting + S&AT)", "", fmtEur(t.totalYear2Plus)]);
  rows.push([]);
  rows.push(["5-year verification"]);
  rows.push(["  Year 1", fmtEur(t.totalYear1)]);
  for (let y = 2; y <= 5; y++) rows.push([`  Year ${y}`, fmtEur(t.totalYear2Plus)]);
  rows.push(["  5-year total", "", fmtEur(t.totalFiveYears)]);
  rows.push([]);
  return rows;
};

const buildAuditSheet = (
  keepit: BusinessOptionTotals | null,
  useit: BusinessOptionTotals | null,
): XLSX.WorkSheet => {
  const rows: SheetRow[] = [];
  rows.push(["Business Proposal — Calculation Audit"]);
  rows.push([]);
  if (keepit) rows.push(...buildAuditBlock("KeepIT", keepit));
  if (useit) rows.push(...buildAuditBlock("UseIT", useit));

  if (keepit && useit) {
    rows.push(["Compare mode — 5-year reconciliation"]);
    rows.push(["  KeepIT 5-year total", fmtEur(keepit.totalFiveYears)]);
    rows.push(["  UseIT 5-year total", fmtEur(useit.totalFiveYears)]);
    const diff = +(useit.totalFiveYears - keepit.totalFiveYears).toFixed(2);
    rows.push(["  Difference (UseIT − KeepIT)", fmtEur(diff)]);

    const sumDisc = (
      t: BusinessOptionTotals,
      pred: (l: BusinessLineItem) => boolean,
    ): number => {
      const sw = t.software.filter(pred).reduce((s, l) => s + l.discountAmount, 0);
      return sw;
    };
    const kSoft = sumDisc(keepit, (l) => l.category !== "web_user");
    const uSoft = sumDisc(useit, (l) => l.category !== "web_user");
    const kWeb = sumDisc(keepit, (l) => l.category === "web_user");
    const uWeb = sumDisc(useit, (l) => l.category === "web_user");
    const kApi = keepit.api?.discountAmount || 0;
    const uApi = useit.api?.discountAmount || 0;
    const kSvc = keepit.services.reduce((s, l) => s + l.discountAmount, 0);
    const uSvc = useit.services.reduce((s, l) => s + l.discountAmount, 0);

    const dSoft = +(uSoft - kSoft).toFixed(2);
    const dWeb = +(uWeb - kWeb).toFixed(2);
    const dApi = +(uApi - kApi).toFixed(2);
    const dSvc = +(uSvc - kSvc).toFixed(2);
    const dTotal = +(dSoft + dWeb + dApi + dSvc).toFixed(2);
    const hasDiscounts = keepit.hasDiscounts || useit.hasDiscounts;
    const explained = hasDiscounts && Math.abs(diff - dTotal) <= 1;
    const ok = Math.abs(diff) <= 1;

    rows.push([]);
    rows.push(["  Discount delta breakdown (UseIT − KeepIT)"]);
    rows.push(["    KeepIT software discount", fmtEur(-kSoft)]);
    rows.push(["    UseIT software discount", fmtEur(-uSoft)]);
    rows.push(["    Software discount delta", fmtEur(dSoft)]);
    rows.push(["    KeepIT web discount", fmtEur(-kWeb)]);
    rows.push(["    UseIT web discount", fmtEur(-uWeb)]);
    rows.push(["    Web discount delta", fmtEur(dWeb)]);
    rows.push(["    KeepIT API discount", fmtEur(-kApi)]);
    rows.push(["    UseIT API discount", fmtEur(-uApi)]);
    rows.push(["    API discount delta", fmtEur(dApi)]);
    rows.push(["    KeepIT services discount", fmtEur(-kSvc)]);
    rows.push(["    UseIT services discount", fmtEur(-uSvc)]);
    rows.push(["    Services discount delta", fmtEur(dSvc)]);
    rows.push(["    Total discount delta", fmtEur(dTotal)]);
    rows.push([]);
    rows.push([
      "  Status",
      ok
        ? "OK (within 1 €)"
        : explained
        ? "OK — difference explained by discounts"
        : "Check pricing — unexplained difference",
    ]);
  }
  return XLSX.utils.aoa_to_sheet(rows);
};

/* ---------------- Sheet 3: Pricing Inputs ---------------- */

const buildPricingSheet = (rules: PricingRule[]): XLSX.WorkSheet => {
  const rows: SheetRow[] = [];
  rows.push(["Business Proposal — Pricing Inputs"]);
  rows.push([]);
  rows.push(["Code", "Label", "Unit price", "Notes"]);

  const keys: Array<{ code: string; label: string; fallback?: number }> = [
    { code: "BUS_KEEPIT_MAINTENANCE_MODULE", label: "Maintenance Module (KeepIT)" },
    { code: "BUS_KEEPIT_REQUESTS_MODULE", label: "Requests Module (KeepIT)" },
    { code: "BUS_KEEPIT_STOCK_MODULE", label: "Stock Module (KeepIT)" },
    { code: "BUS_KEEPIT_PURCHASE_MODULE", label: "Purchase Module (KeepIT)" },
    { code: "BUS_KEEPIT_PLUGIN_IMPORT", label: "Plugin Import (KeepIT)" },
    { code: "BUS_KEEPIT_PLUGIN_WORKFLOW", label: "Plugin Workflow (KeepIT)" },
    { code: "BUS_KEEPIT_PLUGIN_ADVANCED_REPORTS", label: "Plugin Advanced Reports (KeepIT)" },
    { code: "BUS_KEEPIT_PLUGIN_SLA", label: "Plugin SLA (KeepIT)" },
    { code: "BUS_KEEPIT_ADDITIONAL_BACKOFFICE", label: "Additional BackOffice user (KeepIT)" },
    { code: "BUS_WEB_MOBILE_USER", label: "Web/Mobile additional user (per year)" },
    { code: "BUS_API", label: "API ManWinWin (per year)" },
    { code: "BUS_SAAS_HOSTING_BASE", label: "SaaS hosting base (per year)" },
    { code: "BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE", label: "SaaS hosting — additional BackOffice (per year)" },
    { code: "BUS_BASE_SAT_DAY", label: "Pre-contracted S&AT day", fallback: 490 },
    { code: "BUS_BASE_DEFAULT_WEB", label: "Default included Web/Mobile user", fallback: 240 },
  ];
  keys.forEach((k) => {
    const r = findRule(rules, k.code);
    rows.push([
      k.code,
      k.label,
      r ? fmtEur(r.unit_price) : fmtEur(k.fallback ?? 0),
      r?.notes || "",
    ]);
  });

  const sat = findRule(rules, "BUS_KEEPIT_SAT");
  rows.push(["BUS_KEEPIT_SAT", "S&AT percentage (KeepIT)", `${sat?.support_percentage ?? 17}%`, ""]);
  const useitFactor = findRule(rules, "BUS_USEIT_FACTOR");
  rows.push([
    "BUS_USEIT_FACTOR",
    "UseIT factor",
    `${useitFactor?.support_percentage ?? useitFactor?.unit_price ?? 37}%`,
    "",
  ]);

  rows.push([]);
  rows.push(["RCI Business prices"]);
  const rciCodes = [
    "BUS_RCI_BASE",
    "BUS_RCI_STOCK",
    "BUS_RCI_REQUESTS",
    "BUS_RCI_PURCHASING",
    "BUS_RCI_WEB",
    "BUS_RCI_PLUGIN_WORKFLOW",
    "BUS_RCI_PLUGIN_IMPORT",
    "BUS_RCI_PLUGIN_SLA",
    "BUS_RCI_PLUGIN_ADVANCED_REPORTS",
    "BUS_RCI_LIVE_SESSION",
  ];
  rciCodes.forEach((c) => {
    const r = findRule(rules, c);
    if (r) rows.push([c, r.label, fmtEur(r.unit_price), r.notes || ""]);
  });

  rows.push([]);
  rows.push(["Onsite day rates (region)"]);
  Object.entries(ONSITE_RATES).forEach(([region, v]) => {
    rows.push([region, "Client day", fmtEur(v.client)]);
    rows.push([region, "BackOffice day", fmtEur(v.backoffice)]);
  });

  return XLSX.utils.aoa_to_sheet(rows);
};

/* ---------------- Public API ---------------- */

export interface BusinessXlsxOptions {
  proposal: Proposal;
  cfg: BusinessConfig;
  rules: PricingRule[];
}

export interface BusinessXlsxResult {
  blob: Blob;
  fileName: string;
}

export const generateBusinessXlsx = (opts: BusinessXlsxOptions): BusinessXlsxResult => {
  const { proposal, cfg, rules } = opts;
  const mode: ProposalMode =
    (proposal.proposal_mode as ProposalMode) || "compare_keepit_useit";
  const license = (proposal.license_model as ProposalLicenseModel) || null;

  const models: ProposalLicenseModel[] =
    mode === "compare_keepit_useit"
      ? ["keepit", "useit"]
      : mode === "keepit_only"
      ? ["keepit"]
      : mode === "useit_only"
      ? ["useit"]
      : license
      ? [license]
      : ["keepit", "useit"];

  const out = computeBusinessOptions(rules, cfg, models);

  const cols: SummaryColumn[] = [];
  if (out.keepit && (mode === "compare_keepit_useit" || mode === "keepit_only" || license === "keepit"))
    cols.push({ label: 'Permanent "KeepIT" License', totals: out.keepit });
  if (out.useit && (mode === "compare_keepit_useit" || mode === "useit_only" || license === "useit"))
    cols.push({ label: 'Annual "UseIT" License', totals: out.useit });

  const wb = XLSX.utils.book_new();

  const summary = buildSummarySheet(proposal, cfg, cols);
  summary["!cols"] = [{ wch: 60 }, ...cols.map(() => ({ wch: 30 }))];
  summary["!freeze"] = { xSplit: 0, ySplit: 12 } as any;
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const audit = buildAuditSheet(out.keepit, out.useit);
  audit["!cols"] = [{ wch: 60 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, audit, "Calculation Audit");

  const pricing = buildPricingSheet(rules);
  pricing["!cols"] = [{ wch: 42 }, { wch: 50 }, { wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, pricing, "Pricing Inputs");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const date = (proposal.proposal_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fileName = `Business_Proposal_${safeFile(proposal.client_name)}_${date}_v${proposal.version}.xlsx`;
  return { blob, fileName };
};

export const downloadBusinessXlsx = (opts: BusinessXlsxOptions): BusinessXlsxResult => {
  const res = generateBusinessXlsx(opts);
  saveAs(res.blob, res.fileName);
  return res;
};

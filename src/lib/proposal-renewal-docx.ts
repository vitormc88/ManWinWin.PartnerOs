/**
 * Renewal proposal DOCX generator.
 *
 * Renewals P0B — a contract-driven renewal must produce a *renewal* document
 * that carries the real contract lines and the current-vs-proposed financial
 * story. It must never regenerate catalogue pricing (Business engine) nor be
 * mistaken for a generic Professional proposal.
 *
 * The product identity (Business / Professional and its variant) is printed
 * from the proposal record itself, so a Business renewal stays Business.
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
  Footer,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import type { Proposal, ProposalItem } from "@/types/proposal";
import { formatEuro } from "@/lib/proposal-i18n";
import {
  NOT_RECORDED,
  buildRenewalFinancialSummary,
  compareProposalToBaseline,
  type RenewalBaseline,
} from "@/lib/renewal-baseline";
import logoUrl from "@/assets/manwinwin-logo.png";

const RED = "E01F2C";
const DARK = "2C3E50";
const GREY_BG = "F5F5F5";
const GREY_BORDER = "D0D0D0";
const CONTENT_WIDTH = 9360;

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

function redBarHeading(text: string) {
  return new Paragraph({
    shading: { fill: RED, type: ShadingType.CLEAR, color: "auto" },
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text: "  " + text, bold: true, color: "FFFFFF", size: 28, font: "Calibri" })],
  });
}

function cell(
  text: string,
  opts: { bold?: boolean; bg?: string; align?: any; width?: number; color?: string; italic?: boolean } = {},
) {
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
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            italics: opts.italic,
            color: opts.color || DARK,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });
}

function table(rows: TableRow[], columnWidths: number[]) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    rows,
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

export interface RenewalDocxOptions {
  proposal: Proposal;
  items: ProposalItem[];
  baseline: RenewalBaseline | null;
  /** Proposed recurring (Year 2+) total, computed from the baseline items. */
  proposedRecurring: number;
  /** Proposed Year 1 total (recurring + one-time). */
  proposedYear1: number;
}

/** Human product identity line, e.g. "ManWinWin Business UseIT · SaaS". */
export function renewalProductIdentity(proposal: Proposal, baseline: RenewalBaseline | null): string {
  const family = (proposal as any).product_family || baseline?.productFamily || null;
  const variant = baseline?.variantLabel || baseline?.product || null;
  const model = (proposal as any).license_model as string | null;
  const modelLabel = model === "keepit" ? "KeepIT" : model === "useit" ? "UseIT" : null;
  const parts = [
    variant && /business|professional/i.test(variant) ? variant : [family, modelLabel].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];
  const label = parts[0] || family || "ManWinWin";
  const hosting = (proposal as any).hosting || baseline?.hosting || null;
  return hosting ? `${label} · ${hosting}` : label;
}

function money(v: number | null | undefined, lang: any): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_RECORDED;
  return formatEuro(v, lang);
}

/** Builds the renewal document model (exported so it can be inspected in tests). */
export async function buildRenewalProposalDocument(opts: RenewalDocxOptions): Promise<Document> {
  const { proposal, items, baseline, proposedRecurring, proposedYear1 } = opts;
  const lang = (proposal as any).language || "EN";
  const financials = buildRenewalFinancialSummary({ baseline, proposedRecurring, proposedYear1 });
  const selectedModel = (proposal as any).license_model as string | null;
  const selectedVariantLabel =
    baseline?.variantNeedsReview && selectedModel
      ? selectedModel === "keepit"
        ? "KeepIT"
        : selectedModel === "useit"
        ? "UseIT"
        : null
      : null;
  const comparison = compareProposalToBaseline(baseline, items, { selectedVariantLabel });

  const logo = await loadLogo();
  const identity = renewalProductIdentity(proposal, baseline);
  const clientName = (proposal as any).client_name || baseline?.clientId || "Client";

  const children: any[] = [];

  if (logo) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: logo,
            transformation: { width: 170, height: 48 },
            altText: { title: "ManWinWin", description: "ManWinWin logo", name: "logo" },
          }),
        ],
      }),
    );
  }

  // ── Identity: this is unambiguously a renewal document ────────────────
  children.push(p("Renewal Proposal", { bold: true, size: 40, color: RED, spacing: { before: 200 } }));
  children.push(p(`${clientName} — ${identity}`, { bold: true, size: 26 }));
  children.push(
    p(
      `Proposal v${(proposal as any).version ?? 1} · ${(proposal as any).proposal_date || ""} · Renewal date: ${
        baseline?.renewalDate || NOT_RECORDED
      }`,
      { size: 20, color: "6B7280" },
    ),
  );

  // ── Current Contract Baseline (read-only evidence) ────────────────────
  children.push(redBarHeading("Current Contract Baseline"));
  const b = baseline;
  const baselineRows: [string, string][] = [
    ["Product", b?.product || NOT_RECORDED],
    ["Plan / Variant", b?.variantLabel || (b?.plan ? `Plan ${b.plan}` : NOT_RECORDED)],
    ["Hosting", b?.hosting || NOT_RECORDED],
    ["Version", b?.version || NOT_RECORDED],
    ["BackOffice users", b?.backofficeUsers != null ? String(b.backofficeUsers) : NOT_RECORDED],
    ["Web accesses", b?.webUsers != null ? String(b.webUsers) : NOT_RECORDED],
    ["Mobile users", b?.mobileUsers != null ? String(b.mobileUsers) : NOT_RECORDED],
    ["Contract period", `${b?.contractStartDate || NOT_RECORDED} → ${b?.contractEndDate || NOT_RECORDED}`],
    ["Billing frequency", b?.billingFrequency || NOT_RECORDED],
    ["Current recurring value", money(b?.currentRecurring ?? null, lang)],
  ];
  children.push(
    table(
      baselineRows.map(([k, v]) =>
        new TableRow({ children: [cell(k, { bold: true, bg: GREY_BG, width: 3360 }), cell(v, { width: 6000 })] }),
      ),
      [3360, 6000],
    ),
  );

  const activeModules = [...(b?.modules || []), ...(b?.plugins || [])];
  if (activeModules.length) {
    children.push(p("Licensed modules & plugins", { bold: true, spacing: { before: 200, after: 80 } }));
    children.push(
      p(
        activeModules
          .map((m) => `${m.name}${m.includedInBase ? " (included in base)" : ""}${m.needsReview ? " — needs review" : ""}`)
          .join(" · "),
        { size: 20 },
      ),
    );
  }

  // ── Proposed renewal lines (the real contract lines) ──────────────────
  children.push(redBarHeading("Proposed Renewal"));
  const lineRows = [
    new TableRow({
      children: [
        cell("Item", { bold: true, bg: GREY_BG, width: 5160 }),
        cell("Qty", { bold: true, bg: GREY_BG, width: 800, align: AlignmentType.CENTER }),
        cell("Unit price", { bold: true, bg: GREY_BG, width: 1700, align: AlignmentType.RIGHT }),
        cell("Total", { bold: true, bg: GREY_BG, width: 1700, align: AlignmentType.RIGHT }),
      ],
    }),
    ...items.map(
      (it) =>
        new TableRow({
          children: [
            cell(it.item_name + (it.is_recurring ? " (recurring)" : " (one-time)"), { width: 5160 }),
            cell(String(it.qty ?? 1), { width: 800, align: AlignmentType.CENTER }),
            cell(money(Number(it.unit_price) || 0, lang), { width: 1700, align: AlignmentType.RIGHT }),
            cell(money(Number(it.total) || 0, lang), { width: 1700, align: AlignmentType.RIGHT }),
          ],
        }),
    ),
  ];
  children.push(table(lineRows, [5160, 800, 1700, 1700]));

  // ── Financial summary: three separated concepts ───────────────────────
  children.push(redBarHeading("Financial Summary"));
  const deltaLabel =
    financials.recurringDelta === null
      ? NOT_RECORDED
      : `${financials.recurringDelta >= 0 ? "+" : ""}${money(financials.recurringDelta, lang)}${
          financials.recurringDeltaPct === null ? "" : ` (${financials.recurringDeltaPct >= 0 ? "+" : ""}${financials.recurringDeltaPct}%)`
        }`;
  const finRows: [string, string][] = [
    ["Current recurring value", money(financials.currentRecurring, lang)],
    ["Proposed recurring value", money(financials.proposedRecurring, lang)],
    ["Recurring difference", deltaLabel],
    ["One-time charges", money(financials.oneTimeCharges, lang)],
    ["Proposed Year 1 total", money(financials.proposedYear1, lang)],
    ["Proposed Year 2+ recurring", money(financials.proposedYear2Plus, lang)],
  ];
  children.push(
    table(
      finRows.map(([k, v], idx) =>
        new TableRow({
          children: [
            cell(k, { bold: idx >= 4, bg: GREY_BG, width: 5160 }),
            cell(v, { bold: idx >= 4, width: 4200, align: AlignmentType.RIGHT }),
          ],
        }),
      ),
      [5160, 4200],
    ),
  );

  // ── Changes from current contract ─────────────────────────────────────
  children.push(redBarHeading("Changes from Current Contract"));
  if (comparison.isStraightRenewal) {
    children.push(p("Straight renewal — no changes to the current contract configuration or pricing.", { size: 21 }));
  } else {
    comparison.changes.forEach((c) => {
      children.push(p(`• ${c.label}${c.detail ? ` — ${c.detail}` : ""}`, { size: 21 }));
    });
  }

  const notes = (proposal as any).notes as string | null;
  if (notes) {
    children.push(redBarHeading("Notes"));
    children.push(p(notes, { size: 21 }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              p(`ManWinWin Software — Renewal Proposal — ${clientName}`, {
                size: 16,
                color: "9CA3AF",
                align: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return doc;
}

export async function generateRenewalProposalDocx(opts: RenewalDocxOptions): Promise<Blob> {
  return Packer.toBlob(await buildRenewalProposalDocument(opts));
}

export interface RenewalDocxResult {
  blob: Blob;
  fileName: string;
}

export async function downloadRenewalProposalDocx(opts: RenewalDocxOptions): Promise<RenewalDocxResult> {
  const blob = await generateRenewalProposalDocx(opts);
  const safeClient = ((opts.proposal as any).client_name || "Client").replace(/[^\w\-]+/g, "_");
  const fileName = `Renewal_Proposal_${safeClient}_v${(opts.proposal as any).version ?? 1}.docx`;
  saveAs(blob, fileName);
  return { blob, fileName };
}

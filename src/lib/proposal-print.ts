import type { Proposal, ProposalItem } from "@/types/proposal";
import { formatEuro, frequencyLabel as i18nFrequencyLabel, t } from "./proposal-i18n";
import { computeTotals, enrichProposalItem, getItemEffectiveDiscount, getItemRenewalValue, getSectionDiscountSummary } from "./proposal-engine";
import { getCommercialIncludes, getCommercialItemLabel } from "./proposal-commercial";
import logoUrl from "@/assets/manwinwin-logo.png";

/**
 * Open a print-friendly window with the proposal rendered as HTML.
 * Users use the browser's "Save as PDF" to export.
 */
export function printProposal(proposal: Proposal, items: ProposalItem[]) {
  const lang = proposal.language as any;
  const s = t(lang);
  const softwarePct = Number(proposal.software_discount_pct || 0);
  const servicesPct = Number(proposal.services_discount_pct || 0);
  const totals = computeTotals(items, softwarePct, servicesPct);
  const softwareDiscountSummary = getSectionDiscountSummary(items, "software", softwarePct, servicesPct);
  const servicesDiscountSummary = getSectionDiscountSummary(items, "services", softwarePct, servicesPct);
  const includes = getCommercialIncludes(proposal.plan, proposal.language, proposal.include_requests_module, proposal.web_users);
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;

  const software = items.filter((i) => i.category === "software" || i.category === "addon");
  const services = items.filter((i) => i.category === "service" || (i.category === "custom" && !i.is_recurring));
  const recurring = items.filter((i) => i.is_recurring);

  // Per-section discount presence — drives whether columns appear
  const softwareHasDiscount = totals.softwareDiscountAmount > 0;
  const servicesHasDiscount = totals.servicesDiscountAmount > 0;

  const itemLabel = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, softwarePct, servicesPct);
    const baseLabel = getCommercialItemLabel(it, proposal);
    const labelHasQty = /\(×\d+\)/.test(baseLabel);
    const qtySuffix = it.qty > 1 && !labelHasQty ? ` <span class="muted">×${it.qty}</span>` : "";
    return `${esc(baseLabel)}${qtySuffix}`;
  };

  const frequencyLabel = (rawItem: ProposalItem) => {
    if (!rawItem.is_recurring) return i18nFrequencyLabel(rawItem.frequency || "one-time", lang);
    return i18nFrequencyLabel("yearly", lang);
  };

  const discountCellLabel = (rawItem: ProposalItem) => {
    const eff = getItemEffectiveDiscount(rawItem, softwarePct, servicesPct);
    if (!eff.amount) return "—";
    const isSoftware = rawItem.category === "software" || rawItem.category === "addon";
    const prefix =
      eff.source === "section"
        ? `${isSoftware ? esc(s.softwareDiscountLabel(eff.value)) : esc(s.servicesDiscountLabel(eff.value))} `
        : eff.type === "percent"
        ? `${Number(eff.value || 0)}% `
        : "";
    return `${prefix}<span class="discount-amount">-${formatEuro(Number(eff.amount) || 0, lang)}</span>`;
  };

  // Detailed (with discount columns) line row
  const detailedLineRow = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, softwarePct, servicesPct);
    return `
    <tr>
      <td>${itemLabel(rawItem)}</td>
      <td class="num">${formatEuro(Number(it.gross_total) || 0, lang)}</td>
      <td class="num discount">${discountCellLabel(rawItem)}</td>
      <td class="num strong">${formatEuro(Number(it.net_total) || 0, lang)}</td>
    </tr>`;
  };

  // Simple (no-discount) line row: Item | Total | Frequency
  const simpleLineRow = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, softwarePct, servicesPct);
    return `
    <tr>
      <td>${itemLabel(rawItem)}</td>
      <td class="num strong">${formatEuro(Number(it.gross_total) || 0, lang)}</td>
      <td class="freq">${esc(frequencyLabel(rawItem))}</td>
    </tr>`;
  };

  const renewalRow = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, softwarePct, servicesPct);
    const renewal = getItemRenewalValue(rawItem, softwarePct, servicesPct);
    const discounted = Boolean(rawItem.apply_discount_to_renewal) && renewal < (Number(it.gross_total) || 0);
    return `
    <tr>
      <td>${esc(getCommercialItemLabel(it, proposal))}${discounted ? ` <em class="renewal-tag">(${esc(s.renewalDiscountApplied)})</em>` : ""}</td>
      <td class="num strong">${formatEuro(renewal, lang)} <span class="muted">${esc(s.perYear)}</span></td>
    </tr>`;
  };

  const softwareUniformLabel = softwareDiscountSummary.mode === "uniform-section"
    ? s.softwareDiscountLabel(Number(softwareDiscountSummary.pct || 0))
    : s.softwareDiscountsTotalLabel;
  const servicesUniformLabel = servicesDiscountSummary.mode === "uniform-section"
    ? s.servicesDiscountLabel(Number(servicesDiscountSummary.pct || 0))
    : s.servicesDiscountsTotalLabel;

  /**
   * Render a section as a single table.
   * - With discounts: Item | Gross | Discount | Net  + gross/discount/net subtotal rows.
   * - Without discounts: Item | Total | Frequency  + single subtotal row.
   *
   * Subtotal rows live in <tbody> (not <tfoot>) so the browser does NOT
   * repeat them on every page when the table spans a page break.
   */
  const sectionBlock = (
    title: string,
    list: ProposalItem[],
    grossAmount: number,
    netAmount: number,
    discountAmount: number,
    discountLabel: string,
    showDiscountColumns: boolean,
  ) => {
    if (list.length === 0) return "";

    if (showDiscountColumns) {
      return `
      <h2>${esc(title)}</h2>
      <table class="lines">
        <thead>
          <tr><th>${esc(s.colItem)}</th><th class="num">${esc(s.colGross)}</th><th class="num">${esc(s.discount)}</th><th class="num">${esc(s.colNet)}</th></tr>
        </thead>
        <tbody>
          ${list.map(detailedLineRow).join("")}
          <tr class="subtotal-row"><td colspan="3">${esc(s.grossSubtotal(title))}</td><td class="num">${formatEuro(grossAmount, lang)}</td></tr>
          ${discountAmount > 0 ? `<tr class="subtotal-row discount-row"><td colspan="3">${esc(discountLabel)}</td><td class="num">− ${formatEuro(discountAmount, lang)}</td></tr>` : ""}
          <tr class="subtotal-row strong"><td colspan="3">${esc(s.netSubtotal(title))}</td><td class="num">${formatEuro(netAmount, lang)}</td></tr>
        </tbody>
      </table>`;
    }

    // Simple — no discounts in this section
    return `
      <h2>${esc(title)}</h2>
      <table class="lines">
        <thead>
          <tr><th>${esc(s.colItem)}</th><th class="num">${esc(s.colTotal)}</th><th>${esc(s.colFrequency)}</th></tr>
        </thead>
        <tbody>
          ${list.map(simpleLineRow).join("")}
          <tr class="subtotal-row strong"><td colspan="2">${esc(s.sectionSubtotal(title))}</td><td class="num">${formatEuro(grossAmount, lang)}</td></tr>
        </tbody>
      </table>`;
  };

  const html = `<!doctype html>
<html lang="${lang.toLowerCase()}">
<head>
<meta charset="utf-8" />
<title>Proposal ${esc(proposal.client_name)} v${proposal.version}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 11pt; line-height: 1.45; }
  .header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding: 0 0 14px; border-bottom: 2px solid #c00; margin-bottom: 18px; }
  .logo { max-width: 220px; height: auto; display:block; }
  .hero { margin-bottom: 18px; }
  .cover h1 { font-size: 24pt; margin: 0 0 6px; color: #1a1a1a; }
  .cover .sub { color: #666; font-size: 12pt; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 10px 0 24px; font-size: 10.5pt; }
  .meta .k { color: #666; }
  .restricted { color: #c00; font-weight: 600; font-size: 9pt; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px; }
  h2 { font-size: 13pt; color: #c00; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 10px; }
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10pt; }
  table.lines th, table.lines td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  table.lines th { background: #f6f6f6; font-weight: 600; font-size: 9.5pt; color: #333; }
  /* Prevent the browser from auto-repeating the table header row before subtotal-only rows on a new page. */
  table.lines thead { display: table-row-group; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.freq { color: #555; font-size: 9.5pt; white-space: nowrap; }
  td.discount { color: #c00; font-size: 9.5pt; }
  td.discount .discount-amount { font-weight: 600; }
  td.strong { font-weight: 600; }
  /* Keep subtotal rows visually attached to the table they summarize. */
  table.lines tbody tr.subtotal-row { page-break-inside: avoid; break-inside: avoid; page-break-before: avoid; break-before: avoid; }
  table.lines tbody tr.subtotal-row td { background: #fafafa; font-size: 10pt; padding: 6px 8px; border-top: 1px solid #e5e5e5; border-bottom: none; color: #333; }
  table.lines tbody tr.subtotal-row td:first-child { text-align: right; }
  table.lines tbody tr.subtotal-row.discount-row td { color: #c00; }
  table.lines tbody tr.subtotal-row.strong td { font-weight: 700; border-top: 1px solid #ccc; }
  .muted { color: #888; font-size: 9pt; font-weight: 400; }
  .year-total { display:flex; justify-content:space-between; align-items:baseline; padding: 10px 14px; background: #c00; color: #fff; border-radius: 4px; font-size: 13pt; font-weight: 700; margin: 6px 0 18px; }
  .renewal-block { border: 1px solid #e2e2e2; border-radius: 4px; padding: 10px 14px; background: #fafafa; margin-bottom: 6px; }
  .renewal-block table { width: 100%; border-collapse: collapse; }
  .renewal-block td { padding: 4px 0; font-size: 10.5pt; }
  .renewal-block td.num { text-align: right; }
  .renewal-tag { color: #c00; font-style: italic; font-size: 9pt; font-weight: 600; }
  .year-bar { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
  .year-bar .bar { flex: 1; height: 1px; background: #ddd; }
  .year-bar .label { font-weight: 700; font-size: 12pt; color: #c00; letter-spacing: 0.5px; text-transform: uppercase; }
  .includes { margin: 12px 0 18px; }
  .includes ul { margin: 8px 0 0 18px; padding: 0; }
  .includes li { margin: 3px 0; }
  .subsection { font-size: 11pt; font-weight: 700; margin: 16px 0 6px; color: #333; }
  .terms { margin-top: 24px; font-size: 10pt; }
  .terms p { margin: 6px 0; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 9pt; }
  .y1-note { color: #888; font-size: 9pt; font-style: italic; margin: 6px 0 0; }
  @media print { .noprint { display: none !important; } }
  .noprint { position: fixed; top: 12px; right: 12px; background: #c00; color: #fff; padding: 8px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; border: 0; }
</style>
</head>
<body>
  <button class="noprint" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="header">
    <img class="logo" src="${logoUrl}" alt="ManWinWin logo" />
    <div class="restricted">${esc(s.restricted)}</div>
  </div>
  <div class="cover hero">
    <h1>${esc(s.investmentProposal)}</h1>
    <div class="sub">${esc(s.professional)} — Plan ${proposal.plan} (SaaS)</div>
  </div>

  <div class="meta">
    <div><span class="k">Client:</span> <strong>${esc(proposal.client_name)}</strong></div>
    <div><span class="k">Date:</span> ${formatDate(proposal.proposal_date, lang)}</div>
    <div><span class="k">Project:</span> ${esc(proposal.project_name || "—")}</div>
    <div><span class="k">Validity:</span> ${proposal.validity_days} days</div>
    <div><span class="k">Country:</span> ${esc(proposal.country || "—")}</div>
    <div><span class="k">Version:</span> v${proposal.version}</div>
  </div>

  <div class="includes">
    <h2>${esc(s.includes)}</h2>
    <ul>${includes.included.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    ${includes.optional.length ? `<div class="subsection">${esc(s.optionalNotIncluded)}</div><ul>${includes.optional.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
  </div>

  <div class="year-bar"><span class="label">${esc(s.year1)}</span><span class="bar"></span></div>

  ${sectionBlock(
    s.software,
    software,
    totals.softwareGrossSubtotal,
    totals.softwareSubtotal,
    totals.softwareDiscountAmount,
    softwareUniformLabel,
    softwareHasDiscount,
  )}
  ${sectionBlock(
    s.services,
    services,
    totals.servicesGrossSubtotal,
    totals.servicesSubtotal,
    totals.servicesDiscountAmount,
    servicesUniformLabel,
    servicesHasDiscount,
  )}

  <div class="year-total"><span>${esc(s.totalOfYear)}</span><span>${formatEuro(totals.totalYear1, lang)}</span></div>

  ${recurring.length > 0 ? `
    <div class="year-bar"><span class="label">${esc(s.year2Onwards)}</span><span class="bar"></span></div>
    <div class="renewal-block">
      <table>
        <tbody>${recurring.map(renewalRow).join("")}</tbody>
      </table>
    </div>
    <div class="year-total"><span>${esc(s.totalPerYear)}</span><span>${formatEuro(totals.totalRecurring, lang)} ${esc(s.perYear)}</span></div>
    ${totals.recurringDiscountAmount === 0 && totals.discountAmount > 0 ? `<p class="y1-note">${esc(s.discountsYear1OnlyNote)}</p>` : ""}
  ` : ""}

  <div class="terms">
    <h2>${esc(s.billingHeader)}</h2>
    <p>${esc(proposal.payment_terms || "")}</p>
    ${proposal.notes ? `<h2>${esc(s.notes)}</h2><p>${esc(proposal.notes)}</p>` : ""}
    <h2>${esc(s.otherInfo)}</h2>
    <p>${esc(s.vatNote)}</p>
    <p>${esc(s.validityNote(proposal.validity_days))}</p>
  </div>

  <div class="footer">ManWinWin Software · ${esc(proposal.client_name)} · v${proposal.version}</div>

  <script>setTimeout(() => window.print(), 600);</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    const locale = lang === "PT" ? "pt-PT" : lang === "ES" ? "es-ES" : "en-GB";
    return d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

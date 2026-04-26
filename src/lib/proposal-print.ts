import type { Proposal, ProposalItem } from "@/types/proposal";
import { formatEuro, t } from "./proposal-i18n";
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

  const discountCellLabel = (rawItem: ProposalItem) => {
    const eff = getItemEffectiveDiscount(rawItem, softwarePct, servicesPct);
    if (!eff.amount) return "—";
    const prefix =
      eff.source === "section"
        ? `${esc(s.sectionDiscountLabel(eff.value))} `
        : eff.type === "percent"
        ? `${Number(eff.value || 0)}% `
        : "";
    return `${prefix}<span class="discount-amount">-${formatEuro(Number(eff.amount) || 0, lang)}</span>`;
  };

  const lineRow = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, softwarePct, servicesPct);
    const baseLabel = getCommercialItemLabel(it, proposal);
    const labelHasQty = /\(×\d+\)/.test(baseLabel);
    const qtySuffix = it.qty > 1 && !labelHasQty ? ` <span class="muted">×${it.qty}</span>` : "";
    return `
    <tr>
      <td>${esc(baseLabel)}${qtySuffix}</td>
      <td class="num">${formatEuro(Number(it.gross_total) || 0, lang)}</td>
      <td class="num discount">${discountCellLabel(rawItem)}</td>
      <td class="num strong">${formatEuro(Number(it.net_total) || 0, lang)}</td>
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

  const software = items.filter((i) => i.category === "software" || i.category === "addon");
  const services = items.filter((i) => i.category === "service" || (i.category === "custom" && !i.is_recurring));
  const recurring = items.filter((i) => i.is_recurring);

  const detailedTable = (title: string, list: ProposalItem[]) =>
    list.length === 0
      ? ""
      : `
      <h2>${esc(title)}</h2>
      <table class="lines">
        <thead>
          <tr><th>Item</th><th class="num">Gross</th><th class="num">Discount</th><th class="num">Net</th></tr>
        </thead>
        <tbody>${list.map(lineRow).join("")}</tbody>
      </table>`;

  const softwareUniformLabel = softwareDiscountSummary.mode === "uniform-section"
    ? s.softwareDiscountLabel(Number(softwareDiscountSummary.pct || 0))
    : s.softwareDiscountsTotalLabel;
  const servicesUniformLabel = servicesDiscountSummary.mode === "uniform-section"
    ? s.servicesDiscountLabel(Number(servicesDiscountSummary.pct || 0))
    : s.servicesDiscountsTotalLabel;

  const summarySection = (
    label: string,
    grossLabel: string,
    grossAmount: number,
    discountLabel: string,
    discountAmount: number,
    netLabel: string,
    netAmount: number,
  ) => `
    <div class="sum-block">
      <div class="sum-title">${esc(label)}</div>
      <div class="row"><span>${esc(grossLabel)}</span><span>${formatEuro(grossAmount, lang)}</span></div>
      ${discountAmount > 0 ? `<div class="row discount-row"><span>${esc(discountLabel)}</span><span>− ${formatEuro(discountAmount, lang)}</span></div>` : ""}
      <div class="row strong"><span>${esc(netLabel)}</span><span>${formatEuro(netAmount, lang)}</span></div>
    </div>`;

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
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.discount { color: #c00; font-size: 9.5pt; }
  td.discount .discount-amount { font-weight: 600; }
  td.strong { font-weight: 600; }
  .muted { color: #888; font-size: 9pt; font-weight: 400; }
  .summary { margin-top: 18px; }
  .sum-block { border: 1px solid #e2e2e2; border-radius: 4px; padding: 10px 14px; background: #fafafa; margin-bottom: 10px; }
  .sum-title { font-weight: 700; font-size: 11pt; color: #333; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
  .sum-block .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 10.5pt; }
  .sum-block .row.discount-row { color: #c00; }
  .sum-block .row.strong { font-weight: 700; border-top: 1px solid #eee; padding-top: 6px; margin-top: 4px; }
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
    <div class="sub">${esc(s.professional)} — Plan ${proposal.plan} (${esc(proposal.hosting)})</div>
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

  ${detailedTable(s.software, software)}
  ${detailedTable(s.services, services)}

  <div class="summary">
    ${software.length > 0 ? summarySection(
      s.software,
      `${s.software} gross subtotal`,
      totals.softwareGrossSubtotal,
      softwareUniformLabel,
      totals.softwareDiscountAmount,
      `${s.software} net subtotal`,
      totals.softwareSubtotal,
    ) : ""}
    ${services.length > 0 ? summarySection(
      s.services,
      `${s.services} gross subtotal`,
      totals.servicesGrossSubtotal,
      servicesUniformLabel,
      totals.servicesDiscountAmount,
      `${s.services} net subtotal`,
      totals.servicesSubtotal,
    ) : ""}
    <div class="year-total"><span>${esc(s.totalOfYear)}</span><span>${formatEuro(totals.totalYear1, lang)}</span></div>
  </div>

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

import type { Proposal, ProposalItem } from "@/types/proposal";
import { formatEuro, t } from "./proposal-i18n";
import { computeTotals, enrichProposalItem } from "./proposal-engine";
import { getCommercialIncludes, getCommercialItemLabel, getInvestmentSummary } from "./proposal-commercial";
import logoUrl from "@/assets/manwinwin-logo.png";

/**
 * Open a print-friendly window with the proposal rendered as HTML.
 * Users use the browser's "Save as PDF" to export.
 */
export function printProposal(proposal: Proposal, items: ProposalItem[]) {
  const lang = proposal.language as any;
  const s = t(lang);
  const totals = computeTotals(
    items,
    proposal.software_discount_pct || 0,
    proposal.services_discount_pct || 0,
  );
  const investment = getInvestmentSummary(proposal, items, totals);
  const includes = getCommercialIncludes(proposal.plan, proposal.language, proposal.include_requests_module, proposal.web_users);
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;

  const row = (rawItem: ProposalItem) => {
    const it = enrichProposalItem(rawItem, Number(proposal.software_discount_pct || 0), Number(proposal.services_discount_pct || 0));
    return `
    <tr>
      <td>${esc(getCommercialItemLabel(it, proposal))}</td>
      <td class="num">${it.qty}</td>
      <td class="num">${formatEuro(Number(it.gross_total) || 0, lang)}</td>
      <td class="num">${it.discount_amount ? `${it.discount_type === "percent" ? `${Number(it.discount_value || 0)}% ` : ""}(-${formatEuro(Number(it.discount_amount) || 0, lang)})` : "—"}</td>
      <td class="num">${formatEuro(Number(it.net_total) || 0, lang)}</td>
      <td>${esc(it.frequency)}</td>
    </tr>`;
  };

  const software = items.filter((i) => i.category === "software" || i.category === "addon");
  const services = items.filter((i) => i.category === "service" || (i.category === "custom" && !i.is_recurring));

  const section = (title: string, list: ProposalItem[]) =>
    list.length === 0
      ? ""
      : `
      <h2>${esc(title)}</h2>
      <table>
        <thead>
          <tr><th>Item</th><th class="num">Qty</th><th class="num">Gross</th><th class="num">Discount</th><th class="num">Net</th><th>Frequency</th></tr>
        </thead>
        <tbody>${list.map(row).join("")}</tbody>
      </table>`;

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
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10pt; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background: #f6f6f6; font-weight: 600; font-size: 9.5pt; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .muted { color: #888; font-size: 9pt; }
  .summary { margin-top: 18px; border: 1px solid #ddd; border-radius: 4px; padding: 12px 16px; background: #fafafa; }
  .summary .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11pt; }
  .summary .total { font-weight: 700; font-size: 13pt; color: #c00; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 6px; }
  .includes { margin: 12px 0 18px; }
  .includes ul { margin: 8px 0 0 18px; padding: 0; }
  .includes li { margin: 3px 0; }
  .subsection { font-size: 11pt; font-weight: 700; margin: 16px 0 6px; color: #333; }
  .terms { margin-top: 24px; font-size: 10pt; }
  .terms p { margin: 6px 0; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 9pt; }
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

  ${section(s.software, software)}
  ${section(s.services, services)}

  <div class="summary">
    <div class="subsection">${esc(s.year1)}</div>
    <div class="subsection">${esc(s.software)}</div>
    ${investment.softwareLines.map((line) => `<div class="row"><span>${esc(line.label)}</span><span>${esc(line.value)}${line.suffix ? ` ${esc(line.suffix)}` : ""}</span></div>`).join("")}
    <div class="row"><span>${esc(investment.softwareSubtotalLabel)}</span><span>${formatEuro(totals.softwareGrossSubtotal, lang)}</span></div>
    ${totals.softwareDiscountAmount > 0 ? `<div class="row"><span>${esc(s.softwareDiscountLabel(Number(proposal.software_discount_pct || 0)))}</span><span>− ${formatEuro(totals.softwareDiscountAmount, lang)}</span></div>` : ""}
    <div class="subsection">${esc(s.services)}</div>
    ${investment.serviceLines.map((line) => `<div class="row"><span>${esc(line.label)}</span><span>${esc(line.value)}${line.suffix ? ` ${esc(line.suffix)}` : ""}</span></div>`).join("")}
    <div class="row"><span>${esc(investment.servicesSubtotalLabel)}</span><span>${formatEuro(totals.servicesGrossSubtotal, lang)}</span></div>
    ${totals.servicesDiscountAmount > 0 ? `<div class="row"><span>${esc(s.servicesDiscountLabel(Number(proposal.services_discount_pct || 0)))}</span><span>− ${formatEuro(totals.servicesDiscountAmount, lang)}</span></div>` : ""}
    <div class="row total"><span>${esc(s.totalOfYear)}</span><span>${formatEuro(totals.totalYear1, lang)}</span></div>
    <div class="subsection">${esc(s.year2Onwards)}</div>
    ${investment.recurringLines.map((line) => `<div class="row"><span>${esc(line.label)}</span><span>${esc(line.value)}${line.suffix ? ` ${esc(line.suffix)}` : ""}</span></div>`).join("")}
    <div class="row total"><span>${esc(s.totalPerYear)}</span><span>${formatEuro(totals.totalRecurring, lang)} / ${esc(s.perYear)}</span></div>
  </div>

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

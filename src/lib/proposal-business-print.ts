/**
 * Business proposal print/PDF flow. Opens a print-styled window with the
 * same content as the DOCX, sourced from the validated Business engine.
 * The user uses the browser's "Save as PDF" to export.
 */
import logoUrl from "@/assets/manwinwin-logo.png";
import type { PricingRule, Proposal, ProposalLicenseModel, ProposalMode } from "@/types/proposal";
import {
  computeBusinessOptions,
  ONSITE_RATES,
  type BusinessConfig,
  type BusinessOptionTotals,
} from "./proposal-business-engine";
import { buildInvestmentSummaryRows } from "./proposal-business-summary";
import { tBusiness } from "./proposal-business-i18n";
import { formatEuro } from "./proposal-i18n";

const esc = (v: any) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function resolveModels(proposal: Proposal): ProposalLicenseModel[] {
  const mode = (proposal.proposal_mode as ProposalMode) || "compare_keepit_useit";
  if (mode === "keepit_only") return ["keepit"];
  if (mode === "useit_only") return ["useit"];
  if (mode === "compare_keepit_useit") return ["keepit", "useit"];
  if (proposal.license_model) return [proposal.license_model];
  return ["keepit", "useit"];
}

function fmtDate(iso: string, lang: any) {
  try {
    const locale = lang === "PT" ? "pt-PT" : lang === "ES" ? "es-ES" : "en-GB";
    return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export interface BusinessPrintOptions {
  proposal: Proposal;
  cfg: BusinessConfig;
  rules: PricingRule[];
}

export function printBusinessProposal({ proposal, cfg, rules }: BusinessPrintOptions) {
  const lang = proposal.language as any;
  const s = tBusiness(lang);
  const models = resolveModels(proposal);
  const out = computeBusinessOptions(rules, cfg, models);
  const showK = !!out.keepit;
  const showU = !!out.useit;
  const primary = (out.keepit || out.useit) as BusinessOptionTotals;
  const { rows } = buildInvestmentSummaryRows({
    keepit: out.keepit,
    useit: out.useit,
    cfg,
    lang,
  });

  const fmt = (v: number) => formatEuro(v, lang);

  const valueCell = (
    val: number | null | undefined,
    asIncluded: boolean | undefined,
    isDiscount: boolean | undefined,
    isTotal: boolean | undefined,
  ) => {
    if (val === null || val === undefined) return `<td class="num"></td>`;
    if (asIncluded)
      return `<td class="num included">${esc(s.satIncludedShort)}</td>`;
    const cls = ["num"];
    if (isTotal) cls.push("strong");
    if (isDiscount) cls.push("disc");
    return `<td class="${cls.join(" ")}">${esc(fmt(val))}</td>`;
  };

  const tableRows = rows
    .map((r) => {
      if (r.isHeader) {
        const colspan = 1 + (showK ? 1 : 0) + (showU ? 1 : 0);
        return `<tr class="header-row"><td colspan="${colspan}"><strong>${esc(r.label)}</strong></td></tr>`;
      }
      const indent = r.indent ? r.indent * 14 : 0;
      const labelClass = [r.isTotal ? "strong" : "", r.isDiscount ? "disc" : ""].join(" ").trim();
      const labelCell = `<td style="padding-left:${8 + indent}px" class="${labelClass} ${r.isTotal ? "total-label" : ""}">${esc(r.label)}</td>`;
      const k = showK ? valueCell(r.keepitY1, r.asIncluded?.keepit, r.isDiscount, r.isTotal) : "";
      const u = showU ? valueCell(r.useitY1, r.asIncluded?.useit, r.isDiscount, r.isTotal) : "";
      return `<tr class="${r.isTotal ? "total-row" : ""}">${labelCell}${k}${u}</tr>`;
    })
    .join("");

  const swDescItems: string[] = [];
  swDescItems.push(s.defaultBackoffice);
  swDescItems.push(s.defaultWebMobile);
  if (cfg.additionalBackoffice > 0)
    swDescItems.push(s.additionalBackofficeAccesses(cfg.additionalBackoffice));
  if (cfg.additionalWebUsers > 0)
    swDescItems.push(s.additionalWebMobileAccesses(cfg.additionalWebUsers));
  const modules: string[] = [s.maintenanceModule];
  if (cfg.includeRequests) modules.push(s.requestsModule);
  if (cfg.includeStock) modules.push(s.stockModule);
  if (cfg.includePurchase) modules.push(s.purchaseModule);
  const plugins: string[] = [];
  if (cfg.pluginImport) plugins.push(s.pluginImport);
  if (cfg.pluginWorkflow) plugins.push(s.pluginWorkflow);
  if (cfg.pluginAdvancedReports) plugins.push(s.pluginAdvancedReports);
  if (cfg.pluginSLA) plugins.push(s.pluginSLA);
  const optional: string[] = [];
  if (!cfg.includeRequests) optional.push(s.requestsModule);
  if (!cfg.includeStock) optional.push(s.stockModule);
  if (!cfg.includePurchase) optional.push(s.purchaseModule);
  if (!cfg.pluginImport) optional.push(s.pluginImport);
  if (!cfg.pluginWorkflow) optional.push(s.pluginWorkflow);
  if (!cfg.pluginAdvancedReports) optional.push(s.pluginAdvancedReports);
  if (!cfg.pluginSLA) optional.push(s.pluginSLA);
  if (!cfg.api) optional.push(s.apiManwinwin);

  const optionsHtml = (() => {
    const parts: string[] = [];
    if (out.keepit) {
      const swNet = out.keepit.software
        .filter((l) => l.category !== "web_user")
        .reduce((a, l) => a + l.netAmount, 0);
      parts.push(`<h3>${esc(s.optionAKeepIT)}</h3><ul>`);
      parts.push(`<li>${esc(s.keepItLicenseAmount)}: <strong>${esc(fmt(swNet))}</strong></li>`);
      parts.push(`<li>${esc(s.satAnnual)}: <strong>${esc(fmt(out.keepit.sat?.netAmount || 0))}</strong></li>`);
      if (cfg.additionalWebUsers > 0) {
        const w = out.keepit.software.find((l) => l.category === "web_user");
        parts.push(`<li>${esc(s.webMobileAdditionalAnnual)}: ${esc(fmt(w?.netAmount || 0))}</li>`);
      }
      if (cfg.api && out.keepit.api)
        parts.push(`<li>${esc(s.apiAnnual)}: ${esc(fmt(out.keepit.api.netAmount))}</li>`);
      if (cfg.deployment === "saas") {
        const ho = out.keepit.hosting.reduce((a, l) => a + l.netAmount, 0);
        parts.push(`<li>${esc(s.saasHostingAnnual)}: ${esc(fmt(ho))}</li>`);
      }
      parts.push(`</ul>`);
    }
    if (out.useit) {
      const annual = out.useit.software
        .filter((l) => l.category !== "web_user")
        .reduce((a, l) => a + l.netAmount, 0);
      parts.push(`<h3>${esc(s.optionBUseIT)}</h3><ul>`);
      parts.push(`<li>${esc(s.useItAnnualLicenseAmount)}: <strong>${esc(fmt(annual))}</strong></li>`);
      parts.push(`<li>${esc(s.satIncluded)}</li>`);
      if (cfg.additionalWebUsers > 0) {
        const w = out.useit.software.find((l) => l.category === "web_user");
        parts.push(`<li>${esc(s.webMobileAdditionalAnnual)}: ${esc(fmt(w?.netAmount || 0))}</li>`);
      }
      if (cfg.api && out.useit.api)
        parts.push(`<li>${esc(s.apiAnnual)}: ${esc(fmt(out.useit.api.netAmount))}</li>`);
      if (cfg.deployment === "saas") {
        const ho = out.useit.hosting.reduce((a, l) => a + l.netAmount, 0);
        parts.push(`<li>${esc(s.saasHostingAnnual)}: ${esc(fmt(ho))}</li>`);
      }
      parts.push(`</ul>`);
    }
    return parts.join("");
  })();

  const servicesHtml = (() => {
    const implType = cfg.implementation.type;
    const title =
      implType === "RCI Business" ? s.rciTitle : implType === "Onsite" ? s.onsiteTitle : s.customServicesTitle;
    const grossSvc = primary.services.reduce((a, l) => a + l.amount, 0);
    const discSvc = primary.services.reduce((a, l) => a + l.discountAmount, 0);
    const netSvc = primary.services.reduce((a, l) => a + l.netAmount, 0);
    const hasDisc = discSvc > 0;
    const parts: string[] = [`<h3>${esc(title)}</h3><ul>`];
    if (implType === "Onsite") {
      const region = cfg.implementation.onsiteRegion || "Portugal";
      const rates = ONSITE_RATES[region];
      const cd = cfg.implementation.onsiteClientDays || 0;
      const bd = cfg.implementation.onsiteBackofficeDays || 0;
      parts.push(`<li>${esc(s.region)}: ${esc(region)}</li>`);
      if (cd > 0)
        parts.push(`<li>${esc(s.clientDays)}: ${cd} × ${esc(fmt(rates.client))} = <strong>${esc(fmt(cd * rates.client))}</strong></li>`);
      if (bd > 0)
        parts.push(`<li>${esc(s.backofficeDays)}: ${bd} × ${esc(fmt(rates.backoffice))} = <strong>${esc(fmt(bd * rates.backoffice))}</strong></li>`);
      if (hasDisc) {
        parts.push(`<li>${esc(s.servicesGrossTotal)}: ${esc(fmt(grossSvc))}</li>`);
        parts.push(`<li class="disc">${esc(s.servicesDiscount)}: -${esc(fmt(discSvc))}</li>`);
      }
      parts.push(`<li><strong>${esc(s.totalOnsite)}: ${esc(fmt(netSvc))}</strong></li>`);
      parts.push(`</ul><p class="muted small">${esc(s.travelNote)}</p>`);
      return parts.join("");
    }
    primary.services.forEach((l) => {
      parts.push(`<li>${esc(l.label)} — ${esc(fmt(l.amount))}</li>`);
    });
    if (primary.services.length > 0) {
      if (hasDisc) {
        parts.push(`<li>${esc(s.servicesGrossTotal)}: ${esc(fmt(grossSvc))}</li>`);
        parts.push(`<li class="disc">${esc(s.servicesDiscount)}: -${esc(fmt(discSvc))}</li>`);
      }
      parts.push(`<li><strong>${esc(s.servicesNetTotal)}: ${esc(fmt(netSvc))}</strong></li>`);
    }
    parts.push(`</ul>`);
    return parts.join("");
  })();

  const html = `<!doctype html>
<html lang="${esc(lang).toLowerCase()}">
<head><meta charset="utf-8" />
<title>${esc(s.investmentProposal)} — ${esc(proposal.client_name)} v${proposal.version}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 11pt; line-height: 1.45; }
  .cover { min-height: 240mm; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:14px; page-break-after: always; }
  .cover img { max-width: 240px; height: auto; }
  .cover h1 { font-size: 30pt; margin: 14px 0 4px; color:#1a1a1a; }
  .cover .sub { color:#c00; font-weight: 700; font-size: 14pt; }
  .cover .client { font-size: 18pt; font-weight: 700; margin-top: 18px; }
  .cover .meta { color: #555; font-size: 11pt; }
  .cover .restricted { color:#c00; font-weight: 700; font-size: 10pt; letter-spacing: 1px; text-transform: uppercase; margin-top: 18px; }
  .header { display:flex; justify-content:space-between; gap:12px; padding-bottom:6px; border-bottom: 2px solid #c00; margin-bottom: 14px; font-size: 9pt; color:#555; }
  .header .restricted { color:#c00; font-weight: 700; }
  h2 { font-size: 13pt; color: #c00; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 10px; }
  h3 { font-size: 11.5pt; color: #1a1a1a; margin: 16px 0 6px; }
  ul { margin: 6px 0 6px 18px; padding: 0; }
  li { margin: 3px 0; }
  table.summary { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 10pt; }
  table.summary th, table.summary td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.summary thead th { background:#c00; color:#fff; text-align:left; font-weight: 700; }
  table.summary thead th.num { text-align:right; }
  table.summary td.num, table.summary th.num { text-align:right; white-space: nowrap; }
  table.summary tr.header-row td { background:#fafafa; padding: 8px; }
  table.summary tr.total-row td { background:#f5f5f5; font-weight: 700; border-top: 1px solid #ccc; }
  table.summary td.disc, table.summary tr td.disc { color:#c00; }
  table.summary td.included { font-style: italic; color:#666; }
  .muted { color: #666; }
  .small { font-size: 9.5pt; }
  .footer { margin-top: 24px; text-align: center; color:#888; font-size: 9pt; }
  @media print { .noprint { display: none !important; } }
  .noprint { position: fixed; top: 12px; right: 12px; background:#c00; color:#fff; padding: 8px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; border: 0; }
</style>
</head>
<body>
<button class="noprint" onclick="window.print()">🖨️ Print / Save as PDF</button>

<div class="cover">
  <img src="${logoUrl}" alt="ManWinWin" />
  <h1>${esc(s.investmentProposal)}</h1>
  <div class="sub">${esc(s.businessSubtitle)}</div>
  <div class="client">${esc(proposal.client_name)}</div>
  <div class="meta">${esc(fmtDate(proposal.proposal_date, lang))}</div>
  <div class="restricted">${esc(s.restricted)}</div>
</div>

<div class="header">
  <div>${esc(s.client)}: <strong>${esc(proposal.client_name)}</strong> · ${esc(s.project)}: ${esc(proposal.project_name || "—")} · ${esc(s.date)}: ${esc(fmtDate(proposal.proposal_date, lang))}</div>
  <div class="restricted">${esc(s.restricted)}</div>
</div>

<h2>${esc(s.investmentProposal)}</h2>
<p><strong>${esc(s.forImplementation(proposal.client_name))}</strong></p>
<p style="color:#c00;font-weight:700">${esc(s.businessSubtitle)}</p>

<h2>${esc(s.softwareDescription)}</h2>
<ul>${swDescItems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p><strong>${esc(s.modulesIncludedHeading)}</strong></p>
<ul>${modules.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${plugins.length ? `<p><strong>${esc(s.pluginsIncludedHeading)}</strong></p><ul>${plugins.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${cfg.api ? `<ul><li>${esc(s.apiManwinwin)}</li></ul>` : ""}
${optional.length ? `<p class="muted small"><strong>${esc(s.optionalNotIncluded)}</strong></p><ul class="muted small">${optional.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}

<h2>${esc(s.optionsTitle)}</h2>
${optionsHtml}

<h2>${esc(s.servicesTitle)}</h2>
${servicesHtml}

<h2>${esc(s.investmentSummaryTitle)}</h2>
<table class="summary">
  <thead>
    <tr>
      <th>${esc(s.itemColumn)}</th>
      ${showK ? `<th class="num">${esc(s.optionAColumn)}</th>` : ""}
      ${showU ? `<th class="num">${esc(s.optionBColumn)}</th>` : ""}
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>

<h2>${esc(s.billingHeader)}</h2>
<p><strong>${esc(s.standardTerms)}</strong></p>
<ul><li>${esc(s.paymentLine1)}</li><li>${esc(s.paymentLine2)}</li></ul>
<p class="muted small">${esc(s.footnote1)}</p>
<p class="muted small">${esc(s.footnote2)}</p>

<h2>${esc(s.otherInfo)}</h2>
<ul>
  <li>${esc(s.vatNote)}</li>
  <li>${esc(s.validityNote(proposal.validity_days))}</li>
  <li>${esc(s.satEscalationNote)}</li>
</ul>

<h2>${esc(cfg.deployment === "saas" ? s.featuresSaasTitle : s.featuresClientServerTitle)}</h2>
<ul>${(cfg.deployment === "saas" ? s.saasFeatures : s.clientServerFeatures).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

<h2>${esc(s.satTitle)}</h2>
<ul>${s.satList.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

${cfg.api ? `<h2>${esc(s.apiTitle)}</h2><ul>${s.apiList.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}

<div class="footer">${esc(s.footerLine)} · ${esc(proposal.client_name)} · v${proposal.version}</div>
<script>setTimeout(() => window.print(), 600);</script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

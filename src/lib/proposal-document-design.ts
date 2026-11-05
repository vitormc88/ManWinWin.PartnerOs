import type { Proposal } from "@/types/proposal";
import { t } from "./proposal-i18n";
import { proposalIdentity, proposalRevisionLabel } from "./commercial-proposal-journey";

/** Presentation only. The approved engines/saved snapshots remain the price authority. */
export const DOCUMENT_DESIGN = {
  font: "Ubuntu", navy: "213C4B", ink: "293B45", muted: "64747D",
  red: "F52243", border: "E2E7EA", surface: "F5F7F8", green: "267365",
  logo: "/customer-export/manwinwin.png", iso: "/customer-export/iso9001.png",
} as const;
export const documentEscape = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export function documentReference(p: Partial<Proposal>) {
  return p.id && p.version ? proposalIdentity(p)
    : p.language === "PT" ? "Pré-visualização não guardada"
    : p.language === "ES" ? "Vista previa sin guardar" : "Unsaved preview";
}
export function documentDate(value: string, language = "EN") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat(language === "PT" ? "pt-PT" : language === "ES" ? "es-ES" : "en-GB", {day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
}
export const PROPOSAL_DESIGN_CSS = `
@font-face{font-family:Ubuntu;src:url('/customer-export/Ubuntu-R.ttf')}@font-face{font-family:Ubuntu;src:url('/customer-export/Ubuntu-B.ttf');font-weight:700}
@page{size:A4;margin:31mm 14mm 27mm;@bottom-center{content:counter(page) ' / ' counter(pages);font-family:Ubuntu,Arial,sans-serif;font-size:7pt;color:#64747d}}
*{box-sizing:border-box}body{margin:0;font-family:Ubuntu,Arial,sans-serif;font-size:9pt;line-height:1.48;color:#293b45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand-header{position:fixed;top:-22mm;left:0;right:0;height:17mm;border-bottom:1px solid #e2e7ea;display:flex;justify-content:space-between;align-items:flex-start;gap:15px;padding-bottom:12px}
.brand-header img{width:140px;height:43px;object-fit:contain;object-position:left top}.brand-header .identity{font-size:7pt;line-height:1.65;text-align:right;max-width:62%;overflow-wrap:anywhere;color:#64747d}.brand-header strong{display:block;color:#213c4b;font-weight:700;letter-spacing:.3px}
.brand-footer{position:fixed;bottom:-19mm;left:0;right:0;height:16mm;border-top:1px solid #e2e7ea;padding-top:7px;display:flex;justify-content:space-between;align-items:center;gap:15px}.brand-footer .contact{font-size:6pt;line-height:1.55;color:#64747d}.brand-footer img{width:78px;height:36px;object-fit:contain}.brand-footer .reference{font-size:6pt;color:#64747d;text-align:center;max-width:50%;overflow-wrap:anywhere}
h1{font-size:23pt;font-weight:700;line-height:1.15;letter-spacing:-.5px;color:#213c4b;margin:0 0 12px}h2{font-size:11pt;font-weight:700;color:#213c4b;margin:20px 0 8px;padding-left:9px;border-left:2px solid #f52243;break-after:avoid-page;page-break-after:avoid}h3,.subsection{font-size:9.5pt;font-weight:700;color:#293b45;margin:13px 0 6px;break-after:avoid-page}h2+*,h3+*{break-before:avoid-page}p{margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}ul{margin:5px 0 12px;padding-left:16px}li{padding-left:2px;margin:3px 0;orphans:2;widows:2}
.cover{min-height:228mm;break-after:page;page-break-after:always;padding:53mm 0 15mm;display:flex;flex-direction:column;justify-content:flex-start}.cover .cover-rule{width:38px;height:3px;background:#f52243;margin-bottom:22px}.cover h1{font-size:38pt;line-height:1.08;max-width:90%;margin:0 0 20px}.cover .product,.cover .sub{font-size:15pt;color:#64747d;margin-bottom:45px}.cover .client{font-size:21pt;font-weight:700;line-height:1.25;margin:0 0 13px;color:#213c4b;overflow-wrap:anywhere}.cover .cover-meta,.cover .meta{font-size:9pt;color:#64747d;line-height:1.6;margin:3px 0;max-width:90%;overflow-wrap:anywhere}.cover .restricted{font-size:7pt;letter-spacing:1px;color:#64747d;margin-top:25px}
.document-intro{margin-bottom:18px}.document-intro .eyebrow{font-size:7.5pt;letter-spacing:1px;text-transform:uppercase;color:#64747d;margin-bottom:7px}.document-intro .customer{font-size:12pt;color:#293b45;margin-bottom:8px}.document-meta{background:#f5f7f8;padding:12px 14px;border-radius:4px;font-size:8pt;color:#64747d;display:flex;gap:18px;flex-wrap:wrap;margin:0 0 16px}.document-meta strong{color:#293b45}
.document-meta>span{flex:1;min-width:0}.scope-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;break-inside:avoid}.scope-grid h2{font-size:10pt}.scope-grid li{font-size:8.5pt}.renewal-metrics{font-size:9pt}.renewal-metrics strong{display:block;margin-top:5px}
table{width:100%;border-collapse:collapse;font-size:8.5pt;line-height:1.4;margin:8px 0 13px;table-layout:auto}thead{display: table-header-group}th{background:#f5f7f8;color:#64747d;font-size:7.5pt;font-weight:400;text-align:left;padding:8px 7px;border-bottom:1px solid #c8d2d8}td{padding:9px 7px;border-bottom:1px solid #e2e7ea;vertical-align:top}tr{break-inside: avoid;page-break-inside:avoid}td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}td:first-child{overflow-wrap:anywhere}td.disc,.discount,.discount-row td{color:#267365}td.included,.muted,.small,.freq{color:#64747d}.small,.freq,.y1-note,.footnote{font-size:8pt}.strong{font-weight:700}.header-row td{background:#f5f7f8;font-weight:700;color:#213c4b}.total-row td{background:#213c4b;color:#fff;font-weight:700;padding:8px 8px}.total-row td.disc{color:#fff}.subtotal-row td{background:#f5f7f8;font-size:8.5pt}.subtotal-row{break-before:avoid-page}.summary-section{break-inside:auto}.summary-section h2{margin-top:8px}.year-bar{margin:15px 0 6px;font-size:10pt;font-weight:700;color:#213c4b}.year-total,.investment-total{background:#213c4b;color:#fff;border-radius:5px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 12px;margin:8px 0;font-size:10pt;font-weight:700;break-inside:avoid;break-before:avoid-page}.year-total span:last-child,.investment-total .value{font-size:14pt;white-space:nowrap}.year-total small,.investment-total small{font-size:7.5pt;color:#d1dde3;font-weight:400;display:block;margin-top:4px}
.renewal-section{break-inside:auto;margin-bottom:20px}.renewal-section .year-total{background:#f5f7f8;color:#213c4b;font-size:10pt;padding:8px 12px}.renewal-section .year-total span:last-child{font-size:12pt}.terms{white-space:pre-wrap;overflow-wrap:anywhere}div.terms{white-space:normal}.keep-together{break-inside:auto}.renewal-tag{color:#267365;font-size:8pt}.includes{margin-top:16px}.notes{white-space:pre-wrap}.noprint{font-family:inherit;border:0;background:#213c4b;color:white;padding:10px 16px;border-radius:5px;margin:0 0 20px}
@media screen{body{max-width:760px;margin:auto;padding:100px 44px 110px;background:#fff}.brand-header{position:absolute;top:24px;left:44px;right:44px}.brand-footer{position:relative;bottom:auto;left:auto;right:auto;margin-top:30px;height:auto;min-height:60px}.cover{min-height:850px}.brand-footer .reference{align-self:flex-end}.noprint{display:block}}
@media print{.noprint{display:none!important}.brand-header,.brand-footer{z-index:2}a{color:inherit;text-decoration:none}}
`;

export function documentChrome(p: Partial<Proposal>, title: string) {
  const ref = documentEscape(documentReference(p));
  const state = t(p.language ?? "EN").restricted;
  return {
    header: `<header class="brand-header"><img src="${DOCUMENT_DESIGN.logo}" alt="ManWinWin Software"><div class="identity"><strong>${documentEscape(title)}</strong>${ref}${state ? `<br>${state}` : ""}</div></header>`,
    footer: `<footer class="brand-footer"><div class="contact">ManWinWin Software<br>(+351) 214 309 100<br>support@manwinwin.com<br>www.manwinwin.com</div><span class="reference">${ref}</span><img src="${DOCUMENT_DESIGN.iso}" alt="ISO 9001 Bureau Veritas Certification"></footer>`,
  };
}

/** Restyle/reorder known generated markup, without reinterpreting any amounts or terms. */
export function brandOpportunityHtml(html: string, p: Proposal, product: string) {
  const esc = documentEscape;
  const headerIndex = html.indexOf('<div class="header">');
  const coverIndex = html.indexOf('<div class="cover">');
  const oldCover = html.slice(coverIndex, headerIndex);
  const oldHeader = html.slice(headerIndex).match(/^<div class="header">[\s\S]*?\n\s*<\/div>/)?.[0];
  if (!oldHeader || coverIndex < 0) throw new Error("Missing proposal document structure.");
  const oldHeaderEnd = headerIndex + oldHeader.length;
  const footerIndex = html.indexOf('<div class="footer">', oldHeaderEnd);
  let body = html.slice(oldHeaderEnd, footerIndex);
  // Preserve the commercial narrative: configuration and services precede investment.
  // Professional's Includes block also stays beside the initial software scope.
  const title = oldCover.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || "Investment Proposal";
  const restricted = oldCover.match(/<div class="(?:cover-restricted|restricted)">([\s\S]*?)<\/div>/)?.[1] || "";
  const lang = p.language === "PT" ? "PT" : p.language === "ES" ? "ES" : "EN";
  const date = documentDate(p.proposal_date, lang);
  const validLabel = lang === "PT" ? "Validade" : lang === "ES" ? "Validez" : "Validity";
  const days = lang === "EN" ? "days" : "dias";
  const coverReference = p.id && p.version ? proposalRevisionLabel(p) : documentReference(p);
  const cover = `<section class="cover"><div class="cover-rule"></div><h1>${title}</h1><div class="product">${esc(product)}</div><div class="client">${esc(p.client_name)}</div><div class="cover-meta">${esc(p.project_name || "")}${p.country ? ` · ${esc(p.country)}` : ""}</div><div class="cover-meta">${esc(date)}</div><div class="cover-meta">${validLabel}: ${p.validity_days} ${days} · ${esc(coverReference)}</div>${restricted ? `<div class="restricted">${restricted}</div>` : ""}</section>`;
  const chrome = documentChrome(p, title.replace(/<[^>]*>/g,""));
  const intro = `<div class="document-intro"><h1>${esc(product)}</h1><p class="customer">${esc(p.client_name)}</p></div><div class="document-meta"><span>${esc(date)}</span><span>${validLabel}: <strong>${p.validity_days} ${days}</strong></span><span>${esc(documentReference(p))}</span></div>`;
  return `<!doctype html><html lang="${lang.toLowerCase()}"><head><meta charset="utf-8"><title>${title} — ${esc(p.client_name)} — ${esc(documentReference(p))}</title><style>${PROPOSAL_DESIGN_CSS}</style></head><body><button class="noprint" onclick="window.print()">Print / Save as PDF</button>${chrome.header}${cover}<main>${intro}${body}</main>${chrome.footer}<script>Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))]).then(()=>setTimeout(()=>window.print(),150));</script></body></html>`;
}

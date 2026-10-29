import type { Proposal } from "@/types/proposal";
import { readAdditionDraft, type AdditionDraft } from "./commercial-additions";
import logoUrl from "@/assets/manwinwin-logo.png";

export const additionMoney = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);
export function additionDocumentContent(proposal: Partial<Proposal>, draft: AdditionDraft) {
  if (draft.quote.blockers.length) throw new Error("Resolve all commercial addition blockers before exporting.");
  return {
    title: `Additional license components — ${proposal.client_name || draft.baseline.clientName}`,
    details: [
      `${draft.baseline.family} ${draft.baseline.model || `Plan ${draft.baseline.plan}`} · ${draft.baseline.deployment} · v${proposal.version ?? "draft"}`,
      `Offer basis: ${draft.selection.offerBasis === "partner" ? "Navaltik to partner (confirmed revenue shares)" : "Customer catalogue prices"}. All values exclude applicable taxes.`,
      `Effective date: ${draft.selection.effectiveDate} · existing renewal: ${draft.selection.renewalDate}`,
      `Billable months: ${draft.quote.months} · policy: ${draft.selection.monthPolicy}${draft.selection.monthReview ? ` (${draft.selection.monthReview})` : ""}`,
      `BackOffice: ${draft.baseline.backoffice} → ${draft.quote.afterBackoffice} · WEB/Mobility: ${draft.baseline.web} → ${draft.quote.afterWeb}`,
    ],
    rows: draft.quote.lines.map(l => [l.label, String(l.quantity), additionMoney(l.oneTime), additionMoney(l.annual), additionMoney(l.dueNow)]),
    summary: [
      `Payable now for these additions: ${additionMoney(draft.quote.dueNow)}`,
      `Annual increase from the existing renewal: ${additionMoney(draft.quote.annualIncrease)}`,
      draft.quote.renewalAnnual == null ? "New annual renewal total: not confirmed (existing contract requires review)." : `New annual renewal total on the reviewed baseline: ${additionMoney(draft.quote.renewalAnnual)}`,
      draft.quote.supportNote,
      draft.selection.implementationReview === "separate" ? "Implementation/training services are excluded and must be quoted separately." : "No implementation services requested or charged in this proposal.",
      "This proposal covers additions only, not a replacement license. It does not extend the existing renewal date. Activation and contract updates require separate approval.",
    ],
    terms: proposal.payment_terms || "Payment terms require agreement before issue.",
    notes: proposal.notes || "",
  };
}
const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function buildAdditionPrintHtml(proposal: Partial<Proposal>, draft = readAdditionDraft(proposal as Proposal)) {
  if (!draft) throw new Error("Missing commercial addition snapshot.");
  const c = additionDocumentContent(proposal, draft);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(c.title)}</title><style>
  @page{size:A4;margin:18mm}body{font:11pt Arial,sans-serif;color:#2c343c;line-height:1.45}header{border-bottom:2px solid #e01f2c;padding-bottom:12px}img{width:175px}h1{font-size:19pt}h2{font-size:13pt;margin-top:22px}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{padding:9px 7px;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#f1f4f6}thead{display:table-header-group}tr{break-inside:avoid}.summary{border-left:3px solid #e01f2c;padding-left:14px;break-inside:avoid}.terms{white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:8pt;color:#627180;margin-top:28px;border-top:1px solid #ddd;padding-top:7px}</style></head><body>
  <header><img src="${logoUrl}" alt="ManWinWin"><h1>${escape(c.title)}</h1></header>${c.details.map(x => `<p>${escape(x)}</p>`).join("")}
  <h2>Incremental investment</h2><table><thead><tr>${["Component", "Qty", "One-time", "Annual increase", "Payable now"].map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${c.rows.map(row => `<tr>${row.map(x => `<td>${escape(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <section class="summary">${c.summary.map(x => `<p>${escape(x)}</p>`).join("")}</section><h2>Payment terms</h2><p class="terms">${escape(c.terms)}</p>${c.notes ? `<h2>Notes / special conditions</h2><p class="terms">${escape(c.notes)}</p>` : ""}<footer>ManWinWin Software · support@manwinwin.com · www.manwinwin.com</footer><script>window.onload=()=>window.print();</script></body></html>`;
}
export function printAddition(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const html = buildAdditionPrintHtml(proposal, draft);
  const win = window.open("", "_blank", "width=1000,height=1100");
  if (!win) throw new Error("Allow pop-ups for PartnerOS and try again.");
  win.document.write(html); win.document.close();
}

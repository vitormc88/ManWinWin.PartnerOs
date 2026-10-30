import type { Proposal } from "@/types/proposal";
import { readAdditionDraft, type AdditionDraft } from "./commercial-additions";
import logoUrl from "@/assets/manwinwin-logo.png";
import { additionValidUntil } from "./commercial-addition-terms";

export const additionMoney = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);
export function additionDocumentContent(proposal: Partial<Proposal>, draft: AdditionDraft) {
  if (draft.quote.blockers.length) throw new Error("Resolve all commercial addition blockers before exporting.");
  const commercial = draft.selection.commercial, pt = commercial?.language === "PT";
  const money = (n: number) => new Intl.NumberFormat(pt ? "pt-PT" : "en-GB", { style: "currency", currency: "EUR" }).format(n);
  const componentLabel = (label: string) => !pt ? label : Object.entries({ "Additional BackOffice SaaS hosting":"Alojamento SaaS do BackOffice adicional", "Additional BackOffice":"Acesso BackOffice adicional", "Additional WEB / Mobility":"Acesso WEB / Mobilidade adicional", "Maintenance Requests":"Pedidos à Manutenção", "Stock Management":"Gestão de Stock", "Purchase Management":"Gestão de Encomendas", "Purchase Orders":"Gestão de Encomendas", "Import Tool":"Importador", "Advanced Reports":"Relatórios avançados", "S&AT included":"S&AT incluído", "incremental S&AT":"S&AT incremental" }).reduce((text,[from,to])=>text.replace(from,to),label);
  const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join(pt ? "/" : "-") : s;
  return {
    pt,
    headings: { investment: pt ? "Resumo do investimento" : "Incremental investment", terms: pt ? "Condições de faturação, pagamento e ativação" : "Payment terms", notes: pt ? "Notas / condições especiais" : "Notes / special conditions" },
    headers: pt ? ["Componente", "Qtd.", "Aquisição única", "Incremento anual", "Valor inicial"] : ["Component", "Qty", "One-time", "Annual increase", "Payable now"],
    title: `${pt ? "Ampliação da configuração ManWinWin" : "Additional license components"} — ${proposal.client_name || draft.baseline.clientName}`,
    details: [
      `${draft.baseline.family} ${draft.baseline.model === "keepit" ? "KeepIT" : draft.baseline.model === "useit" ? "UseIT" : `${pt ? "Plano" : "Plan"} ${draft.baseline.plan}`} · ${draft.baseline.deployment === "saas" ? "SaaS" : "On-premise"} · v${proposal.version ?? "draft"}`,
      ...(pt ? [
        `Valores ${draft.selection.offerBasis === "partner" ? "Navaltik ao parceiro, com repartição confirmada" : "ao cliente final"}. Acresce IVA à taxa legal em vigor.`,
        `Início: ${date(draft.selection.effectiveDate)} · renovação do contrato: ${date(draft.selection.renewalDate)}`,
        `Período cobrado: ${draft.quote.months} meses${draft.selection.monthPolicy === "agreed" ? " acordados" : draft.selection.monthPolicy === "complete" ? " completos" : " iniciados"}.`,
        `BackOffice: ${draft.baseline.backoffice} → ${draft.quote.afterBackoffice} · WEB/Mobilidade: ${draft.baseline.web} → ${draft.quote.afterWeb}`,
      ] : [
      `Offer basis: ${draft.selection.offerBasis === "partner" ? "Navaltik to partner (confirmed revenue shares)" : "Customer catalogue prices"}. All values exclude applicable taxes.`,
      `Effective date: ${draft.selection.effectiveDate} · existing renewal: ${draft.selection.renewalDate}`,
      `Billable months: ${draft.quote.months} · policy: ${draft.selection.monthPolicy}${draft.selection.monthReview ? ` (${draft.selection.monthReview})` : ""}`,
      `BackOffice: ${draft.baseline.backoffice} → ${draft.quote.afterBackoffice} · WEB/Mobility: ${draft.baseline.web} → ${draft.quote.afterWeb}`,
      ]),
      ...(commercial ? [pt ? `Proposta de ${date(commercial.proposalDate)} · válida por ${commercial.validityDays} dias, até ${date(additionValidUntil(commercial))}.` : `Proposal date: ${date(commercial.proposalDate)} · valid for ${commercial.validityDays} days, until ${date(additionValidUntil(commercial))}.`] : []),
    ],
    rows: draft.quote.lines.map(l => {
      const reference = l.referenceUnitPrice == null ? "" : `\n${pt ? "Tarifa de referência" : "Reference tariff"}: ${money(l.referenceUnitPrice)}/${l.unitPeriod === "month" ? pt ? "mês" : "month" : l.unitPeriod === "once" ? pt ? "aquisição" : "purchase" : pt ? "ano" : "year"}${l.unitPrice !== l.referenceUnitPrice ? ` → ${money(l.unitPrice!)}` : ""}`;
      const discounts = commercial ? `\n${pt ? "Desconto inicial" : "Initial discount"}: ${l.initialDiscountPct || 0}% · ${pt ? "renovação" : "renewal"}: ${l.renewalDiscountPct || 0}%${l.initialDiscountPct === 100 ? pt ? " · OFERTA inicial" : " · initial OFFER" : ""}${l.renewalDiscountPct === 100 ? pt ? " · OFERTA na renovação" : " · renewal OFFER" : ""}` : "";
      return [componentLabel(l.label) + reference + discounts, String(l.quantity), money(l.oneTime), money(l.annual), money(l.dueNow)];
    }),
    summary: [
      ...(pt ? [
        `Valor inicial desta ampliação: ${money(draft.quote.dueNow)}`,
        `Incremento anual contratado / impacto na renovação: + ${money(draft.quote.annualIncrease)}`,
        draft.quote.renewalAnnual == null ? "Novo total anual do contrato: por confirmar, sujeito à reconciliação do contrato atual." : `Novo total anual do contrato: ${money(draft.quote.renewalAnnual)}`,
        draft.baseline.model === "keepit" ? "Apenas o S&AT incremental é proporcional ao período restante. Não se volta a cobrar o S&AT existente." : "S&AT incluído no licenciamento UseIT/Professional; sem adicionar uma segunda percentagem de S&AT.",
        draft.selection.implementationReview === "separate" ? "Serviços de implementação/formação excluídos; sujeitos a proposta separada." : "Sem serviços de implementação/formação nesta proposta.",
        "Esta proposta abrange apenas a ampliação indicada e mantém a data de renovação do contrato existente. Ofertas atribuem apenas os direitos expressamente selecionados.",
      ] : [
      `Payable now for these additions: ${additionMoney(draft.quote.dueNow)}`,
      `Annual increase from the existing renewal: ${additionMoney(draft.quote.annualIncrease)}`,
      draft.quote.renewalAnnual == null ? "New annual renewal total: not confirmed (existing contract requires review)." : `New annual renewal total on the reviewed baseline: ${additionMoney(draft.quote.renewalAnnual)}`,
      draft.quote.supportNote,
      draft.selection.implementationReview === "separate" ? "Implementation/training services are excluded and must be quoted separately." : "No implementation services requested or charged in this proposal.",
      "This proposal covers additions only, not a replacement license. It does not extend the existing renewal date. Activation and contract updates require separate approval.",
      ]),
    ],
    terms: proposal.payment_terms || "Payment terms require agreement before issue.",
    notes: proposal.notes || "",
  };
}
const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function buildAdditionPrintHtml(proposal: Partial<Proposal>, draft = readAdditionDraft(proposal as Proposal)) {
  if (!draft) throw new Error("Missing commercial addition snapshot.");
  const c = additionDocumentContent(proposal, draft);
  return `<!doctype html><html lang="${c.pt ? "pt" : "en"}"><head><meta charset="utf-8"><title>${escape(c.title)}</title><style>
  @page{size:A4;margin:18mm}body{font:11pt Arial,sans-serif;color:#2c343c;line-height:1.45}header{border-bottom:2px solid #e01f2c;padding-bottom:12px}img{width:175px}h1{font-size:19pt}h2{font-size:13pt;margin-top:22px}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{padding:9px 7px;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#f1f4f6}thead{display:table-header-group}tr{break-inside:avoid}.summary{border-left:3px solid #e01f2c;padding-left:14px;break-inside:avoid}.terms{white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:8pt;color:#627180;margin-top:28px;border-top:1px solid #ddd;padding-top:7px}</style></head><body>
  <header><img src="${logoUrl}" alt="ManWinWin"><h1>${escape(c.title)}</h1></header>${c.details.map(x => `<p>${escape(x)}</p>`).join("")}
  <h2>${escape(c.headings.investment)}</h2><table><thead><tr>${c.headers.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${c.rows.map(row => `<tr>${row.map(x => `<td class="terms">${escape(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <section class="summary">${c.summary.map(x => `<p>${escape(x)}</p>`).join("")}</section><h2>${escape(c.headings.terms)}</h2><p class="terms">${escape(c.terms)}</p>${c.notes ? `<h2>${escape(c.headings.notes)}</h2><p class="terms">${escape(c.notes)}</p>` : ""}<footer style="display:flex;justify-content:space-between;align-items:center"><span>ManWinWin Software<br>(+351) 214 309 100<br>support@manwinwin.com<br>www.manwinwin.com</span><img src="/customer-export/iso9001.png" alt="ISO 9001 Bureau Veritas" style="width:90px"></footer><script>window.onload=()=>window.print();</script></body></html>`;
}
export function printAddition(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const html = buildAdditionPrintHtml(proposal, draft);
  const win = window.open("", "_blank", "width=1000,height=1100");
  if (!win) throw new Error("Allow pop-ups for PartnerOS and try again.");
  win.document.write(html); win.document.close();
}

import type { Proposal } from "@/types/proposal";
import { isServicesOnly, readAdditionDraft, type AdditionDraft } from "./commercial-additions";
import { additionValidUntil } from "./commercial-addition-terms";
import { groupAdditionLines, proposalIdentity, proposalRevisionLabel, servicesSummary } from "./commercial-proposal-journey";
import { documentChrome, documentDate, PROPOSAL_DESIGN_CSS } from "./proposal-document-design";

export const additionMoney = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);
export function additionVersionLabel(proposal: Partial<Proposal>, pt: boolean) {
  if (!proposal.id || !proposal.version) return pt ? "Pré-visualização não guardada" : "Unsaved preview";
  return proposal.status === "Draft" ? (pt ? `Rascunho ${proposalRevisionLabel(proposal)} — por validar` : `Draft ${proposalRevisionLabel(proposal)} — not validated`) : proposalRevisionLabel(proposal);
}
export function additionDocumentContent(proposal: Partial<Proposal>, draft: AdditionDraft) {
  if (draft.quote.blockers.length) throw new Error("Resolve all commercial addition blockers before exporting.");
  const commercial = draft.selection.commercial, pt = commercial?.language === "PT";
  const money = (n: number) => new Intl.NumberFormat(pt ? "pt-PT" : "en-GB", { style: "currency", currency: "EUR" }).format(n);
  const componentLabel = (label: string) => !pt ? label : Object.entries({ "Additional BackOffice SaaS hosting":"Alojamento SaaS do BackOffice adicional", "Additional BackOffice":"Acesso BackOffice adicional", "Additional WEB / Mobility":"Acesso WEB / Mobilidade adicional", "Maintenance Requests":"Pedidos à Manutenção", "Stock Management":"Gestão de Stock", "Purchase Management":"Gestão de Encomendas", "Purchase Orders":"Gestão de Encomendas", "Import Tool":"Importador", "Advanced Reports":"Relatórios avançados", "S&AT included":"S&AT incluído", "incremental S&AT":"S&AT incremental" }).reduce((text,[from,to])=>text.replace(from,to),label);
  const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join(pt ? "/" : "-") : s;
  const content = {
    pt,
    versionLabel: additionVersionLabel(proposal, pt),
    headings: { investment: pt ? "Resumo do investimento" : "Incremental investment", terms: pt ? "Condições de faturação, pagamento e ativação" : "Payment terms", notes: pt ? "Notas / condições especiais" : "Notes / special conditions" },
    headers: pt ? ["Componente", "Qtd.", "Aquisição única", "Incremento anual", "Valor inicial"] : ["Component", "Qty", "One-time", "Annual increase", "Payable now"],
    title: `${draft.selection.services?.length ? pt?"Ampliação e serviços ManWinWin":"Software additions & services":pt ? "Ampliação da configuração ManWinWin" : "Additional license components"} — ${proposal.client_name || draft.baseline.clientName}`,
    details: [
      ...(!proposal.id || !proposal.version ? [pt ? "PRÉ-VISUALIZAÇÃO — não guardada nem validada. Não utilizar como proposta emitida." : "PREVIEW — not saved or validated. Do not use as an issued proposal."] : []),
      ...(proposal.id?[`${pt?"Documento":"Document"}: ${proposalIdentity(proposal)}`]:[]),
      ...(draft.selection.implementationReview==="separate"?[pt?"SOFTWARE APENAS — formação/implementação e despesas excluídas. Orçamento separado.":"SOFTWARE ONLY — training/implementation and expenses excluded. Separate quotation."]:[]),
      `${draft.baseline.family} ${draft.baseline.model === "keepit" ? "KeepIT" : draft.baseline.model === "useit" ? "UseIT" : `${pt ? "Plano" : "Plan"} ${draft.baseline.plan}`} · ${draft.baseline.deployment === "saas" ? "SaaS" : "On-premise"} · ${additionVersionLabel(proposal, pt)}`,
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
      const initialGross=(l.referenceOneTime ?? l.oneTime)+(l.referenceAnnual ?? l.annual)*(draft.quote.months ?? 0)/12;
      const saving=Math.max(0,Math.round((initialGross-l.dueNow)*100)/100);
      const discounts = commercial ? [(l.initialDiscountPct||0)>0?`${pt?"Desconto inicial":"Initial discount"}: ${l.initialDiscountPct}%${saving>0?` · ${pt?"poupa":"save"} ${money(saving)}`:""}`:"",(l.renewalDiscountPct||0)>0?`${pt?"Desconto renovação":"Renewal discount"}: ${l.renewalDiscountPct}%`:""].filter(Boolean).map(t=>`\n${t}`).join("") : "";
      const service=draft.selection.services?.find(s=>`SERVICE_${s.id}`===l.code);
      const modality = service && pt ? ({online:"remota",onsite:"presencial",other:"outra modalidade"} as const)[service.modality] : service?.modality;
      const unit = service && pt ? ({session:"sessão",hour:"hora",day:"dia",fixed:"preço fixo"} as const)[service.unit] : service?.unit;
      return [componentLabel(l.label) + (service?`${modality&&!componentLabel(l.label).toLocaleLowerCase().includes(modality.toLocaleLowerCase())?` · ${modality}`:""} · ${unit}`:"") + reference + discounts, String(l.quantity), money(l.oneTime), money(l.annual), money(l.dueNow)];
    }),
    summary: [
      ...(pt ? [
        `Valor inicial desta ampliação: ${money(draft.quote.dueNow)}`,
        `Incremento anual ${proposal.status === "Accepted" ? "adjudicado" : "proposto"} / impacto na renovação: + ${money(draft.quote.annualIncrease)}`,
        draft.quote.renewalAnnual == null ? "Novo total anual do contrato: por confirmar, sujeito à reconciliação do contrato atual." : `Novo total anual do contrato: ${money(draft.quote.renewalAnnual)}`,
        draft.baseline.model === "keepit" ? "Apenas o S&AT incremental é proporcional ao período restante. Não se volta a cobrar o S&AT existente." : "S&AT incluído no licenciamento UseIT/Professional; sem adicionar uma segunda percentagem de S&AT.",
        draft.selection.services?.length ? "Serviços e despesas acima incluídos no valor inicial; sem impacto no valor anual da renovação." : draft.selection.implementationReview === "separate" ? "Serviços de implementação/formação excluídos; sujeitos a proposta separada." : "Sem serviços de implementação/formação nesta proposta.",
        "Esta proposta abrange apenas a ampliação indicada e mantém a data de renovação do contrato existente. Ofertas atribuem apenas os direitos expressamente selecionados.",
      ] : [
      `Payable now for these additions: ${additionMoney(draft.quote.dueNow)}`,
      `Annual increase from the existing renewal: ${additionMoney(draft.quote.annualIncrease)}`,
      draft.quote.renewalAnnual == null ? "New annual renewal total: not confirmed (existing contract requires review)." : `New annual renewal total on the reviewed baseline: ${additionMoney(draft.quote.renewalAnnual)}`,
      draft.quote.supportNote,
      draft.selection.services?.length ? "Services and expenses above are included in the purchase total and do not increase the annual renewal." : draft.selection.implementationReview === "separate" ? "Implementation/training services are excluded and must be quoted separately." : "No implementation services requested or charged in this proposal.",
      "This proposal covers additions only, not a replacement license. It does not extend the existing renewal date. Activation and contract updates require separate approval.",
      ]),
    ],
    services: servicesSummary(draft,pt),
    terms: proposal.payment_terms || "Payment terms require agreement before issue.",
    notes: proposal.notes || "",
  };
  if (isServicesOnly(draft.selection)) {
    content.title = `${pt ? "Proposta de serviços ManWinWin" : "ManWinWin services proposal"} — ${proposal.client_name || draft.baseline.clientName}`;
    content.details = content.details.filter(line=>!line.startsWith("Período cobrado:")&&!line.startsWith("Billable months:")&&!line.startsWith("BackOffice:"));
    content.details = content.details.map(line=>line.startsWith("Início:")?`Início dos serviços: ${date(draft.selection.effectiveDate)} · prestação única.`:line.startsWith("Effective date:")?`Services from ${draft.selection.effectiveDate} · one-time purchase.`:line);
    content.summary[2] = pt ? "Contrato, ARR e renovação inalterados. Sem ativação de licença." : "Contract, ARR and renewal unchanged. No license activation required.";
    content.summary = content.summary.filter(line=>!line.includes("S&AT"));
    content.summary[content.summary.length-1]=pt?"Esta proposta adjudica apenas os serviços e despesas indicados, sem alterar a licença ou a data de renovação.":"This proposal awards only the listed services and expenses. License and renewal date remain unchanged.";
  }
  return content;
}
const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** One presentation model for both the direct PDF and editable Word. */
export function additionDocumentLayout(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const c = additionDocumentContent(proposal,draft),pt=c.pt,commercial=draft.selection.commercial;
  const customer=proposal.client_name || draft.baseline.clientName;
  const money=(n:number)=>new Intl.NumberFormat(pt?"pt-PT":"en-GB",{style:"currency",currency:"EUR"}).format(n);
  const rows=groupAdditionLines(draft.quote.lines).map(group=>{
    const primary=group[0],index=draft.quote.lines.indexOf(primary),description=c.rows[index][0];
    const support=group.slice(1).map(line=>{
      const row=c.rows[draft.quote.lines.indexOf(line)];
      const notes=row[0].split("\n").slice(1).filter(note=>!(/^(Tarifa de referência|Reference tariff):/.test(note)&&line.unitPrice===line.referenceUnitPrice));
      return `${row[0].split("\n")[0].replace(/^.*?—\s*/,"")}: ${money(line.annual)}${notes.length?"\n"+notes.join("\n"):""}`;
    });
    const parts=description.split("\n");parts[0]=`${primary.quantity} × ${parts[0]}`;
    return [`${parts.join("\n")}${support.length?"\n"+support.join("\n"):""}`,...(["oneTime","annual","dueNow"] as const).map(key=>money(group.reduce((sum,line)=>sum+line[key],0)))];
  });
  const rowGroups=groupAdditionLines(draft.quote.lines).map(group=>group[0].kind==="service"||group[0].kind==="expense"?"services":"software");
  const renewalMetrics=isServicesOnly(draft.selection)?[[pt?"Contrato e renovação":"Contract and renewal",pt?"Sem alteração":"Unchanged"]]:[
    [pt?"Acréscimo na próxima renovação":"Increase at the next renewal",`+ ${money(draft.quote.annualIncrease)} / ${pt?"ano":"year"}`],
    [pt?"Novo valor anual do contrato":"New annual contract total",draft.quote.renewalAnnual==null?pt?"Por confirmar — rever o contrato atual":"Not confirmed — review the existing contract":`${money(draft.quote.renewalAnnual)} / ${pt?"ano":"year"}`],
  ];
  const summaryNotes=c.summary.slice(3).map(line=>line.includes("S&AT")?(draft.baseline.model==="keepit"?pt?"O valor inicial inclui o S&AT adicional proporcional ao período indicado.":"The initial investment includes additional S&AT for the stated period.":pt?"S&AT incluído no licenciamento.":"S&AT is included in the license."):line);
  const details=c.details.filter(x=>!x.startsWith("Documento:")&&!x.startsWith("Document:")&&!x.startsWith("Início:")&&!x.startsWith("Effective date:")&&!x.startsWith("Período cobrado:")&&!x.startsWith("Billable months:")&&!x.startsWith("Proposta de ")&&!x.startsWith("Proposal date:"));
  const familyIndex=details.findIndex(x=>x.startsWith(draft.baseline.family||"Business")),basisIndex=details.findIndex(x=>x.startsWith("Valores ")||x.startsWith("Offer basis:"));
  if(familyIndex>=0&&basisIndex>=0){details[familyIndex]+=" · "+details[basisIndex];details.splice(basisIndex,1);}
  return {c,customer,title:c.title.replace(` — ${customer}`,""),
    meta:[
      [pt?"Data da proposta":"Proposal date",documentDate(commercial?.proposalDate || proposal.proposal_date || draft.selection.effectiveDate,pt?"PT":"EN")],
      [pt?"Validade":"Validity",commercial?`${commercial.validityDays} ${pt?"dias, até":"days, until"} ${documentDate(additionValidUntil(commercial),pt?"PT":"EN")}`:"—"],
      [isServicesOnly(draft.selection)?pt?"Serviços":"Services":pt?"Período desta ampliação":"Addition period",isServicesOnly(draft.selection)?documentDate(draft.selection.effectiveDate,pt?"PT":"EN"):`${draft.quote.months} ${pt?(draft.quote.months===1?"mês":"meses"):(draft.quote.months===1?"month":"months")} · ${draft.selection.effectiveDate} – ${draft.selection.renewalDate}`],
    ],
    details:details.map(line=>line.replace(` · ${c.versionLabel}`,"")),
    headers:[c.headers[0],c.headers[2],c.headers[3],c.headers[4]],
    rows,rowGroups,renewalMetrics,summaryNotes,
    totalLabel:isServicesOnly(draft.selection)?pt?"Total dos serviços e despesas":"Total services and expenses":pt?"Total desta proposta":"Total of this proposal",
    total:money(draft.quote.dueNow),
  };
}
export function buildAdditionPrintHtml(proposal: Partial<Proposal>, draft = readAdditionDraft(proposal as Proposal)) {
  if (!draft) throw new Error("Missing commercial addition snapshot.");
  const m=additionDocumentLayout(proposal,draft),c=m.c;
  const chrome=documentChrome({...proposal,language:c.pt?"PT":"EN"},c.pt?"Proposta de investimento":"Investment proposal");
  return `<!doctype html><html lang="${c.pt?"pt":"en"}"><head><meta charset="utf-8"><title>${escape(c.title)}</title><style>${PROPOSAL_DESIGN_CSS}</style></head><body>${chrome.header}<main class="document-compact">
  <div class="document-intro"><h1>${escape(m.title)}</h1><p class="customer">${escape(m.customer)}</p></div>
  <div class="document-meta">${m.meta.map(([label,value])=>`<span>${escape(label)}<br><strong>${escape(value)}</strong></span>`).join("")}</div>
  ${m.details.map(x=>`<p class="small">${escape(x)}</p>`).join("")}
  <h2>${escape(c.headings.investment)}</h2><table><thead><tr>${m.headers.map((x,i)=>`<th${i?' class="num"':""}>${escape(x)}</th>`).join("")}</tr></thead><tbody>${m.rows.map((row,index)=>`${index===0||m.rowGroups[index]!==m.rowGroups[index-1]?`<tr class="header-row"><td colspan="4">${m.rowGroups[index]==="services"?(c.pt?"Serviços e despesas · prestação única":"Services and expenses · one-time"):(c.pt?"Software e acessos":"Software and accesses")}</td></tr>`:""}<tr>${row.map((x,i)=>`<td class="${i?"num":"terms"}">${escape(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <div class="investment-total"><span>${escape(m.totalLabel)}<small>${c.pt?"Acresce IVA à taxa legal aplicável":"Excluding applicable taxes"}</small></span><span class="value">${escape(m.total)}</span></div>
  <div class="document-meta renewal-metrics">${m.renewalMetrics.map(([label,value])=>`<span>${escape(label)}<br><strong>${escape(value)}</strong></span>`).join("")}</div>${!isServicesOnly(draft.selection)?`<p class="small">${c.pt?"A data de renovação mantém-se:":"Renewal date remains:"} ${escape(documentDate(draft.selection.renewalDate,c.pt?"PT":"EN"))}</p>`:""}${m.summaryNotes.map(x=>`<p class="small">${escape(x)}</p>`).join("")}
  ${draft.selection.implementationReview==="separate"?c.services.map(x=>`<p>${escape(x)}</p>`).join(""):""}<h2>${escape(c.headings.terms)}</h2><p class="terms">${escape(c.terms)}</p>${c.notes?`<h2>${escape(c.headings.notes)}</h2><p class="notes">${escape(c.notes)}</p>`:""}
  </main>${chrome.footer}<script>Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))]).then(()=>window.print());</script></body></html>`;
}
export async function printAddition(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const {downloadAdditionPdf}=await import("./commercial-addition-pdf");
  await downloadAdditionPdf(proposal,draft);
}

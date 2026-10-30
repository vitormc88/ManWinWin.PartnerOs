import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePricingRules } from "@/hooks/useProposals";
import { useAuth } from "@/contexts/AuthContext";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { supabase } from "@/integrations/supabase/client";
import type { Proposal } from "@/types/proposal";
import type { ProposalSource } from "@/lib/proposal-source";
import { ADDITION_PRODUCTS, ADDITION_SCHEMA, additionBaselineFromSnapshot, initialAdditionSelection, initialAdditionCommercial, calculateAddition, readAdditionDraft, type AdditionAction, type AdditionSelection, type AdditionDraft } from "@/lib/commercial-additions";
import { additionMoney } from "@/lib/commercial-addition-documents";
import type { CommercialContext } from "./CreateProposalDialog";
import { CommercialAdditionWorkflow } from "./CommercialAdditionWorkflow";
import { additionMatchesSaved } from "@/lib/commercial-addition-workflow";
import { additionPaymentText } from "@/lib/commercial-addition-terms";
import { AdditionCommercialTerms } from "./AdditionCommercialTerms";
import { usePartnerDiscountLimits, toDiscountOverrides } from "@/hooks/usePartnerDiscountLimits";

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; proposalSource?: ProposalSource | null;
  editingProposal?: Proposal | null; commercialContext?: CommercialContext | null; readOnly?: boolean; canManageClient?: boolean;
}
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Additions are deltas, never a new full-catalogue implementation proposal. */
export function CommercialAdditionDialog({ open, onOpenChange, proposalSource, editingProposal, commercialContext, readOnly = false, canManageClient }: Props) {
  const { user, isHQ, profile } = useAuth();
  const limits = usePartnerDiscountLimits(isHQ ? undefined : profile?.partner_id || undefined);
  const maxDiscount = isHQ ? 100 : toDiscountOverrides(limits.data).software ?? 10;
  const { canEdit } = useModuleAccess();
  const qc = useQueryClient();
  const rulesQ = usePricingRules();
  const savedDraft = readAdditionDraft(editingProposal);
  const [baseline] = useState(() => savedDraft?.baseline ?? additionBaselineFromSnapshot(commercialContext?.existingCustomer));
  const [selection, setSelection] = useState<AdditionSelection>(() => savedDraft?.selection ?? { ...initialAdditionSelection(baseline, localToday()), commercial: initialAdditionCommercial(localToday()) });
  const [terms, setTerms] = useState(editingProposal?.payment_terms || "");
  const [notes, setNotes] = useState(editingProposal?.notes || "");
  const [saved, setSaved] = useState<Proposal | null>(editingProposal ?? null);
  const [frozenRules, setFrozenRules] = useState(savedDraft?.rules);
  const [busy, setBusy] = useState(false);
  const action = savedDraft?.action ?? commercialContext?.mode as AdditionAction;
  const rules = frozenRules ?? rulesQ.data ?? [];
  const quote = calculateAddition(baseline, selection, rules);
  const field = <K extends keyof AdditionSelection>(key: K, value: AdditionSelection[K]) => setSelection(s => ({ ...s, [key]: value }));
  const sourceValid = proposalSource?.source_type === "client" && proposalSource.client_id === baseline.clientId && proposalSource.contract_id === baseline.contractId && proposalSource.license_id === baseline.licenseId;
  const canManage = canManageClient ?? (!readOnly && canEdit("clients"));
  const readonly = !canManage || (saved != null && saved.status !== "Draft");
  const effectiveTerms = selection.commercial ? additionPaymentText(selection.commercial.payment, selection.commercial.language) : terms;
  const unauthorizedAdjustments = !isHQ && Object.values(selection.commercial?.adjustments || {}).some(a => a.unitPrice != null || a.initialDiscountPct > maxDiscount || a.renewalDiscountPct > maxDiscount);
  const blockers = [...quote.blockers,
    ...(!["add_users", "add_modules", "add_plugins"].includes(action) || (editingProposal != null && !savedDraft) ? ["This addition snapshot is incomplete or unsupported. Reopen a new addition from the current client."] : []),
    ...(!sourceValid ? ["The proposal source does not match the saved client, license and contract."] : []),
    ...(!frozenRules && (rulesQ.isLoading || rulesQ.isError) ? ["The active price catalogue is not available yet."] : []),
    ...(!isHQ && selection.offerBasis === "partner" ? ["Navaltik/partner revenue shares require HQ review."] : []),
    ...(!effectiveTerms.trim() ? ["Enter the agreed payment terms; new-implementation terms are not assumed."] : []),
    ...(!readonly && unauthorizedAdjustments ? ["These negotiated prices or discounts require HQ authorization."] : []),
    ...(!readonly && !isHQ && selection.commercial?.payment.activation === "on_award" ? ["HQ must authorize activation on credit."] : []),
    ...(selection.commercial && !isHQ && (limits.isLoading || limits.isError) ? ["Discount limits are not available yet; try again before saving."] : []),
  ];
  const draft: AdditionDraft = { schema: ADDITION_SCHEMA, action, baseline, selection, rules, quote: { ...quote, blockers } };
  const documentProposal: Partial<Proposal> = { ...(saved || {}), client_name: baseline.clientName, language: selection.commercial?.language || "EN", payment_terms: effectiveTerms, notes, version: saved?.version };

  const save = async () => {
    if (readonly || busy || blockers.length || !user) return;
    setBusy(true);
    try {
      const { data: id, error } = await supabase.rpc("save_commercial_addition_draft" as never, {
        _proposal_id: saved?.id || null,
        _expected_updated_at: saved?.updated_at || null,
        _payload: {
          client_id: baseline.clientId, partner_uuid: proposalSource?.partner_uuid, contract_id: baseline.contractId, license_id: baseline.licenseId,
          client_name: baseline.clientName, product_family: baseline.family, license_model: baseline.model,
          proposal_mode: baseline.model === "keepit" ? "keepit_only" : baseline.model === "useit" ? "useit_only" : null,
          plan: baseline.plan, hosting: baseline.deployment === "saas" ? "SaaS" : "On-Premise", deployment: baseline.deployment,
          project_name: "Additional license components", proposal_date: selection.commercial?.proposalDate || saved?.proposal_date || localToday(), language: selection.commercial?.language || saved?.language || "EN", validity_days: selection.commercial?.validityDays || saved?.validity_days || 30, payment_terms: effectiveTerms, notes,
          total_year_1: quote.dueNow, total_recurring: quote.annualIncrease,
          business_config: { commercial_addition: draft },
        },
      } as never);
      if (error) throw error;
      const { data: row, error: readError } = await supabase.from("proposals").select("*").eq("id", String(id)).single();
      if (readError) throw readError;
      setSaved(row as unknown as Proposal);
      setFrozenRules(rules);
      await qc.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("Addition saved as Draft. Client, license, contract and renewal are unchanged.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save the addition draft."); }
    finally { setBusy(false); }
  };
  const downloadWord = async () => {
    if (blockers.length || busy) return;
    setBusy(true);
    try { const { downloadAdditionDocx } = await import("@/lib/commercial-addition-docx"); await downloadAdditionDocx(documentProposal, draft); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to generate Word."); }
    finally { setBusy(false); }
  };
  const downloadPdf = async () => {
    if (blockers.length || busy) return;
    setBusy(true);
    try { const { downloadAdditionPdf } = await import("@/lib/commercial-addition-pdf"); await downloadAdditionPdf(documentProposal, draft); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to generate PDF."); }
    finally { setBusy(false); }
  };
  const products = ADDITION_PRODUCTS.filter(p => action === "add_modules" ? p.kind === "module" : p.kind === "plugin");

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>{saved ? `Addition proposal v${saved.version}` : "New addition proposal"} — {baseline.clientName}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">{baseline.family || "Unknown license"} {baseline.model || (baseline.plan ? `Plan ${baseline.plan}` : "")} · {baseline.deployment || "Unknown hosting"} · {baseline.backoffice} BackOffice · {baseline.web} WEB · renewal {baseline.renewalDate || "not recorded"}</p>
    {readonly ? <p role="status" className="text-sm">Read-only. Only Draft additions can be edited here; validated/closed proposals retain their workflow state.</p> : null}
    <fieldset disabled={readonly || busy} className="space-y-4 min-w-0">
      {action === "add_users" ? <div className="grid sm:grid-cols-2 gap-4">
        <div><Label htmlFor="addition-bo">Additional BackOffice (not total)</Label><Input id="addition-bo" type="number" min={0} step={1} disabled={baseline.family === "Professional"} value={selection.backoffice} onChange={e => field("backoffice", Number(e.target.value))} />{baseline.family === "Professional" ? <p className="text-xs text-muted-foreground">Additional BackOffice requires a supported license upgrade, not a Professional add-on.</p> : null}</div>
        <div><Label htmlFor="addition-web">Additional WEB / Mobility (not total)</Label><Input id="addition-web" type="number" min={0} step={1} value={selection.web} onChange={e => field("web", Number(e.target.value))} /></div>
      </div> : <div><p className="font-medium text-sm">Additional {action === "add_modules" ? "modules" : "plugins / API"}</p><div className="flex flex-wrap gap-3 mt-2">{products.map(p => {
        const owned = baseline.owned.includes(p.id), unsupported = baseline.family === "Professional" && p.id !== "requests";
        return <label key={p.id} className="text-sm flex items-center gap-2 border rounded-md p-2"><input type="checkbox" checked={selection.products.includes(p.id)} disabled={owned || unsupported} onChange={e => field("products", e.target.checked ? [...selection.products, p.id] : selection.products.filter(id => id !== p.id))} />{p.label}{owned ? " · already licensed" : unsupported ? " · requires license upgrade" : ""}</label>;
      })}</div></div>}
      <div className="grid sm:grid-cols-3 gap-4">
        <div><Label htmlFor="addition-effective">Activation / effective date</Label><Input id="addition-effective" type="date" value={selection.effectiveDate} onChange={e => field("effectiveDate", e.target.value)} /></div>
        <div><Label htmlFor="addition-renewal">Existing renewal (not extended)</Label><Input id="addition-renewal" type="date" readOnly value={selection.renewalDate} /></div>
        <div><Label htmlFor="addition-months">Partial-month policy — required</Label><select id="addition-months" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.monthPolicy} onChange={e => field("monthPolicy", e.target.value as AdditionSelection["monthPolicy"])}><option value="">Choose agreed policy</option><option value="complete">Complete months only</option><option value="started">Count started months</option><option value="agreed">Explicit agreed number of months</option></select></div>
      </div>
      {selection.monthPolicy === "agreed" ? <div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="addition-agreed-months">Agreed billable months</Label><Input id="addition-agreed-months" type="number" min={0} step="0.01" value={selection.agreedMonths ?? ""} onChange={e => field("agreedMonths", e.target.value === "" ? null : Number(e.target.value))} /></div><div><Label htmlFor="addition-month-review">Agreement / reason</Label><Input id="addition-month-review" value={selection.monthReview} onChange={e => field("monthReview", e.target.value)} /></div></div> : null}
      <p className="text-xs text-muted-foreground">Source price table: {baseline.priceTable || "not recorded"}. A historical price table is not silently replaced by the current catalogue.</p>
      <div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="addition-pricing">Reviewed pricing calculation</Label><select id="addition-pricing" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.pricingBasis} onChange={e => field("pricingBasis", e.target.value as AdditionSelection["pricingBasis"])}><option value="">Choose pricing basis</option><option value="direct">Active direct catalogue SKU</option><option value="derived">Active KeepIT base × UseIT factor</option></select></div><div><Label htmlFor="addition-price-review">Price table approval / reference</Label><Input id="addition-price-review" placeholder="Record why these prices apply to this customer" value={selection.priceReview} onChange={e => field("priceReview", e.target.value)} /></div></div>
      <div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="addition-offer">Offer / billing basis</Label><select id="addition-offer" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.offerBasis} onChange={e => field("offerBasis", e.target.value as AdditionSelection["offerBasis"])}><option value="">Choose reviewed offer basis</option><option value="customer">Customer catalogue prices</option>{isHQ ? <option value="partner">Navaltik to partner — confirmed shares</option> : null}</select></div><div><Label htmlFor="addition-implementation">Implementation / training review</Label><select id="addition-implementation" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.implementationReview} onChange={e => field("implementationReview", e.target.value as AdditionSelection["implementationReview"])}><option value="">Review required</option><option value="not_needed">No implementation needed</option><option value="separate">Quote implementation separately</option></select></div></div>
      {selection.offerBasis === "partner" && isHQ ? <div className="grid sm:grid-cols-2 gap-4">{(["licenseShare", "hostingShare"] as const).map(key => <div key={key}><Label htmlFor={`addition-${key}`}>{key === "licenseShare" ? "Confirmed Navaltik share — license / S&AT / WEB / API (%)" : "Confirmed Navaltik share — hosting (%)"}</Label><Input id={`addition-${key}`} type="number" min={0} max={100} value={selection[key] ?? ""} onChange={e => field(key, e.target.value === "" ? null : Number(e.target.value))} /></div>)}</div> : null}
      <p className="text-xs text-muted-foreground">Recorded annual baseline: {baseline.recordedAnnual == null ? "not available" : additionMoney(baseline.recordedAnnual)}. Imported/unreconciled totals require review.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={selection.baselineAnnualConfirmed} onChange={e => field("baselineAnnualConfirmed", e.target.checked)} />I have reconciled the recorded annual baseline and it uses the same offer basis. Show the proposed total renewal.</label>
      {selection.commercial ? <AdditionCommercialTerms value={selection.commercial} lines={quote.lines} isHQ={isHQ} maxDiscount={maxDiscount} onChange={value=>field("commercial",value)}/> : <><div><Label htmlFor="addition-terms">Agreed payment terms — required</Label><Textarea id="addition-terms" value={terms} onChange={e => setTerms(e.target.value)} /></div>{!readonly?<Button type="button" variant="outline" onClick={()=>field("commercial",initialAdditionCommercial(saved?.proposal_date || localToday()))}>Enable detailed prices & payment terms</Button>:null}</>}
      {selection.commercial?<p className="text-sm whitespace-pre-wrap border-l-2 pl-3">{effectiveTerms}</p>:null}
      <div><Label htmlFor="addition-notes">Notes / special conditions</Label><Textarea id="addition-notes" value={notes} onChange={e => setNotes(e.target.value)} /></div>
    </fieldset>
    {blockers.length ? <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 p-3 text-sm"><p className="font-semibold">Review required — saving and export are blocked</p><ul className="list-disc ml-5">{blockers.map(b => <li key={b}>{b}</li>)}</ul></div> : <section aria-label="Incremental investment summary" className="border rounded-lg p-4 space-y-3">
      <p className="font-semibold">{quote.months} billable months · only the additions are charged</p><p className="text-sm">BackOffice: {baseline.backoffice} → {quote.afterBackoffice} · WEB: {baseline.web} → {quote.afterWeb}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Component", "Qty", "One-time", "Annual increase", "Payable now"].map(h => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead><tbody>{quote.lines.map(l => <tr key={l.code}><td className="p-2">{l.label}</td><td className="p-2">{l.quantity}</td><td className="p-2">{additionMoney(l.oneTime)}</td><td className="p-2">{additionMoney(l.annual)}</td><td className="p-2">{additionMoney(l.dueNow)}</td></tr>)}</tbody></table></div>
      <p>Payable now: <strong>{additionMoney(quote.dueNow)}</strong></p><p>Annual renewal increase: <strong>{additionMoney(quote.annualIncrease)}</strong></p><p>New annual renewal: <strong>{quote.renewalAnnual == null ? "Not confirmed — baseline requires review" : additionMoney(quote.renewalAnnual)}</strong></p><p className="text-xs text-muted-foreground">{quote.supportNote}</p>
    </section>}
    {saved ? <CommercialAdditionWorkflow proposal={saved} canManage={canManage} savedCurrent={additionMatchesSaved(saved,draft,effectiveTerms,notes) && !blockers.length} onUpdated={setSaved} /> : null}
    <p className="text-xs text-muted-foreground">Saving or downloading does not change ARR or licenses. Use Proposal follow-up to validate, record sending, adjudicate and activate. Existing drafts retain their saved prices.</p>
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button variant="outline" disabled={busy || !!blockers.length} onClick={downloadPdf}>Download PDF</Button><Button variant="outline" disabled={busy || !!blockers.length} onClick={downloadWord}>Download Word</Button><Button disabled={readonly || busy || !!blockers.length} onClick={save}>{busy ? "Working…" : "Save Draft"}</Button></div>
  </DialogContent></Dialog>;
}

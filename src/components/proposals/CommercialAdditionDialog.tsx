import { useEffect, useRef, useState } from "react";
import { additionPreparationBlockers, additionReviews, needsAdditionCalculationChoice, needsAdditionHostingShare, normalizeAdditionScope, type AdditionReview } from "@/lib/addition-preparation-ux";
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
import { ProposalLeaveGuard } from "./ProposalLeaveGuard";
import { readPreparation, type PreparationDraft } from "@/lib/proposal-preparation";

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
  const preparation = readPreparation(editingProposal);
  const [working, setWorking] = useState<PreparationDraft | null>(preparation);
  const [baseline] = useState(() => savedDraft?.baseline ?? additionBaselineFromSnapshot(commercialContext?.existingCustomer));
  const [selection, setSelection] = useState<AdditionSelection>(() => {
    const restored = savedDraft?.selection;
    if (!restored) return { ...initialAdditionSelection(baseline, localToday()), pricingBasis: "direct", commercial: initialAdditionCommercial(localToday()) };
    if (!preparation && editingProposal?.status !== "Draft") return restored;
    // Old incomplete preparations must not be stranded behind a now-hidden control.
    return { ...restored,
      pricingBasis: restored.pricingBasis || (needsAdditionCalculationChoice(baseline, restored) ? "" : "direct"),
      hostingShare: restored.offerBasis === "partner" && !needsAdditionHostingShare(baseline, restored) ? 100 : restored.hostingShare };
  });
  const [terms, setTerms] = useState(editingProposal?.payment_terms || "");
  const [notes, setNotes] = useState(editingProposal?.notes || "");
  const [saved, setSaved] = useState<Proposal | null>(preparation ? null : editingProposal ?? null);
  const [frozenRules, setFrozenRules] = useState(savedDraft?.rules.length ? savedDraft.rules : undefined);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(() => typeof preparation?.body.uiStep === "number" && [0,1,2].includes(preparation.body.uiStep) ? preparation.body.uiStep : 0);
  const [editing, setEditing] = useState(!editingProposal || !!preparation);
  const [leave, setLeave] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [reviewTarget, setReviewTarget] = useState<{id: string} | null>(null);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.scrollTop = 0;
    if (reviewTarget) {
      const target = content.querySelector<HTMLElement>(`#${reviewTarget.id}`);
      if (target) {
        target.focus({ preventScroll: true });
        content.scrollTop = Math.max(0, target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 16);
      }

    }
  }, [step, reviewTarget]);
  const fingerprint = JSON.stringify({selection,terms,notes});
  const [committed, setCommitted] = useState(fingerprint);
  const dirty = fingerprint !== committed;
  const requestClose = (value: boolean) => { if (!value && dirty && !readonly) setLeave(true); else onOpenChange(value); };
  const action = savedDraft?.action ?? commercialContext?.mode as AdditionAction;
  const rules = frozenRules ?? rulesQ.data ?? [];
  const quote = calculateAddition(baseline, selection, rules);
  const field = <K extends keyof AdditionSelection>(key: K, value: AdditionSelection[K]) => setSelection(s => {
    const next = { ...s, [key]: value };
    if (["offerBasis", "licenseShare", "hostingShare"].includes(key) && s[key] !== value) next.baselineAnnualConfirmed = false;
    if (!needsAdditionHostingShare(baseline, s) && needsAdditionHostingShare(baseline, next)) next.hostingShare = null;
    if (next.offerBasis === "partner" && !needsAdditionHostingShare(baseline, next)) next.hostingShare = 100;
    return ["products", "backoffice", "web", "offerBasis"].includes(key) ? normalizeAdditionScope(baseline, next, rules) : next;
  });
  const sourceValid = proposalSource?.source_type === "client" && proposalSource.client_id === baseline.clientId && proposalSource.contract_id === baseline.contractId && proposalSource.license_id === baseline.licenseId;
  const canManage = canManageClient ?? (!readOnly && canEdit("clients"));
  const readonly = !canManage || (saved != null && saved.status !== "Draft");
  const effectiveTerms = selection.commercial ? additionPaymentText(selection.commercial.payment, selection.commercial.language) : terms;
  const unauthorizedAdjustments = !isHQ && Object.values(selection.commercial?.adjustments || {}).some(a => a.unitPrice != null || a.initialDiscountPct > maxDiscount || a.renewalDiscountPct > maxDiscount);
  const blockers = [...quote.blockers, ...additionPreparationBlockers(baseline, selection),
    ...(!["add_users", "add_modules", "add_plugins"].includes(action) || (editingProposal != null && !savedDraft) ? ["This addition snapshot is incomplete or unsupported. Reopen a new addition from the current client."] : []),
    ...(!sourceValid ? ["The proposal source does not match the saved client, license and contract."] : []),
    ...(!frozenRules && (rulesQ.isLoading || rulesQ.isError) ? ["The active price catalogue is not available yet."] : []),
    ...(!isHQ && selection.offerBasis === "partner" ? ["Navaltik/partner revenue shares require HQ review."] : []),
    ...(!effectiveTerms.trim() || /(to be agreed|to be confirmed|pending|por confirmar)/i.test(effectiveTerms) ? ["Complete the proposed payment terms; unresolved placeholders cannot be issued."] : []),
    ...(!readonly && unauthorizedAdjustments ? ["These negotiated prices or discounts require HQ authorization."] : []),
    ...(!readonly && !isHQ && selection.commercial?.payment.activation === "on_award" ? ["HQ must authorize activation on credit."] : []),
    ...(selection.commercial && !isHQ && (limits.isLoading || limits.isError) ? ["Discount limits are not available yet; try again before saving."] : []),
  ];
  const hasItems = selection.backoffice > 0 || selection.web > 0 || selection.products.length > 0;
  const reviews = additionReviews(blockers, hasItems);
  const draft: AdditionDraft = { schema: ADDITION_SCHEMA, action, baseline, selection, rules, quote: { ...quote, blockers } };
  const documentProposal: Partial<Proposal> = { ...(saved || {}), client_name: baseline.clientName, language: selection.commercial?.language || "EN", payment_terms: effectiveTerms, notes, version: saved?.version };

  const save = async () => {
    if (readonly || busy || !user || !sourceValid || !Number.isSafeInteger(selection.backoffice) || !Number.isSafeInteger(selection.web) || selection.backoffice < 0 || selection.web < 0 || (editingProposal && !savedDraft)) return false;
    setBusy(true);
    try {
      if (blockers.length) {
        const { data, error } = await supabase.rpc("save_proposal_preparation" as never, {
          _id: working?.id || null, _expected_updated_at: working?.updated_at || null,
          _client_id: baseline.clientId, _license_id: baseline.licenseId, _contract_id: baseline.contractId,
          _kind: "addition", _body: {draft, terms, notes, uiStep: step},
          _proposal_id: working?.proposal_id || saved?.id || null,
          _proposal_updated_at: working?.proposal_updated_at || saved?.updated_at || null,
        } as never);
        if(error) throw error;
        setWorking(data as unknown as PreparationDraft); setCommitted(fingerprint);
        await qc.invalidateQueries({queryKey:["proposal-preparations"]});
        toast.success("Preparation draft saved. Complete the outstanding reviews before issuing a proposal.");
        return true;
      }
      const { data: id, error } = await supabase.rpc((working ? "complete_proposal_preparation" : "save_commercial_addition_draft") as never, {
        ...(working ? {_preparation_id:working.id,_preparation_updated_at:working.updated_at} : {
          _proposal_id: saved?.id || null, _expected_updated_at: saved?.updated_at || null,
        }),
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
      setWorking(null); setCommitted(fingerprint); setEditing(false);
      setFrozenRules(rules);
      await qc.invalidateQueries({ queryKey: ["proposals"] });
      await qc.invalidateQueries({queryKey:["proposal-preparations"]});
      toast.success("Addition saved as Draft. Client, license, contract and renewal are unchanged.");
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save the addition draft."); }
    finally { setBusy(false); }
    return false;
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
  const canSave = !readonly && !busy && sourceValid && (!editingProposal || !!savedDraft)
    && [selection.backoffice,selection.web].every(n=>Number.isSafeInteger(n)&&n>=0);
  const showEditor = editing && !readonly;
  const jump = (review: AdditionReview) => { if (canManage) setEditing(true); setStep(review.step); setReviewTarget({id: review.target}); };
  const overview = !showEditor && !!saved;
  const priceBasisReady = !!selection.offerBasis && !!selection.pricingBasis
    && (selection.offerBasis !== "partner" || [selection.licenseShare, selection.hostingShare].every(n => n != null && Number.isFinite(n) && n >= 0 && n <= 100))
    && !quote.blockers.some(message => /catalogue rule|already licensed|Professional does not|Invalid component|finite|supported range/.test(message));
  const estimateAvailable = priceBasisReady && hasItems && quote.months != null && !!selection.pricingBasis && !!selection.offerBasis
    && (selection.offerBasis !== "partner" || [selection.licenseShare, selection.hostingShare].every(n => n != null && Number.isFinite(n) && n >= 0 && n <= 100))
    && [selection.backoffice,selection.web].every(n=>Number.isSafeInteger(n)&&n>=0)
    && !quote.blockers.some(message=>/catalogue rule|already licensed|Professional does not|Invalid component|finite|supported range/.test(message))
    && [quote.dueNow,quote.annualIncrease].every(n=>Number.isFinite(n)&&n>=0&&n<=100000000);
  const gross = Math.round(quote.lines.reduce((sum,l)=>sum+(l.referenceOneTime??l.oneTime)+(l.referenceAnnual??l.annual)*(quote.months??0)/12,0)*100)/100;

  return <><Dialog open={open} onOpenChange={requestClose}><DialogContent className="max-w-6xl h-[92vh] max-h-[920px] flex flex-col p-0 gap-0 overflow-hidden">
    <DialogHeader className="px-6 py-4 border-b shrink-0 pr-12"><DialogTitle>{overview ? `Proposal v${saved?.version} · ${saved?.status}` : working ? "Continue saved preparation" : "Prepare customer proposal"} — {baseline.clientName}</DialogTitle>
      <p className="text-sm text-muted-foreground">{baseline.family || "Unknown license"} {baseline.model === "useit" ? "UseIT" : baseline.model === "keepit" ? "KeepIT" : baseline.plan ? `Plan ${baseline.plan}` : ""} · {baseline.deployment === "saas" ? "SaaS" : "On-premise"} · {baseline.backoffice} BackOffice · {baseline.web} WEB · Renewal {baseline.renewalDate || "not recorded"}</p>
    </DialogHeader>
    {showEditor ? <nav aria-label="Proposal preparation steps" className="flex gap-2 px-6 py-3 border-b shrink-0 overflow-x-auto">{["1. Choose items","2. Prices & period","3. Review & payment"].map((label,index)=><Button key={label} type="button" variant={step===index?"secondary":"ghost"} aria-current={step===index?"step":undefined} onClick={()=>{setReviewTarget(null);setStep(index);}}>{label}</Button>)}</nav> : null}
    <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto p-6" id="addition-content">
      {overview && saved ? <div className="mb-6 space-y-3"><CommercialAdditionWorkflow proposal={saved} canManage={canManage} savedCurrent={additionMatchesSaved(saved,draft,effectiveTerms,notes) && !blockers.length} onUpdated={p=>{setSaved(p);if(p.status==="Draft")setEditing(true);}}/>
        {saved.status==="Draft" && canManage ? <Button type="button" variant="outline" onClick={()=>setEditing(true)}>Edit draft</Button> : <p className="text-sm text-muted-foreground">Validated proposals retain their saved terms. Use Return to Draft before editing.</p>}
      </div> : null}
      <div className={showEditor?"grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start":"space-y-5"}>
        {showEditor ? <fieldset disabled={busy} className="min-w-0 space-y-5">
          <div hidden={step!==0} className="space-y-5">
            <div id="addition-items" tabIndex={-1}><h3 className="font-semibold text-lg">What would you like to add?</h3><p className="text-sm text-muted-foreground">Combine compatible accesses, modules and plugins in one proposal. Existing licensed components are preserved.</p></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label htmlFor="addition-bo">Additional BackOffice (not total)</Label><Input id="addition-bo" type="number" min={0} step={1} disabled={baseline.family==="Professional"} value={selection.backoffice} onChange={e=>field("backoffice",Number(e.target.value))}/>{baseline.family==="Professional"?<p className="text-xs text-muted-foreground">Additional BackOffice requires a license upgrade.</p>:null}</div>
              <div><Label htmlFor="addition-web">Additional WEB / Mobility (not total)</Label><Input id="addition-web" type="number" min={0} step={1} value={selection.web} onChange={e=>field("web",Number(e.target.value))}/></div>
            </div>
            {(["module","plugin"] as const).map(kind=><section key={kind} className="space-y-2"><h4 className="font-medium">{kind==="module"?"Modules":"Plugins & API"}</h4><div className="grid sm:grid-cols-2 gap-2">{ADDITION_PRODUCTS.filter(p=>p.kind===kind).map(p=>{
              const owned=baseline.owned.includes(p.id), unsupported=baseline.family==="Professional"&&p.id!=="requests";
              return <label key={p.id} className={`text-sm flex items-start gap-2 border rounded-lg p-3 ${owned||unsupported?"bg-muted/40 text-muted-foreground":"hover:bg-muted/30"}`}><input className="mt-1" type="checkbox" checked={selection.products.includes(p.id)} disabled={owned||unsupported} onChange={e=>field("products",e.target.checked?[...selection.products,p.id]:selection.products.filter(id=>id!==p.id))}/><span>{p.label}{owned?<small className="block">Already licensed</small>:unsupported?<small className="block">Requires license upgrade</small>:null}</span></label>;
            })}</div></section>)}
            <div><Label htmlFor="addition-implementation">Implementation / training</Label><select id="addition-implementation" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.implementationReview} onChange={e => field("implementationReview", e.target.value as AdditionSelection["implementationReview"])}><option value="">Choose service scope</option><option value="not_needed">No services needed for this addition</option><option value="separate">Quote implementation separately</option></select></div>
            <p className="text-sm rounded-lg bg-muted p-3">Implementation and training are not added automatically. Review any service requirement in the next step; separately quoted services remain excluded from these totals.</p>
          </div>
          <div hidden={step!==1} className="space-y-5">
            <h3 className="font-semibold text-lg">Period & price review</h3>
            {working && frozenRules ? <div className="text-sm rounded-lg border p-3"><p>Saved catalogue prices are preserved. If the catalogue has changed, refresh it and review the applicable prices again.</p><Button type="button" variant="ghost" onClick={()=>{setFrozenRules(undefined);field("priceReview","");}}>Refresh catalogue for this preparation</Button></div> : null}
      <div className="grid sm:grid-cols-3 gap-4">
        <div><Label htmlFor="addition-effective">Activation / effective date</Label><Input id="addition-effective" type="date" value={selection.effectiveDate} onChange={e => field("effectiveDate", e.target.value)} /></div>
        <div><Label htmlFor="addition-renewal">Existing renewal (not extended)</Label><Input id="addition-renewal" type="date" readOnly value={selection.renewalDate} /></div>
        <div><Label htmlFor="addition-months">Partial-month policy — required</Label><select id="addition-months" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.monthPolicy} onChange={e => field("monthPolicy", e.target.value as AdditionSelection["monthPolicy"])}><option value="">Choose agreed policy</option><option value="complete">Complete months only</option><option value="started">Count started months</option><option value="agreed">Explicit agreed number of months</option></select></div>
      </div>
      {selection.monthPolicy === "agreed" ? <div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="addition-agreed-months">Agreed billable months</Label><Input id="addition-agreed-months" type="number" min={0} step="0.01" value={selection.agreedMonths ?? ""} onChange={e => field("agreedMonths", e.target.value === "" ? null : Number(e.target.value))} /></div><div><Label htmlFor="addition-month-review">Agreement / reason</Label><Input id="addition-month-review" value={selection.monthReview} onChange={e => field("monthReview", e.target.value)} /></div></div> : null}
      <p id="addition-source" tabIndex={-1} className="text-xs text-muted-foreground">Source price table: {baseline.priceTable || "not recorded"}. A historical price table is not silently replaced by the current catalogue.</p>
      {needsAdditionCalculationChoice(baseline, selection) ? <details className="rounded-lg border p-3" open={!selection.pricingBasis}><summary className="text-sm font-medium cursor-pointer">Price calculation · HQ / catalogue review</summary><p className="text-xs text-muted-foreground my-2">Use the approved calculation for this contract. These alternatives can change the price.</p><Label htmlFor="addition-pricing">Approved calculation</Label><select id="addition-pricing" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.pricingBasis} onChange={e => field("pricingBasis", e.target.value as AdditionSelection["pricingBasis"])}><option value="">Choose approved calculation</option><option value="direct">Direct annual catalogue price</option><option value="derived">KeepIT price × approved UseIT factor</option></select></details> : <p className="text-sm rounded-lg bg-muted p-3">The selected items use their catalogue prices directly; no calculation method needs to be chosen.</p>}
      <div><Label htmlFor="addition-price-review">Applicable price table / approval reference</Label><Input id="addition-price-review" placeholder="Confirm the table or existing agreement that applies" value={selection.priceReview} onChange={e => field("priceReview", e.target.value)} /><p className="text-xs text-muted-foreground mt-1">If the contract uses historical or special prices, ask HQ before confirming.</p></div>
      <div className="grid sm:grid-cols-2 gap-4"><div><Label htmlFor="addition-offer">Who are these prices for?</Label><select id="addition-offer" className="w-full border rounded-md h-10 px-2 bg-background" value={selection.offerBasis} onChange={e => field("offerBasis", e.target.value as AdditionSelection["offerBasis"])}><option value="">Choose recipient of prices</option><option value="customer">Customer catalogue prices</option>{isHQ ? <option value="partner">Navaltik invoice to partner — enter verified shares</option> : null}</select></div></div>
      {selection.offerBasis === "partner" && isHQ ? <div className="grid sm:grid-cols-2 gap-4">{(["licenseShare", "hostingShare"] as const).filter(key => key !== "hostingShare" || needsAdditionHostingShare(baseline, selection)).map(key => <div key={key}><Label htmlFor={`addition-${key}`}>{key === "licenseShare" ? "Verified Navaltik share — license / S&AT / WEB / API (%)" : "Verified Navaltik share — hosting (%)"}</Label><Input id={`addition-${key}`} type="number" min={0} max={100} value={selection[key] ?? ""} onChange={e => field(key, e.target.value === "" ? null : Number(e.target.value))} /></div>)}</div> : null}
      <p className="text-xs text-muted-foreground">Recorded annual baseline: {baseline.recordedAnnual == null ? "not available" : additionMoney(baseline.recordedAnnual)}. Imported/unreconciled totals require review.</p>
      <label className="flex gap-2 text-sm rounded-lg border p-3"><input id="addition-baseline" type="checkbox" checked={selection.baselineAnnualConfirmed} onChange={e => field("baselineAnnualConfirmed", e.target.checked)} />I confirm the recorded annual renewal is correct and uses the same customer/partner price basis. Required before issue; ask HQ if uncertain.</label>

            <div id="addition-discounts" tabIndex={-1}>{selection.commercial?<AdditionCommercialTerms section="prices" priceBasisReady={priceBasisReady} periodReady={quote.months != null && quote.months > 0} value={selection.commercial} lines={quote.lines} isHQ={isHQ} maxDiscount={maxDiscount} onChange={value=>field("commercial",value)}/>:<Button type="button" variant="outline" onClick={()=>field("commercial",initialAdditionCommercial(saved?.proposal_date||localToday()))}>Enable detailed prices & payment terms</Button>}</div>
          </div>
          <div hidden={step!==2} className="space-y-5">
            <h3 className="font-semibold text-lg">Review before preparing the document</h3>
            <div id="addition-payment" tabIndex={-1}>{selection.commercial?<AdditionCommercialTerms section="payment" value={selection.commercial} lines={quote.lines} isHQ={isHQ} maxDiscount={maxDiscount} onChange={value=>field("commercial",value)}/>:<div><Label htmlFor="addition-terms">Agreed payment terms — required</Label><Textarea id="addition-terms" value={terms} onChange={e=>setTerms(e.target.value)}/></div>}</div>
            <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted p-3">{effectiveTerms}</p>
            <div><Label htmlFor="addition-notes">Notes / special conditions</Label><Textarea id="addition-notes" value={notes} onChange={e=>setNotes(e.target.value)}/></div>
            {blockers.length ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 p-3 text-sm">You can save this preparation at any time. Use the tasks in the investment summary to finish it; document export remains unavailable until all required checks are complete.</p> : <p role="status" className="rounded-lg bg-emerald-50 text-emerald-900 p-3 text-sm">Required preparation checks are complete. Save as Draft, then use Mark Ready for final validation in follow-up. Nothing has been issued or awarded.</p>}

          </div>
        </fieldset> : null}
        <section aria-label="Incremental investment summary" className="rounded-xl border bg-muted/20 p-5 space-y-4 lg:sticky lg:top-0">
          <h3 className="font-semibold">{overview?"Saved investment":"Investment preview"}</h3>
          {(!overview || (canManage && saved?.status === "Draft" && blockers.length > 0)) ? <div role="status" className="space-y-3"><p className={`text-sm font-medium ${reviews.length ? "text-amber-800" : "text-emerald-800"}`}>{!hasItems ? "Start by choosing your items" : reviews.length ? "Preparation in progress · not ready to issue" : "Prepared for final validation"}</p>{reviews.length ? <><p className="text-xs text-muted-foreground">Your next step</p><button type="button" className="w-full rounded-md border bg-background p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => jump(reviews[0])}><span className="block text-sm font-medium">{reviews[0].title} →</span><span className="block text-xs text-muted-foreground mt-1">{reviews[0].owner}</span></button>{reviews.length > 1 ? <details><summary className="text-sm cursor-pointer">Other tasks to finish ({reviews.length - 1})</summary><ul aria-label="Tasks to finish this proposal" className="space-y-2 mt-2">{reviews.slice(1).map(review => <li key={review.id}><button type="button" className="w-full rounded-md border bg-background p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => jump(review)}><span className="block text-sm font-medium">{review.title} →</span><span className="block text-xs text-muted-foreground">{review.owner}</span></button></li>)}</ul></details> : null}<p className="text-xs text-muted-foreground">Save your preparation now and return later if a contract or HQ check is needed.</p></> : null}</div> : null}

          <p className="text-sm">{quote.months??"—"} billable months · only the additions are charged</p>
          <p className="text-sm">BackOffice: {baseline.backoffice} → {quote.afterBackoffice} · WEB: {baseline.web} → {quote.afterWeb}</p>
          <div className="border-y py-3 space-y-2 text-sm"><p className="flex justify-between gap-3"><span>Before initial discounts</span><span>{estimateAvailable?additionMoney(gross):"Period / price basis required"}</span></p><p className="flex justify-between"><span>Initial discounts</span><span>{estimateAvailable?`−${additionMoney(Math.max(0,gross-quote.dueNow))}`:"—"}</span></p></div>
          <div><p className="text-xs text-muted-foreground">THIS PURCHASE · EXCLUDING TAX</p><strong className="block text-2xl tabular-nums">{estimateAvailable?additionMoney(quote.dueNow):"To be confirmed"}</strong></div>
          <p className="text-sm">Annual renewal increase: <strong>{estimateAvailable?additionMoney(quote.annualIncrease):"To be confirmed"}</strong></p>
          <p className="text-sm">New annual renewal: <strong>{estimateAvailable&&quote.renewalAnnual!=null?additionMoney(quote.renewalAnnual):"Not confirmed — baseline requires review"}</strong></p>
          <p className="text-xs text-muted-foreground">{selection.offerBasis==="partner"?(estimateAvailable?"Navaltik invoice to partner · entered shares applied":"Partner prices awaiting verified shares"):selection.offerBasis==="customer"?"Customer catalogue prices":"Price recipient not yet selected"}. Contract renewal date is unchanged. ARR changes only upon adjudication; license activation is separate.</p>
          <details><summary className="cursor-pointer text-sm font-medium">Component breakdown ({quote.lines.length})</summary><ul className="mt-3 space-y-3 text-sm">{quote.lines.map(l=><li key={l.code}><p>{l.quantity} × {l.label}</p><p className="text-muted-foreground">{estimateAvailable ? `${additionMoney(l.dueNow)} now` : "Purchase amount awaiting period / price basis"} · {priceBasisReady ? `+${additionMoney(l.annual)}/year` : "Annual amount awaiting price basis"}</p></li>)}</ul><p className="text-xs text-muted-foreground mt-3">{quote.supportNote}</p></details>
        </section>
      </div>
      {overview?<details className="mt-5 border rounded-lg p-4"><summary className="cursor-pointer font-medium text-sm">Saved scope & commercial conditions</summary><div className="mt-3 space-y-3 text-sm"><p>{selection.priceReview}</p><p className="whitespace-pre-wrap">{effectiveTerms}</p><p className="whitespace-pre-wrap">{notes}</p></div></details>:null}
    </div>
    <footer className="border-t bg-background px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex gap-2"><Button variant="ghost" onClick={()=>requestClose(false)}>Close</Button>{showEditor&&step>0?<Button variant="outline" onClick={()=>{setReviewTarget(null);setStep(step-1);}}>Back</Button>:null}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy||!!blockers.length} onClick={downloadPdf}>Download PDF</Button><Button variant="outline" disabled={busy||!!blockers.length} onClick={downloadWord}>Download Word</Button>
        {showEditor?<><Button variant="outline" disabled={!canSave} onClick={save}>{busy?"Saving…":(blockers.length ? "Save preparation" : "Save Draft")}</Button>{step<2?<Button disabled={busy} onClick={()=>{setReviewTarget(null);setStep(step+1);}}>Continue</Button>:null}</>:null}
      </div>
    </footer>
  </DialogContent></Dialog><ProposalLeaveGuard open={leave} dirty={dirty&&!readonly} busy={busy} onKeep={()=>setLeave(false)} onDiscard={()=>{setLeave(false);onOpenChange(false);}} onSave={canSave?async()=>{if(await save()){setLeave(false);onOpenChange(false);}}:undefined}/></>;
}

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ChevronLeft, ChevronRight, FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePricingRules } from "@/hooks/useProposals";
import {
  buildDefaultItems,
  computeTotals,
  enrichProposalItem,
  recomputeItemTotal,
  PLAN_INCLUDES,
  getItemBaseTotal,
  getItemDiscountAmount,
  getItemNetTotal,
} from "@/lib/proposal-engine";
import { t, formatEuro, standardPaymentTerms } from "@/lib/proposal-i18n";
import { downloadProposalDocx } from "@/lib/proposal-docx";
import type {
  ProposalLanguage,
  ProposalPlan,
  ProposalItem,
  ImplementationType,
  ProposalHosting,
  Proposal,
  ProposalLineDiscountType,
} from "@/types/proposal";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  defaultClientName: string;
  defaultCountry?: string | null;
  editingProposal?: (Proposal & { items?: ProposalItem[] }) | null;
}

const STEPS = ["Basic", "Software", "Services", "Terms", "Preview", "Generate"];

export function CreateProposalDialog({ open, onOpenChange, leadId, defaultClientName, defaultCountry, editingProposal = null }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rules = [] } = usePricingRules();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [language, setLanguage] = useState<ProposalLanguage>("EN");
  const [plan, setPlan] = useState<ProposalPlan>(1);
  const [hosting, setHosting] = useState<ProposalHosting>("SaaS");
  const [clientName, setClientName] = useState(defaultClientName);
  const [projectName, setProjectName] = useState("Maintenance Software Implementation");
  const [proposalDate, setProposalDate] = useState(new Date().toISOString().split("T")[0]);
  const [validityDays, setValidityDays] = useState(60);
  const [country, setCountry] = useState(defaultCountry || "");

  // Step 2
  const [includeRequests, setIncludeRequests] = useState(false);
  const [webUsers, setWebUsers] = useState(0);

  // Step 3
  const [implType, setImplType] = useState<ImplementationType>("Online");
  const [onsiteDays, setOnsiteDays] = useState(0);
  const [softwareDiscountPct, setSoftwareDiscountPct] = useState(0);
  const [servicesDiscountPct, setServicesDiscountPct] = useState(0);
  const [planDiscountPct, setPlanDiscountPct] = useState(0);
  const [requestsDiscountPct, setRequestsDiscountPct] = useState(0);
  const [webUsersDiscountPct, setWebUsersDiscountPct] = useState(0);

  // Step 4
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");

  // Items (editable)
  const [items, setItems] = useState<ProposalItem[]>([]);

  useEffect(() => {
    if (open) {
      setStep(0);
      setClientName(defaultClientName);
      setCountry(defaultCountry || "");
    }
  }, [open, defaultClientName, defaultCountry]);

  useEffect(() => {
    if (!open || !editingProposal) return;
    setStep(0);
    setLanguage(editingProposal.language);
    setPlan(editingProposal.plan);
    setHosting(editingProposal.hosting);
    setClientName(editingProposal.client_name);
    setProjectName(editingProposal.project_name || "Maintenance Software Implementation");
    setProposalDate(editingProposal.proposal_date);
    setValidityDays(editingProposal.validity_days);
    setCountry(editingProposal.country || "");
    setIncludeRequests(editingProposal.include_requests_module);
    setWebUsers(editingProposal.web_users);
    setImplType(editingProposal.implementation_type);
    setOnsiteDays(Number(editingProposal.service_days || 0));
    setSoftwareDiscountPct(Number(editingProposal.software_discount_pct || 0));
    setServicesDiscountPct(Number(editingProposal.services_discount_pct || 0));
    setPaymentTerms(editingProposal.payment_terms || standardPaymentTerms(editingProposal.language));
    setNotes(editingProposal.notes || "");
    if (editingProposal.items?.length) {
      setItems(editingProposal.items);
      const planItem = editingProposal.items.find((item) => item.item_code === `plan_${editingProposal.plan}_annual`);
      const requestsItem = editingProposal.items.find((item) => item.item_code === "requests_module");
      const webItem = editingProposal.items.find((item) => item.item_code === "web_user");
      setPlanDiscountPct(planItem?.discount_type === "percent" ? Number(planItem.discount_value || 0) : 0);
      setRequestsDiscountPct(requestsItem?.discount_type === "percent" ? Number(requestsItem.discount_value || 0) : 0);
      setWebUsersDiscountPct(webItem?.discount_type === "percent" ? Number(webItem.discount_value || 0) : 0);
    }
  }, [open, editingProposal]);

  // Default payment terms in selected language
  useEffect(() => {
    setPaymentTerms(standardPaymentTerms(language));
  }, [language]);

  // Auto-rebuild items whenever plan/services/options change
  useEffect(() => {
    if (rules.length === 0) return;
    if (editingProposal?.items?.length && open) return;
    setItems(
      buildDefaultItems({
        rules,
        plan,
        implementationType: implType,
        includeRequestsModule: includeRequests,
        webUsers,
        onsiteDays,
        language,
      }),
    );
  }, [rules, plan, implType, includeRequests, webUsers, onsiteDays, language]);

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        let discountValue = 0;
        let discountType: ProposalLineDiscountType = "none";

        if (item.item_code === `plan_${plan}_annual` && planDiscountPct > 0) {
          discountType = "percent";
          discountValue = planDiscountPct;
        } else if (item.item_code === "requests_module" && requestsDiscountPct > 0) {
          discountType = "percent";
          discountValue = requestsDiscountPct;
        } else if (item.item_code === "web_user" && webUsersDiscountPct > 0) {
          discountType = "percent";
          discountValue = webUsersDiscountPct;
        } else if (
          (item.item_code === `plan_${plan}_annual` || item.item_code === "requests_module" || item.item_code === "web_user") &&
          item.discount_type === "percent"
        ) {
          discountType = "none";
          discountValue = 0;
        } else {
          return item;
        }

        if ((item.discount_type || "none") === discountType && Number(item.discount_value || 0) === discountValue) {
          return item;
        }

        return { ...item, discount_type: discountType, discount_value: discountValue, is_override: true };
      }),
    );
  }, [plan, planDiscountPct, requestsDiscountPct, webUsersDiscountPct]);

  const totals = useMemo(
    () => computeTotals(items, softwareDiscountPct, servicesDiscountPct),
    [items, softwareDiscountPct, servicesDiscountPct],
  );
  const previewItems = useMemo(
    () => items.map((item) => enrichProposalItem(item, softwareDiscountPct, servicesDiscountPct)),
    [items, softwareDiscountPct, servicesDiscountPct],
  );
  const i18n = t(language);

  const updateItem = (idx: number, patch: Partial<ProposalItem>) => {
    setItems((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch, is_override: true };
      merged.total = recomputeItemTotal(merged);
      next[idx] = merged;
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addCustomItem = () => {
    setItems((prev) => [
      ...prev,
      {
        category: "custom",
        item_code: null,
        item_name: "Custom item",
        description: "",
        qty: 1,
        unit_price: 0,
        frequency: "one-time",
        total: 0,
        discount_type: "none",
        discount_value: 0,
        is_override: true,
        is_recurring: false,
        sort_order: prev.length,
      },
    ]);
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const persistProposal = async (status: "Draft" | "Ready" = "Draft"): Promise<Proposal | null> => {
    setSaving(true);
    try {
      const insertData: any = {
        lead_id: leadId,
        version: editingProposal?.version || 1,
        language,
        plan,
        status,
        hosting,
        client_name: clientName,
        project_name: projectName || null,
        country: country || null,
        proposal_date: proposalDate,
        validity_days: validityDays,
        payment_terms: paymentTerms,
        notes: notes || null,
        implementation_type: implType,
        per_diem: 0,
        discount_pct: 0,
        discount_scope: "none",
        software_discount_pct: softwareDiscountPct,
        services_discount_pct: servicesDiscountPct,
        include_requests_module: includeRequests,
        web_users: webUsers,
        service_days: onsiteDays || null,
        software_subtotal: totals.softwareSubtotal,
        services_subtotal: totals.servicesSubtotal,
        discount_amount: totals.discountAmount,
        total_year_1: totals.totalYear1,
        total_recurring: totals.totalRecurring,
        created_by: user?.id || null,
      };
      const propResponse = editingProposal?.id
        ? await supabase.from("proposals").update(insertData).eq("id", editingProposal.id).select().single()
        : await supabase.from("proposals").insert(insertData).select().single();
      const { data: prop, error } = propResponse;
      if (error) throw error;

      if (editingProposal?.id) {
        const { error: deleteItemsError } = await supabase.from("proposal_items").delete().eq("proposal_id", editingProposal.id);
        if (deleteItemsError) throw deleteItemsError;
      }

      // Insert items
      const itemRows = items.map((it, idx) => ({
        proposal_id: prop.id,
        category: it.category,
        item_code: it.item_code,
        item_name: it.item_name,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
        frequency: it.frequency,
        total: it.gross_total ?? getItemBaseTotal(it),
        discount_type: it.discount_type || "none",
        discount_value: Number(it.discount_value || 0),
        gross_total: Number(it.gross_total ?? getItemBaseTotal(it)),
        discount_amount: Number(it.discount_amount || 0),
        net_total: Number(it.net_total ?? getItemNetTotal(it, it.is_recurring ? softwareDiscountPct : servicesDiscountPct)),
        is_override: it.is_override,
        is_recurring: it.is_recurring,
        sort_order: idx,
      }));
      if (itemRows.length > 0) {
        const { error: itErr } = await supabase.from("proposal_items").insert(itemRows);
        if (itErr) throw itErr;
      }
      await supabase.from("deals").update({ expected_value: totals.totalYear1 }).eq("id", leadId);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["deal", leadId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      return prop as unknown as Proposal;
    } catch (e: any) {
      toast.error(e?.message || "Failed to save proposal");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    const prop = await persistProposal("Draft");
    if (prop) {
      toast.success(editingProposal ? "Proposal updated" : "Draft saved");
      onOpenChange(false);
    }
  };

  const handleGenerate = async () => {
    const prop = await persistProposal("Ready");
    if (!prop) return;
    try {
      // Add ids to items for renderer
      const itemsForDoc = items.map((it, idx) => ({ ...it, sort_order: idx }));
      const { fileName } = await downloadProposalDocx(prop, itemsForDoc);
      // Optionally upload to storage
      try {
        const blob = (await downloadProposalDocx(prop, itemsForDoc)).blob;
        const path = `${leadId}/${prop.id}/${fileName}`;
        const { error: upErr } = await supabase.storage.from("proposals").upload(path, blob, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("proposals").getPublicUrl(path);
          await supabase
            .from("proposals")
            .update({ docx_url: pub.publicUrl, generated_at: new Date().toISOString() })
            .eq("id", prop.id);
        }
      } catch {
        /* upload best-effort */
      }
      toast.success(editingProposal ? "Proposal updated" : "Proposal generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Generation failed: " + (e?.message || ""));
    }
  };

  const formatPrice = (n: number) => formatEuro(n, language);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {editingProposal ? `Edit Proposal v${editingProposal.version}` : "New Proposal"} — {STEPS[step]}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mt-2">
          {STEPS.map((label, idx) => (
            <div key={label} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  idx <= step ? "bg-primary" : "bg-secondary"
                }`}
              />
              <p
                className={`text-[10px] mt-1 text-center ${
                  idx === step ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {/* STEP 0: Basic */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Language</Label>
                  <Select value={language} onValueChange={(v) => setLanguage(v as ProposalLanguage)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EN">English</SelectItem>
                      <SelectItem value="PT">Portuguese</SelectItem>
                      <SelectItem value="ES">Spanish</SelectItem>
                      <SelectItem value="RO">Romanian (preview)</SelectItem>
                      <SelectItem value="TH">Thai (preview)</SelectItem>
                    </SelectContent>
                  </Select>
                  {(language === "RO" || language === "TH") && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Translation incomplete — missing labels will fall back to English.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Plan</Label>
                  <Select value={String(plan)} onValueChange={(v) => setPlan(Number(v) as ProposalPlan)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Plan 1 — Maintenance</SelectItem>
                      <SelectItem value="2">Plan 2 — Maint + Stock + PO</SelectItem>
                      <SelectItem value="3">Plan 3 — All modules + API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hosting</Label>
                  <Select value={hosting} onValueChange={(v) => setHosting(v as ProposalHosting)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SaaS">SaaS</SelectItem>
                      <SelectItem value="On-Premise">On-Premise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div>
                  <Label>Project Name</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Proposal Date</Label>
                  <Input type="date" value={proposalDate} onChange={(e) => setProposalDate(e.target.value)} />
                </div>
                <div>
                  <Label>Validity (days)</Label>
                  <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value) || 60)} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: Software */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-secondary/40 border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Plan {plan} — auto-included modules</h4>
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_INCLUDES[plan].map((m) => (
                    <Badge key={m} variant="secondary" className="text-[11px]">{m}</Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Modules cannot be selected manually — they are determined by the plan.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Maintenance Requests Module</p>
                    <p className="text-[11px] text-muted-foreground">+ 600 € / year</p>
                  </div>
                  <Switch checked={includeRequests} onCheckedChange={setIncludeRequests} />
                </div>
                <div className="bg-card border rounded-lg p-3">
                  <Label className="text-xs">Additional WEB users</Label>
                  <Input
                    type="number"
                    min={0}
                    value={webUsers}
                    onChange={(e) => setWebUsers(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">20 € / user / month</p>
                </div>
              </div>
              <div className="bg-card border rounded-lg p-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Professional plan discount %</Label>
                    <Input type="number" min={0} max={100} value={planDiscountPct} onChange={(e) => setPlanDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                  </div>
                  <div>
                    <Label className="text-xs">Requests Module discount %</Label>
                    <Input type="number" min={0} max={100} value={requestsDiscountPct} onChange={(e) => setRequestsDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                  </div>
                  <div>
                    <Label className="text-xs">Web/Mobile users discount %</Label>
                    <Input type="number" min={0} max={100} value={webUsersDiscountPct} onChange={(e) => setWebUsersDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Each software line can be discounted independently; recurring totals use the discounted net values.</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Backoffice users: <strong>1 included</strong> (additional not allowed by ManWinWin policy).
              </p>
            </div>
          )}

          {/* STEP 2: Services */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Implementation Type</Label>
                  <Select value={implType} onValueChange={(v) => setImplType(v as ImplementationType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Online">Online Implementation (default)</SelectItem>
                      <SelectItem value="Light Implementation">Light Implementation</SelectItem>
                      <SelectItem value="Onsite">Onsite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Services discount %</Label>
                  <Input type="number" min={0} max={100} value={servicesDiscountPct}
                    onChange={(e) => setServicesDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                </div>
              </div>
              {implType === "Onsite" && (
                <div>
                  <Label>Onsite days</Label>
                  <Input
                    type="number"
                    min={0}
                    value={onsiteDays}
                    onChange={(e) => setOnsiteDays(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Daily rate is taken from the active onsite pricing rule.
                  </p>
                </div>
              )}
              <div className="bg-secondary/30 border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  Service items are auto-loaded based on plan + implementation type. You can edit prices in the Preview step.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Terms */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label>Payment Terms</Label>
                <Textarea rows={4} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </div>
              <div>
                <Label>Notes / Special Conditions</Label>
                <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          {/* STEP 4: Preview */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-secondary/50 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Line Items (editable)</h4>
                  <Button size="sm" variant="outline" onClick={addCustomItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add custom
                  </Button>
                </div>
                <div className="divide-y">
                  {previewItems.map((it, idx) => (
                    <div key={idx} className="p-3 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <Label className="text-[10px]">Item</Label>
                        <Input value={it.item_name} onChange={(e) => updateItem(idx, { item_name: e.target.value })} className="h-8" />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-[10px]">Qty</Label>
                        <Input type="number" value={it.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 0 })} className="h-8" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px]">Unit price</Label>
                        <Input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })} className="h-8" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px]">Frequency</Label>
                        <Select value={it.frequency} onValueChange={(v) => updateItem(idx, { frequency: v as any, is_recurring: v !== "one-time" })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one-time">one-time</SelectItem>
                            <SelectItem value="yearly">yearly</SelectItem>
                            <SelectItem value="monthly">monthly</SelectItem>
                            <SelectItem value="per-user-month">per user / month</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px]">Discount</Label>
                        <div className="grid grid-cols-2 gap-1">
                          <Select value={it.discount_type || "none"} onValueChange={(v) => updateItem(idx, { discount_type: v as ProposalLineDiscountType, discount_value: v === "none" ? 0 : it.discount_value || 0 })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="percent">%</SelectItem>
                              <SelectItem value="fixed">€</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input type="number" className="h-8" value={it.discount_value || 0} onChange={(e) => updateItem(idx, { discount_value: Number(e.target.value) || 0 })} />
                        </div>
                      </div>
                      <div className="col-span-1 text-right">
                        <Label className="text-[10px]">Gross</Label>
                        <p className="text-sm font-medium text-foreground tabular-nums">{formatPrice(it.gross_total || 0)}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <Label className="text-[10px]">Discount</Label>
                        <p className="text-sm font-medium text-foreground tabular-nums">{it.discount_amount ? `-${formatPrice(it.discount_amount)}` : "—"}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <Label className="text-[10px]">Net</Label>
                        <p className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(it.net_total || 0)}</p>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No items</div>}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-card border rounded-lg p-4 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Software gross subtotal</span><span className="font-medium">{formatPrice(totals.softwareGrossSubtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Software discount total</span><span className="font-medium">{totals.softwareDiscountAmount ? `-${formatPrice(totals.softwareDiscountAmount)}` : "—"}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Software net subtotal</span><span className="font-medium">{formatPrice(totals.softwareSubtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Services gross subtotal</span><span className="font-medium">{formatPrice(totals.servicesGrossSubtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Services discount total</span><span className="font-medium">{totals.servicesDiscountAmount ? `-${formatPrice(totals.servicesDiscountAmount)}` : "—"}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Services net subtotal</span><span className="font-medium">{formatPrice(totals.servicesSubtotal)}</span></div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-base font-bold"><span>{i18n.year1}</span><span className="text-primary">{formatPrice(totals.totalYear1)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{i18n.year2Onwards}</span><span className="font-medium">{formatPrice(totals.totalRecurring)} {i18n.perYear}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Generate */}
          {step === 5 && (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Ready to generate</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Plan {plan} · {hosting} · {language} · Year 1: <strong>{formatPrice(totals.totalYear1)}</strong>
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>Save as Draft</Button>
                <Button onClick={handleGenerate} disabled={saving}>
                  <Download className="h-4 w-4 mr-2" />Generate DOCX
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Wizard footer */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={back} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={next}>
              Next<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <span />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

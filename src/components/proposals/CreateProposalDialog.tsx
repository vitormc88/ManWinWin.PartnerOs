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
  getItemEffectiveDiscount,
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
  ProposalProductFamily,
  ProposalLicenseModel,
  ProposalMode,
  ProposalDeployment,
} from "@/types/proposal";
import { useAuth } from "@/contexts/AuthContext";
import {
  BusinessSoftwareStep,
  BusinessServicesStep,
  BusinessPreviewStep,
} from "./BusinessSteps";
import {
  computeBusinessOption,
  computeBusinessOptions,
  DEFAULT_BUSINESS_CONFIG,
  type BusinessConfig,
} from "@/lib/proposal-business-engine";

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

  // Business product family fields
  const [productFamily, setProductFamily] = useState<ProposalProductFamily>("Professional");
  const [proposalMode, setProposalMode] = useState<ProposalMode>("compare_keepit_useit");
  const [deployment, setDeployment] = useState<ProposalDeployment>("saas");
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(DEFAULT_BUSINESS_CONFIG);

  const isBusiness = productFamily === "Business";

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
  // Renewal toggles (default OFF — discounts apply to Year 1 only)
  const [planDiscountRenews, setPlanDiscountRenews] = useState(false);
  const [requestsDiscountRenews, setRequestsDiscountRenews] = useState(false);
  const [webUsersDiscountRenews, setWebUsersDiscountRenews] = useState(false);

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
    const fam: ProposalProductFamily = (editingProposal.product_family as any) || "Professional";
    setProductFamily(fam);
    if (fam === "Business") {
      setProposalMode((editingProposal.proposal_mode as ProposalMode) || "compare_keepit_useit");
      setDeployment((editingProposal.deployment as ProposalDeployment) || "saas");
      setHosting(editingProposal.deployment === "on_premise" ? "On-Premise" : "SaaS");
      const savedCfg = (editingProposal as any).business_config;
      if (savedCfg && typeof savedCfg === "object") {
        // Merge with defaults so newly added fields (e.g. discounts) are present.
        setBusinessConfig({
          ...DEFAULT_BUSINESS_CONFIG,
          ...savedCfg,
          implementation: {
            ...DEFAULT_BUSINESS_CONFIG.implementation,
            ...(savedCfg.implementation || {}),
          },
          discounts: {
            ...DEFAULT_BUSINESS_CONFIG.discounts,
            ...(savedCfg.discounts || {}),
          },
        });
      }
    } else {
      setHosting("SaaS"); // Professional plans are SaaS-only
    }
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
      setPlanDiscountRenews(Boolean(planItem?.apply_discount_to_renewal));
      setRequestsDiscountRenews(Boolean(requestsItem?.apply_discount_to_renewal));
      setWebUsersDiscountRenews(Boolean(webItem?.apply_discount_to_renewal));
      // Seed Services discount % from saved service-line discounts.
      // If all service lines share the same % discount, treat that as the
      // section input. Otherwise leave at 0 (user can re-enter or keep the
      // overrides per line).
      const serviceItems = editingProposal.items.filter((item) => item.category === "service");
      const seenPcts = new Set<number>();
      let allPercent = serviceItems.length > 0;
      for (const sv of serviceItems) {
        if (sv.discount_type === "percent" && Number(sv.discount_value || 0) > 0) {
          seenPcts.add(Number(sv.discount_value || 0));
        } else {
          allPercent = false;
          break;
        }
      }
      if (allPercent && seenPcts.size === 1) {
        setServicesDiscountPct(Number([...seenPcts][0]));
      } else if (Number(editingProposal.services_discount_pct || 0) > 0) {
        // Backwards compatibility for proposals saved before line materialization.
        setServicesDiscountPct(Number(editingProposal.services_discount_pct || 0));
      } else {
        setServicesDiscountPct(0);
      }
    }
  }, [open, editingProposal]);

  // Default payment terms in selected language
  useEffect(() => {
    setPaymentTerms(standardPaymentTerms(language));
  }, [language]);

  // Reset Requests discount when the Requests Module is turned off
  useEffect(() => {
    if (!includeRequests) {
      setRequestsDiscountPct(0);
      setRequestsDiscountRenews(false);
    }
  }, [includeRequests]);

  // Auto-rebuild items whenever plan/services/options change (Professional only)
  useEffect(() => {
    if (isBusiness) return;
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
  }, [rules, plan, implType, includeRequests, webUsers, onsiteDays, language, isBusiness]);

  // Keep Business config deployment field in sync with the wizard's deployment selector
  useEffect(() => {
    if (!isBusiness) return;
    setBusinessConfig((prev) => (prev.deployment === deployment ? prev : { ...prev, deployment }));
  }, [deployment, isBusiness]);

  // Propagate the per-step discount inputs as line-item discounts.
  // Services use the same model as Software: the wizard input becomes a
  // normal % line discount on each service item (auto-managed, source = "auto").
  // The user can still override any line manually in the Preview step.
  useEffect(() => {
    if (isBusiness) return;
    setItems((prev) =>
      prev.map((item) => {
        const isService = item.category === "service";
        let discountValue = 0;
        let discountType: ProposalLineDiscountType = "none";
        let renews = false;
        let managed = false;

        if (item.item_code === `plan_${plan}_annual`) {
          managed = true;
          if (planDiscountPct > 0) {
            discountType = "percent";
            discountValue = planDiscountPct;
            renews = planDiscountRenews;
          }
        } else if (item.item_code === "requests_module") {
          managed = true;
          if (requestsDiscountPct > 0) {
            discountType = "percent";
            discountValue = requestsDiscountPct;
            renews = requestsDiscountRenews;
          }
        } else if (item.item_code === "web_user") {
          managed = true;
          if (webUsersDiscountPct > 0) {
            discountType = "percent";
            discountValue = webUsersDiscountPct;
            renews = webUsersDiscountRenews;
          }
        } else if (isService) {
          // Auto-apply Services discount % as a line-item discount on every
          // service line UNLESS the user has manually overridden that line.
          if (item.is_override && (item.discount_type === "percent" || item.discount_type === "fixed") && Number(item.discount_value || 0) > 0 && Number(item.discount_value || 0) !== Number(servicesDiscountPct || 0)) {
            return item; // manual override — keep user's value
          }
          managed = true;
          if (servicesDiscountPct > 0) {
            discountType = "percent";
            discountValue = servicesDiscountPct;
          }
        } else {
          return item;
        }

        if (!managed) return item;

        const currentType = item.discount_type || "none";
        const currentValue = Number(item.discount_value || 0);
        const currentRenews = Boolean(item.apply_discount_to_renewal);
        if (currentType === discountType && currentValue === discountValue && currentRenews === renews) {
          return item;
        }

        return {
          ...item,
          discount_type: discountType,
          discount_value: discountValue,
          apply_discount_to_renewal: renews,
          // Mark as override only if there's an actual discount; otherwise
          // leave is_override flag untouched so user-specific overrides
          // (qty, name, price) aren't reset by zero-discount paths.
          is_override: discountValue > 0 ? true : item.is_override,
        };
      }),
    );
  }, [plan, planDiscountPct, requestsDiscountPct, webUsersDiscountPct, servicesDiscountPct, planDiscountRenews, requestsDiscountRenews, webUsersDiscountRenews, isBusiness]);

  // ----- Business totals (in-memory only; not stored in proposal_items) -----
  const businessResult = useMemo(() => {
    if (!isBusiness) return null;
    const models: ProposalLicenseModel[] =
      proposalMode === "keepit_only"
        ? ["keepit"]
        : proposalMode === "useit_only"
        ? ["useit"]
        : ["keepit", "useit"];
    return computeBusinessOptions(rules, businessConfig, models);
  }, [isBusiness, rules, businessConfig, proposalMode]);

  /** Pick the "headline" option for KPI/expected-value purposes (KeepIT preferred). */
  const businessHeadline = useMemo(() => {
    if (!businessResult) return null;
    return businessResult.keepit || businessResult.useit;
  }, [businessResult]);

  // We materialize Services discount % onto each service line (above), so we
  // pass 0 here to avoid double-applying. Software section discount has been
  // disabled in the wizard for some time and is also passed as 0.
  const totals = useMemo(
    () => computeTotals(items, 0, 0),
    [items],
  );
  const previewItems = useMemo(
    () => items.map((item) => enrichProposalItem(item, 0, 0)),
    [items],
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

  /** Compute next available version number for this lead. */
  const computeNextVersion = async (): Promise<number> => {
    const { data: siblings } = await supabase
      .from("proposals")
      .select("version")
      .eq("lead_id", leadId)
      .order("version", { ascending: false })
      .limit(1);
    return (siblings?.[0]?.version || 0) + 1;
  };

  const persistProposal = async (status: "Draft" | "Ready" = "Draft"): Promise<Proposal | null> => {
    setSaving(true);
    try {
      // Auto-assign version on first save (new proposal). Editing keeps existing version.
      const versionForInsert = editingProposal?.version || (await computeNextVersion());
      const insertData: any = {
        lead_id: leadId,
        version: versionForInsert,
        language,
        plan,
        status,
        hosting: isBusiness ? (deployment === "saas" ? "SaaS" : "On-Premise") : hosting,
        product_family: productFamily,
        license_model: isBusiness
          ? proposalMode === "keepit_only"
            ? "keepit"
            : proposalMode === "useit_only"
            ? "useit"
            : null
          : null,
        proposal_mode: isBusiness ? proposalMode : null,
        deployment: isBusiness ? deployment : null,
        business_config: isBusiness ? (businessConfig as any) : null,
        client_name: clientName,
        project_name: projectName || null,
        country: country || null,
        proposal_date: proposalDate,
        validity_days: validityDays,
        payment_terms: paymentTerms,
        notes: notes || null,
        implementation_type: isBusiness ? "Online" : implType,
        per_diem: 0,
        discount_pct: 0,
        discount_scope: "none",
        software_discount_pct: 0,
        services_discount_pct: 0,
        include_requests_module: isBusiness ? businessConfig.includeRequests : includeRequests,
        web_users: isBusiness ? businessConfig.additionalWebUsers : webUsers,
        service_days: isBusiness ? null : onsiteDays || null,
        software_subtotal: isBusiness ? businessHeadline?.licenseSubtotal || 0 : totals.softwareSubtotal,
        services_subtotal: isBusiness
          ? (businessHeadline?.services.reduce((s, l) => s + l.amount, 0) || 0)
          : totals.servicesSubtotal,
        discount_amount: isBusiness ? 0 : totals.discountAmount,
        total_year_1: isBusiness ? businessHeadline?.totalYear1 || 0 : totals.totalYear1,
        total_recurring: isBusiness ? businessHeadline?.totalYear2Plus || 0 : totals.totalRecurring,
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

      // Build item rows. For Business, snapshot the headline option's lines so
      // the proposal carries a persisted breakdown for the Proposals tab.
      let itemRows: any[] = [];
      if (isBusiness && businessHeadline) {
        const lines = [
          ...businessHeadline.software,
          ...(businessHeadline.api ? [businessHeadline.api] : []),
          ...businessHeadline.hosting,
          ...(businessHeadline.sat ? [businessHeadline.sat] : []),
          ...businessHeadline.services,
        ];
        itemRows = lines.map((l, idx) => ({
          proposal_id: prop.id,
          category: l.category === "service" ? "service" : l.category === "module" || l.category === "plugin" ? "software" : "addon",
          item_code: l.code,
          item_name: l.label,
          description: null,
          qty: l.qty,
          unit_price: l.unitPrice,
          frequency: l.frequency,
          total: l.amount,
          discount_type: "none",
          discount_value: 0,
          gross_total: l.amount,
          discount_amount: 0,
          net_total: l.amount,
          is_override: false,
          is_recurring: l.recurring,
          apply_discount_to_renewal: false,
          sort_order: idx,
        }));
      } else {
        itemRows = items.map((it, idx) => {
          const enriched = enrichProposalItem(it, 0, 0);
          return {
            proposal_id: prop.id,
            category: it.category,
            item_code: it.item_code,
            item_name: it.item_name,
            description: it.description,
            qty: it.qty,
            unit_price: it.unit_price,
            frequency: it.frequency,
            total: enriched.gross_total ?? getItemBaseTotal(it),
            discount_type: it.discount_type || "none",
            discount_value: Number(it.discount_value || 0),
            gross_total: Number(enriched.gross_total ?? getItemBaseTotal(it)),
            discount_amount: Number(enriched.discount_amount || 0),
            net_total: Number(enriched.net_total ?? getItemNetTotal(it, 0)),
            is_override: it.is_override,
            is_recurring: it.is_recurring,
            apply_discount_to_renewal: Boolean(it.apply_discount_to_renewal),
            sort_order: idx,
          };
        });
      }
      if (itemRows.length > 0) {
        const { error: itErr } = await supabase.from("proposal_items").insert(itemRows);
        if (itErr) throw itErr;
      }
      const expectedValue = isBusiness ? businessHeadline?.totalYear1 || 0 : totals.totalYear1;
      await supabase.from("deals").update({ expected_value: expectedValue }).eq("id", leadId);
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
                  <Label>Product family</Label>
                  <Select value={productFamily} onValueChange={(v) => setProductFamily(v as ProposalProductFamily)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Professional">Professional</SelectItem>
                      <SelectItem value="Business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isBusiness && (
                  <>
                    <div>
                      <Label>Proposal mode</Label>
                      <Select value={proposalMode} onValueChange={(v) => setProposalMode(v as ProposalMode)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="compare_keepit_useit">Compare KeepIT vs UseIT</SelectItem>
                          <SelectItem value="keepit_only">KeepIT only</SelectItem>
                          <SelectItem value="useit_only">UseIT only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Hosting</Label>
                      <Select value={deployment} onValueChange={(v) => setDeployment(v as ProposalDeployment)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="saas">SaaS</SelectItem>
                          <SelectItem value="on_premise">On-Premise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
              <div className={`grid ${isBusiness ? "grid-cols-1" : "grid-cols-3"} gap-4`}>
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
                {!isBusiness && (
                  <>
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
                      <Select value="SaaS" disabled onValueChange={(v) => setHosting(v as ProposalHosting)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SaaS">SaaS</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Professional plans are SaaS-only. On-Premise will be available for Business proposals.</p>
                    </div>
                  </>
                )}
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
          {step === 1 && isBusiness && (
            <BusinessSoftwareStep
              rules={rules}
              language={language}
              config={businessConfig}
              onChange={setBusinessConfig}
              proposalMode={proposalMode}
            />
          )}
          {step === 1 && !isBusiness && (
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
              <div className="bg-card border rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Professional plan discount %</Label>
                    <Input type="number" min={0} max={100} value={planDiscountPct} onChange={(e) => setPlanDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                    <div className="flex items-center justify-between mt-2">
                      <Label className="text-[11px] text-muted-foreground">Apply to renewals</Label>
                      <Switch checked={planDiscountRenews} onCheckedChange={setPlanDiscountRenews} disabled={planDiscountPct <= 0} />
                    </div>
                  </div>
                  <div className={!includeRequests ? "opacity-50 pointer-events-none" : ""}>
                    <Label className="text-xs">Requests Module discount %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={includeRequests ? requestsDiscountPct : 0}
                      onChange={(e) => setRequestsDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      disabled={!includeRequests}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <Label className="text-[11px] text-muted-foreground">Apply to renewals</Label>
                      <Switch checked={requestsDiscountRenews} onCheckedChange={setRequestsDiscountRenews} disabled={!includeRequests || requestsDiscountPct <= 0} />
                    </div>
                    {!includeRequests && (
                      <p className="text-[10px] text-muted-foreground mt-1 italic">Enable Requests Module to set a discount.</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Web/Mobile users discount %</Label>
                    <Input type="number" min={0} max={100} value={webUsersDiscountPct} onChange={(e) => setWebUsersDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                    <div className="flex items-center justify-between mt-2">
                      <Label className="text-[11px] text-muted-foreground">Apply to renewals</Label>
                      <Switch checked={webUsersDiscountRenews} onCheckedChange={setWebUsersDiscountRenews} disabled={webUsersDiscountPct <= 0} />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  By default, software discounts apply to <strong>Year 1 only</strong>. Toggle "Apply to renewals" to also discount Year 2 and following (e.g. negotiated volume discount on Web/Mobile users).
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Backoffice users: <strong>1 included</strong> (additional not allowed by ManWinWin policy).
              </p>
            </div>
          )}

          {/* STEP 2: Services */}
          {step === 2 && isBusiness && (
            <BusinessServicesStep
              rules={rules}
              language={language}
              config={businessConfig}
              onChange={setBusinessConfig}
              proposalMode={proposalMode}
            />
          )}
          {step === 2 && !isBusiness && (
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
          {step === 4 && isBusiness && (
            <BusinessPreviewStep
              rules={rules}
              language={language}
              config={businessConfig}
              onChange={setBusinessConfig}
              proposalMode={proposalMode}
            />
          )}
          {step === 4 && !isBusiness && (
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
                      {(() => {
                        // All discounts are now line-item — pass 0 here so we
                        // never read a "section" source. Both Software and
                        // Services line items use the same UI.
                        const effectiveDiscount = getItemEffectiveDiscount(it, 0, 0);
                        const hasNoDiscount = effectiveDiscount.amount === 0;
                        const discountSourceLabel =
                          effectiveDiscount.type === "percent"
                            ? `${effectiveDiscount.value}%`
                            : effectiveDiscount.type === "fixed"
                            ? `${effectiveDiscount.value} €`
                            : "—";
                        const grossYearly = it.gross_total || 0;
                        const netYearly = grossYearly - effectiveDiscount.amount;
                        const renewalValue = it.is_recurring
                          ? it.apply_discount_to_renewal
                            ? netYearly
                            : grossYearly
                          : 0;
                        return (
                          <>
                      <div className="col-span-3">
                        <Label className="text-[10px]">Item</Label>
                        <Input value={it.item_name} onChange={(e) => updateItem(idx, { item_name: e.target.value })} className="h-8" />
                        {it.is_recurring && effectiveDiscount.amount > 0 && (
                          <div className="flex items-center justify-between mt-1.5 px-1">
                            <span className="text-[10px] text-muted-foreground">Apply discount to renewals</span>
                            <Switch
                              checked={Boolean(it.apply_discount_to_renewal)}
                              onCheckedChange={(v) => updateItem(idx, { apply_discount_to_renewal: v })}
                            />
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                        <Label className="text-[10px]">Qty</Label>
                        <Input type="number" value={it.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 0 })} className="h-8" />
                      </div>
                      <div className="col-span-1">
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
                        <p className={`mt-1 text-[10px] ${effectiveDiscount.source === "line" ? "text-foreground" : "text-muted-foreground"}`}>{discountSourceLabel}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <Label className="text-[10px]">Gross</Label>
                        <p className="text-sm font-medium text-foreground tabular-nums">{formatPrice(grossYearly)}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <Label className="text-[10px]">Discount Y1</Label>
                        <p className="text-sm font-medium text-foreground tabular-nums">{hasNoDiscount ? "—" : `-${formatPrice(effectiveDiscount.amount)}`}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <Label className="text-[10px]">{it.is_recurring ? "Net Y1" : "Net"}</Label>
                        <p className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(netYearly)}</p>
                        {it.is_recurring && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Renewal: {formatPrice(renewalValue)}/yr
                          </p>
                        )}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                          </>
                        );
                      })()}
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
                  <div className="border-t mt-2 pt-2 space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Recurring gross (Y2+)</span><span className="font-medium">{formatPrice(totals.recurringGrossYearly)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Renewal discounts (Y2+)</span><span className="font-medium">{totals.recurringDiscountAmount ? `-${formatPrice(totals.recurringDiscountAmount)}` : "—"}</span></div>
                    <div className="flex justify-between text-sm font-semibold"><span>{i18n.year2Onwards}</span><span className="text-primary">{formatPrice(totals.totalRecurring)} {i18n.perYear}</span></div>
                  </div>
                  {totals.recurringDiscountAmount === 0 && totals.discountAmount > 0 && (
                    <p className="text-[10px] text-muted-foreground italic mt-2">
                      Discounts apply to Year 1 only. Toggle "Apply discount to renewals" on a recurring line to also discount Year 2+.
                    </p>
                  )}
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
              {isBusiness ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Save Business proposal</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {productFamily} · {deployment === "saas" ? "SaaS" : "On-Premise"} · {language}
                    </p>
                    {businessHeadline && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Year 1 (headline): <strong>{formatPrice(businessHeadline.totalYear1)}</strong>
                        {" · "}Year 2+: <strong>{formatPrice(businessHeadline.totalYear2Plus)}/yr</strong>
                      </p>
                    )}
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 max-w-md mx-auto">
                    <p className="text-xs text-amber-900 dark:text-amber-200">
                      <strong>Business document export coming soon.</strong> The proposal will be saved
                      with its full breakdown and totals, but DOCX/PDF generation is not enabled yet for
                      Business proposals.
                    </p>
                  </div>
                  <div className="flex justify-center gap-2">
                    <Button onClick={handleSaveDraft} disabled={saving}>Save proposal</Button>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
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

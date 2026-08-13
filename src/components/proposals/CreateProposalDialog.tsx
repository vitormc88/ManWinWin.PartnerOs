import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ChevronLeft, ChevronRight, FileText, Download, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePricingRules, useProposalItems } from "@/hooks/useProposals";
import {
  hydrateRenewalProposal,
  assertSafeRenewalOverwrite,
  implementationGrossFromItems,
} from "@/lib/renewal-proposal-hydration";
import {
  dealProposalSource,
  isRenewalSource,
  isClientSource,

  isValidProposalSource,
  buildProposalSourcePayload,
  proposalStoragePrefix,
  type ProposalSource,
} from "@/lib/proposal-source";
import { buildRenewalLinkArgs, renewalProposalRefreshKeys } from "@/lib/renewal-proposal-link";
import {
  normalizeProposalPayload,
  validateRenewalReadiness,
  resolveRenewalProjectName,
  defaultRenewalProjectName,
  GENERIC_PROJECT_NAME,
} from "@/lib/renewal-proposal-normalization";
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
import { buildProposalItemRows } from "@/lib/proposal-item-rows";
import { t, formatEuro, standardPaymentTerms } from "@/lib/proposal-i18n";
import { downloadProposalDocx } from "@/lib/proposal-docx";
import { downloadBusinessXlsx } from "@/lib/proposal-business-xlsx";
import { downloadBusinessProposalDocx } from "@/lib/proposal-business-docx";
import { printBusinessProposal } from "@/lib/proposal-business-print";
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
import { usePartner } from "@/hooks/usePartners";
import {
  getDiscountLimits,
  clampDiscountPct,
  validateProfessionalItems,
  validateBusinessDiscounts,
  lineDiscountKind,
} from "@/lib/proposal-discount-policy";
import {
  BusinessSoftwareStep,
  BusinessServicesStep,
  BusinessPreviewStep,
} from "./BusinessSteps";
import { checkBusinessPricingReadiness } from "@/lib/proposal-business-readiness";
import { CommercialWizard, type WizardResult } from "./CommercialWizard";
import { CommercialIntelligencePanel } from "./CommercialIntelligencePanel";
import { LICENSE_ORDER } from "@/lib/license-evolution";
import { useRenewalBaseline } from "@/hooks/useRenewalBaseline";
import { RenewalBaselinePanel } from "./RenewalBaselinePanel";
import { buildBaselineProposalItems, baselineLicenseModel } from "@/lib/renewal-baseline";
import { downloadRenewalProposalDocx } from "@/lib/proposal-renewal-docx";
import {
  computePlanChange,
  validatePlanChangeDiscounts,
  type ImplementationKind,
  type RenewalChangeMode,
} from "@/lib/renewal-plan-change";
import type { PlanTransitionRule } from "@/lib/renewal-implementation";
import { useQuery } from "@tanstack/react-query";
import { RenewalPlanChangePanel } from "./RenewalPlanChangePanel";


// Append a "[Staged from wizard]" line to the notes textarea without clobbering it.
function appendStagedLine(prev: string, line: string): string {
  const marker = "[Staged from wizard]";
  const suffix = `${marker} ${line}`;
  if (prev?.includes(suffix)) return prev;
  return prev ? `${prev}\n${suffix}` : suffix;
}
import {
  computeBusinessOption,
  computeBusinessOptions,
  DEFAULT_BUSINESS_CONFIG,
  type BusinessConfig,
} from "@/lib/proposal-business-engine";

export type CommercialProposalMode =
  | "upgrade_license"
  | "add_modules"
  | "add_plugins"
  | "add_users"
  | "change_hosting"
  | "renew_agreement"
  | "other";

/**
 * Where the Proposal Builder was launched from.
 * - "pipeline": legacy new-business flow (default when unset).
 * - "commercial_workspace": existing-customer flow launched from a client.
 */
export type ProposalLaunchSource = "pipeline" | "commercial_workspace";

/**
 * Snapshot of the existing customer's current commercial state.
 * Used to preload the Proposal Builder in Existing Customer Mode.
 * Consumed as read-only context; no calculations change based on it.
 */
export interface ExistingCustomerSnapshot {
  clientId?: string | null;
  clientName?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  license?: any | null;
  contract?: any | null;
  modules?: any[];
  plugins?: any[];
  backofficeUsers?: number | null;
  webUsers?: number | null;
  mobileUsers?: number | null;
  renewalDate?: string | null;
  /** Normalized license fields (single source of truth for Existing Customer Mode UI). */
  licenseFamily?: "Business" | "Professional" | null;
  licenseVariant?: string | null;
  licenseLabel?: string | null;
  deployment?: string | null;
  billingFrequency?: string | null;
  currency?: string | null;
  satActive?: boolean | null;
  apiAccess?: boolean | null;
  arr?: number | null;
  year1?: number | null;
}

export interface CommercialContext {
  /** Launch origin — defaults to "pipeline" when this whole object is absent. */
  source?: ProposalLaunchSource;
  mode: CommercialProposalMode;
  label: string;
  presetPlan?: ProposalPlan;
  presetWebUsers?: number;
  presetIncludeRequests?: boolean;
  presetProductFamily?: ProposalProductFamily;
  initialStep?: number;
  projectNameHint?: string;
  /** Full existing-customer snapshot (available to future UI, not used by engine). */
  existingCustomer?: ExistingCustomerSnapshot;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deal-sourced proposals (Pipeline). Ignored when `proposalSource` is provided. */
  leadId?: string;
  /** Typed source identity. Defaults to the deal identified by `leadId`. */
  proposalSource?: ProposalSource | null;
  defaultClientName: string;
  defaultCountry?: string | null;
  editingProposal?: (Proposal & { items?: ProposalItem[] }) | null;
  commercialContext?: CommercialContext | null;
  /** Historical/closed proposal: opened for inspection, never re-saved. */
  readOnly?: boolean;
}

const STEPS = ["Basic", "Software", "Services", "Terms", "Preview", "Generate"];

export function CreateProposalDialog({ open, onOpenChange, leadId, proposalSource = null, defaultClientName, defaultCountry, editingProposal = null, commercialContext = null, readOnly = false }: Props) {
  const source = useMemo<ProposalSource>(
    () => proposalSource ?? dealProposalSource(leadId),
    [proposalSource, leadId],
  );
  const isRenewalProposal = isRenewalSource(source);
  /** Existing customer, outside a renewal cycle (mid-cycle commercial action). */
  const isClientProposal = isClientSource(source);
  const storagePrefix = proposalStoragePrefix(source);

  // Renewals P0 — the real commercial baseline behind this renewal.
  const { baseline: renewalBaseline, isLoading: baselineLoading } = useRenewalBaseline(
    isRenewalProposal ? source.renewal_id : null,
  );
  /**
   * Renewals P0B — pricing mode only. True when the editable proposal lines
   * come from the real contract instead of the catalogue/configuration engine.
   * This says NOTHING about product identity.
   */
  const usesContractBaselineItems = isRenewalProposal && !!renewalBaseline?.hasRealData;

  /* ── Canonical hydration of an EXISTING proposal ─────────────────────
   * The caller may pass the proposal row without its items. The dialog is
   * the single place that guarantees the persisted line items are loaded,
   * so a saved renewal upgrade is never rendered (or re-saved) from
   * straight-renewal defaults. */
  const { data: fetchedItems, isLoading: fetchedItemsLoading } = useProposalItems(
    open && editingProposal?.id && !editingProposal?.items?.length ? editingProposal.id : undefined,
  );
  const persistedItems = useMemo<ProposalItem[] | null>(() => {
    if (!editingProposal?.id) return null;
    if (editingProposal.items?.length) return editingProposal.items;
    return fetchedItems ? (fetchedItems as ProposalItem[]) : null;
  }, [editingProposal, fetchedItems]);
  /** True while an existing proposal's own state is still being loaded. */
  const hydrationPending =
    !!editingProposal?.id && !editingProposal.items?.length && (fetchedItemsLoading || fetchedItems == null);
  const hydration = useMemo(
    () =>
      editingProposal?.id
        ? hydrateRenewalProposal({ proposal: editingProposal as any, items: persistedItems || [] })
        : null,
    [editingProposal, persistedItems],
  );


  const { user, profile, isHQ } = useAuth();
  const { data: actorPartner } = usePartner(profile?.partner_id || undefined);
  // Conservative limits while partner data is still missing/loading.
  const discountLimits = useMemo(
    () =>
      isHQ
        ? getDiscountLimits({ isHQ: true })
        : getDiscountLimits({ isHQ: false, partnershipLevel: actorPartner?.partnership_level ?? null }),
    [isHQ, actorPartner?.partnership_level],
  );
  const qc = useQueryClient();
  const {
    data: rules = [],
    isLoading: rulesLoading,
    error: rulesError,
  } = usePricingRules();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [wizardDone, setWizardDone] = useState(false);

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

  /** Product identity — drives labels, persisted fields and document type. */
  const isBusinessProduct = productFamily === "Business";
  /**
   * Business *catalogue pricing* engine. A Business renewal built from the real
   * contract keeps its Business identity but does not re-price from the catalogue.
   */
  const isBusinessCatalogue = isBusinessProduct && !usesContractBaselineItems;

  /**
   * Renewals P0C — commercial variant (KeepIT / UseIT).
   * The baseline value is authoritative; when the source does not record it the
   * user may pick one FOR THIS PROPOSAL ONLY (never written to the contract).
   */
  const baselineVariant = baselineLicenseModel(renewalBaseline);
  const [proposalVariant, setProposalVariant] = useState<"keepit" | "useit" | null>(null);
  const effectiveVariant = baselineVariant ?? proposalVariant;
  const selectedVariantLabel =
    renewalBaseline?.variantNeedsReview && effectiveVariant
      ? effectiveVariant === "keepit"
        ? "KeepIT"
        : "UseIT"
      : null;

  /** Renewals P0D — contract-driven renewal: no catalogue control applies. */
  const isContractRenewal = usesContractBaselineItems;

  /**
   * Renewal plan changes (upgrade / downgrade) — Professional renewals only.
   * A straight renewal keeps the current contract exactly as it is.
   */
  const [changeMode, setChangeMode] = useState<RenewalChangeMode>("straight");
  const [targetPlan, setTargetPlan] = useState<ProposalPlan | null>(null);
  const [implKind, setImplKind] = useState<ImplementationKind>("standard");
  const [implDiscountPct, setImplDiscountPct] = useState(0);
  /** Incremental implementation confirmed manually by HQ (precedence 2). */
  const [manualImplGross, setManualImplGross] = useState<number | null>(null);
  const [manualImplJustification, setManualImplJustification] = useState("");
  const planChangeAvailable = isContractRenewal && !isBusinessProduct;

  /** HQ-configured plan-transition rules (precedence 1). Read-only. */
  const { data: transitionRules = [] } = useQuery({
    queryKey: ["plan_transition_rules"],
    enabled: open && planChangeAvailable,
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_transition_rules" as any).select("*").eq("active", true);
      if (error) throw error;
      return (data || []) as unknown as PlanTransitionRule[];
    },
  });






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

  /**
   * Renewal plan change — pure computation from the real contract baseline and
   * the active pricing catalogue. Nothing here mutates any record.
   */
  const clampedImplDiscount = clampDiscountPct(implDiscountPct, discountLimits.services);
  const planChange = useMemo(
    () =>
      computePlanChange({
        baseline: renewalBaseline,
        rules,
        mode: planChangeAvailable ? changeMode : "straight",
        targetPlan,
        implementationKind: implKind,
        transitionRules,
        manualImplementation:
          manualImplGross != null
            ? {
                gross: manualImplGross,
                justification: manualImplJustification,
                authorized: isHQ,
                confirmedBy: user?.id ?? null,
              }
            : null,
        implementationDiscount: { type: "percent", value: clampedImplDiscount },
      }),
    [
      renewalBaseline,
      rules,
      planChangeAvailable,
      changeMode,
      targetPlan,
      implKind,
      clampedImplDiscount,
      transitionRules,
      manualImplGross,
      manualImplJustification,
      isHQ,
      user?.id,
    ],
  );

  const planChangeReady = planChange.applicable && planChange.blockers.length === 0;
  /** Re-apply the computed lines only when the change definition really moves. */
  const planChangeItemsKey = planChangeReady ? JSON.stringify(planChange.items) : null;
  const planChangeAppliedRef = useRef<string | null>(null);


  useEffect(() => {
    if (!open) return;
    setClientName(defaultClientName);
    setCountry(defaultCountry || "");
    if (editingProposal) { setWizardDone(true); return; }
    // Apply commercial context presets (existing-customer flows)
    if (commercialContext) {
      if (commercialContext.presetProductFamily) setProductFamily(commercialContext.presetProductFamily);
      if (commercialContext.presetPlan) setPlan(commercialContext.presetPlan);
      if (typeof commercialContext.presetWebUsers === "number") setWebUsers(commercialContext.presetWebUsers);
      if (typeof commercialContext.presetIncludeRequests === "boolean") setIncludeRequests(commercialContext.presetIncludeRequests);
      if (commercialContext.projectNameHint) setProjectName(commercialContext.projectNameHint);
      setStep(typeof commercialContext.initialStep === "number" ? commercialContext.initialStep : 0);
      const showWizard =
        commercialContext.source === "commercial_workspace" &&
        commercialContext.mode !== "other";
      setWizardDone(!showWizard);

      // Development-only diagnostic logging (Sprint I.6).
      if (import.meta.env?.DEV) {
        const snap = commercialContext.existingCustomer || {};
        // eslint-disable-next-line no-console
        console.log("[ProposalBuilder/ExistingCustomer]", {
          clientId: snap.clientId,
          mode: commercialContext.mode,
          licenseLabel: snap.licenseLabel,
          licenseFamily: snap.licenseFamily,
          licenseVariant: snap.licenseVariant,
          backofficeUsers: snap.backofficeUsers,
          webUsers: snap.webUsers,
          activeModules: (snap.modules || []).length,
          activePlugins: (snap.plugins || []).length,
          renewalDate: snap.renewalDate,
          satActive: snap.satActive,
        });
      }
    } else {
      setStep(0);
      setWizardDone(true);
    }
  }, [open, defaultClientName, defaultCountry, editingProposal, commercialContext]);



  useEffect(() => {
    if (!open || !editingProposal) return;
    setStep(0);
    setLanguage(editingProposal.language);
    setPlan((editingProposal.plan ?? 1) as ProposalPlan);
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
    setProjectName(
      isRenewalProposal
        ? resolveRenewalProjectName({ savedProjectName: editingProposal.project_name, clientName: editingProposal.client_name })
        : editingProposal.project_name || GENERIC_PROJECT_NAME,
    );
    setProposalDate(editingProposal.proposal_date);
    setValidityDays(editingProposal.validity_days);
    setCountry(editingProposal.country || "");
    setIncludeRequests(editingProposal.include_requests_module);
    setWebUsers(editingProposal.web_users);
    setImplType(editingProposal.implementation_type ?? "Online");
    setOnsiteDays(Number(editingProposal.service_days || 0));
    setSoftwareDiscountPct(Number(editingProposal.software_discount_pct || 0));
    setServicesDiscountPct(Number(editingProposal.services_discount_pct || 0));
    setPaymentTerms(editingProposal.payment_terms || standardPaymentTerms(editingProposal.language));
    setNotes(editingProposal.notes || "");
    const savedItems = persistedItems;
    if (savedItems?.length) {
      setItems(savedItems);
      const planItem = savedItems.find((item) => item.item_code === `plan_${editingProposal.plan ?? 1}_annual`);
      const requestsItem = savedItems.find((item) => item.item_code === "requests_module");
      const webItem = savedItems.find((item) => item.item_code === "web_user");
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
      // The incremental implementation line is governed by its own input.
      const serviceItems = savedItems.filter(
        (item) => item.category === "service" && item.change_kind !== "implementation_delta",
      );
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
  }, [open, editingProposal, persistedItems]);


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
    if (isBusinessProduct) return;
    // Renewals P0: never reset a real customer to Plan 1 + implementation.
    if (usesContractBaselineItems) return;
    if (rules.length === 0) return;
    // Never rebuild an existing proposal before its own state is hydrated.
    if (open && editingProposal?.id && (hydrationPending || persistedItems?.length)) return;
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
  }, [rules, plan, implType, includeRequests, webUsers, onsiteDays, language, isBusinessProduct, usesContractBaselineItems, hydrationPending, persistedItems]);

  // ── Renewals P0: prepopulate from the real contract baseline ──────────
  // Runs once per open, only when the proposal has no persisted state at all.
  useEffect(() => {
    if (!open || !usesContractBaselineItems || !renewalBaseline) return;
    // Hydration of an existing proposal always wins over the baseline.
    if (editingProposal?.id && (hydrationPending || persistedItems?.length)) return;
    if (renewalBaseline.productFamily) setProductFamily(renewalBaseline.productFamily);
    if (renewalBaseline.plan) setPlan(renewalBaseline.plan);
    if (renewalBaseline.hosting) {
      setHosting(renewalBaseline.hosting);
      setDeployment(renewalBaseline.hosting === "SaaS" ? "saas" : "on_premise");
    }
    // Keep the Business variant (KeepIT / UseIT) that the customer actually has.
    const variant = baselineLicenseModel(renewalBaseline);
    if (variant) setProposalMode(variant === "keepit" ? "keepit_only" : "useit_only");
    if (renewalBaseline.webUsers != null) setWebUsers(renewalBaseline.webUsers);
    // An ordinary renewal never carries implementation services.
    setOnsiteDays(0);
    setImplType("Online");
    // Neutral, renewal-specific project name (never the catalogue default).
    setProjectName((prev) =>
      !prev.trim() || prev === GENERIC_PROJECT_NAME ? defaultRenewalProjectName(defaultClientName) : prev,
    );
    setItems(buildBaselineProposalItems(renewalBaseline));
  }, [open, usesContractBaselineItems, renewalBaseline, editingProposal, hydrationPending, persistedItems]);

  // Renewals P0C — restore the proposal-only variant chosen on a previous save.
  useEffect(() => {
    if (!open) return;
    const stored = (editingProposal as any)?.license_model as string | null | undefined;
    setProposalVariant(stored === "keepit" || stored === "useit" ? stored : null);
  }, [open, editingProposal]);

  /**
   * Canonical renewal-change hydration.
   *
   * For an existing proposal every field of the change definition is restored
   * from the saved proposal (or safely derived from its persisted items)
   * BEFORE any financial derivation. A new proposal starts from the neutral
   * straight-renewal defaults.
   */
  useEffect(() => {
    if (!open) return;
    planChangeAppliedRef.current = null;
    if (!editingProposal?.id) {
      setChangeMode("straight");
      setTargetPlan(null);
      setImplKind("standard");
      setImplDiscountPct(0);
      setManualImplGross(null);
      setManualImplJustification("");
      return;
    }
    // Wait for the persisted items — never seed defaults in the meantime.
    if (hydrationPending || !hydration) return;
    setChangeMode(hydration.changeMode);
    setTargetPlan(hydration.targetPlan);
    setImplKind(hydration.implementationKind);
    setImplDiscountPct(hydration.implementationDiscountPct);
    setManualImplGross(hydration.manualImplementationGross);
    setManualImplJustification(hydration.implementationJustification ?? "");
  }, [open, editingProposal, hydration, hydrationPending]);


  /**
   * Apply the plan-change lines to the editable items. The first pass is
   * skipped so a saved proposal (or the untouched baseline) is never
   * overwritten before the user changes anything.
   */
  useEffect(() => {
    if (!planChangeAvailable) return;
    // Never derive lines while an existing proposal is still hydrating.
    if (hydrationPending) return;
    const signature = `${changeMode}|${planChangeItemsKey ?? ""}`;
    if (planChangeAppliedRef.current === signature) return;
    if (planChangeAppliedRef.current === null) {
      planChangeAppliedRef.current = signature;
      return;
    }
    planChangeAppliedRef.current = signature;
    if (planChangeItemsKey) {
      setItems(JSON.parse(planChangeItemsKey) as ProposalItem[]);
    } else if (changeMode === "straight" && renewalBaseline) {
      setItems(buildBaselineProposalItems(renewalBaseline));
    }
  }, [planChangeAvailable, changeMode, planChangeItemsKey, renewalBaseline, hydrationPending]);

  // Keep the Business proposal mode aligned with the variant chosen for this proposal.
  useEffect(() => {
    if (!usesContractBaselineItems || !effectiveVariant) return;
    setProposalMode(effectiveVariant === "keepit" ? "keepit_only" : "useit_only");
  }, [usesContractBaselineItems, effectiveVariant]);


  // Keep Business config deployment field in sync with the wizard's deployment selector
  useEffect(() => {
    if (!isBusinessCatalogue) return;
    setBusinessConfig((prev) => (prev.deployment === deployment ? prev : { ...prev, deployment }));
  }, [deployment, isBusinessCatalogue]);

  // Propagate the per-step discount inputs as line-item discounts.
  // Services use the same model as Software: the wizard input becomes a
  // normal % line discount on each service item (auto-managed, source = "auto").
  // The user can still override any line manually in the Preview step.
  useEffect(() => {
    if (isBusinessProduct) return;
    // Contract baseline lines are real commercial values — never auto-discount them.
    if (usesContractBaselineItems) return;
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
  }, [plan, planDiscountPct, requestsDiscountPct, webUsersDiscountPct, servicesDiscountPct, planDiscountRenews, requestsDiscountRenews, webUsersDiscountRenews, isBusinessProduct, usesContractBaselineItems]);

  // ----- Business totals (in-memory only; not stored in proposal_items) -----
  const businessResult = useMemo(() => {
    if (!isBusinessCatalogue) return null;
    const models: ProposalLicenseModel[] =
      proposalMode === "keepit_only"
        ? ["keepit"]
        : proposalMode === "useit_only"
        ? ["useit"]
        : ["keepit", "useit"];
    return computeBusinessOptions(rules, businessConfig, models);
  }, [isBusinessCatalogue, rules, businessConfig, proposalMode]);

  /** Pick the "headline" option for KPI/expected-value purposes (KeepIT preferred). */
  const businessHeadline = useMemo(() => {
    if (!businessResult) return null;
    return businessResult.keepit || businessResult.useit;
  }, [businessResult]);

  /** Business pricing readiness — blocks preview/save/generate when incomplete. */
  const businessReadiness = useMemo(() => {
    if (!isBusinessCatalogue) return null;
    const models: ProposalLicenseModel[] =
      proposalMode === "keepit_only"
        ? ["keepit"]
        : proposalMode === "useit_only"
        ? ["useit"]
        : ["keepit", "useit"];
    return checkBusinessPricingReadiness({
      rules,
      cfg: businessConfig,
      models,
      isLoading: rulesLoading,
      error: rulesError,
    });
  }, [isBusinessCatalogue, rules, businessConfig, proposalMode, rulesLoading, rulesError]);

  const businessBlocked = !!businessReadiness && !businessReadiness.ok;

  /** Fail-closed guard used before any Business persist/export path. */
  const assertBusinessPricingReady = (): boolean => {
    if (!isBusinessCatalogue || !businessReadiness || businessReadiness.ok) return true;
    toast.error(businessReadiness.message);
    return false;
  };

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
  /**
   * Financial source of truth. Catalogue Business proposals price from the
   * Business engine; every other path (including Business renewals built from
   * the real contract) prices from the editable line items.
   */
  const money = useMemo(() => {
    if (isBusinessCatalogue) {
      return {
        softwareSubtotal: businessHeadline?.licenseSubtotal || 0,
        servicesSubtotal: businessHeadline?.services.reduce((s, l) => s + l.amount, 0) || 0,
        discountAmount: 0,
        totalYear1: businessHeadline?.totalYear1 || 0,
        totalRecurring: businessHeadline?.totalYear2Plus || 0,
      };
    }
    return {
      softwareSubtotal: totals.softwareSubtotal,
      servicesSubtotal: totals.servicesSubtotal,
      discountAmount: totals.discountAmount,
      totalYear1: totals.totalYear1,
      totalRecurring: totals.totalRecurring,
    };
  }, [isBusinessCatalogue, businessHeadline, totals]);

  /** Renewals P0D — gate for Ready status and document generation. */
  const renewalReadiness = useMemo(() => {
    const base = validateRenewalReadiness(
      {
        usesContractBaselineItems,
        isBusinessProduct,
        baselinePlan: renewalBaseline?.plan ?? null,
        targetPlan: planChange.applicable ? planChange.targetPlan : null,
        effectiveVariant,
        variantNeedsReview: !!renewalBaseline?.variantNeedsReview,
      },
      { totalYear1: money.totalYear1, itemCount: items.length },
    );
    // A declared upgrade/downgrade must be fully resolved before a document.
    if (!planChange.applicable || planChange.blockers.length === 0) return base;
    return {
      ok: false,
      blockers: [...planChange.blockers, ...base.blockers],
      warnings: [...base.warnings, ...planChange.warnings],
    };
  }, [
    usesContractBaselineItems,
    isBusinessProduct,
    renewalBaseline,
    effectiveVariant,
    money.totalYear1,
    items.length,
    planChange,
  ]);

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

  /** Clamp a per-line discount input to the actor's maximum for that line kind. */
  const clampLineDiscountValue = (item: ProposalItem, raw: unknown) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const max =
      lineDiscountKind(item.category) === "services"
        ? discountLimits.services
        : discountLimits.software;
    if ((item.discount_type || "none") === "percent") return clampDiscountPct(value, max);
    if ((item.discount_type || "none") === "fixed") {
      const gross = Number(item.gross_total ?? getItemBaseTotal(item)) || 0;
      if (gross <= 0) return 0;
      return Math.min(value, +((gross * max) / 100).toFixed(2));
    }
    return value;
  };

  /** Fail-closed discount authorization check, run before every persist path. */
  const assertDiscountsAllowed = (): boolean => {
    const res = isBusinessCatalogue
      ? validateBusinessDiscounts(businessConfig.discounts as any, discountLimits)
      : validateProfessionalItems(
          previewItems.map((it) => ({
            item_name: it.item_name,
            category: it.category,
            discount_type: it.discount_type,
            discount_value: it.discount_value,
            gross_total: it.gross_total,
          })),
          discountLimits,
        );
    if (!res.ok) {
      toast.error(res.message || "Discount exceeds your authorization limit");
      return false;
    }
    // A plan change may only discount the incremental implementation line.
    if (planChange.applicable) {
      const scope = validatePlanChangeDiscounts(items);
      if (!scope.ok) {
        toast.error(scope.message || "This discount is not allowed on a plan change");
        return false;
      }
    }
    return true;
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

  /** Any persistence path is blocked while saving or in read-only mode. */
  const writeBlocked = saving || readOnly;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  /** Compute next available version number within the same source (deal, renewal or client). */
  const computeNextVersion = async (): Promise<number> => {
    let q = supabase.from("proposals").select("version");
    if (isRenewalProposal) {
      q = q.eq("renewal_id", source.renewal_id as string);
    } else if (isClientProposal) {
      q = q.eq("client_id", source.client_id as string).eq("source_type", "client");
    } else {
      q = q.eq("lead_id", source.deal_id as string);
    }
    const { data: siblings } = await q.order("version", { ascending: false }).limit(1);
    return (siblings?.[0]?.version || 0) + 1;
  };

  const persistProposal = async (status: "Draft" | "Ready" = "Draft"): Promise<Proposal | null> => {
    if (readOnly) {
      toast.error("This proposal is closed and can only be viewed.");
      return null;
    }
    if (!assertBusinessPricingReady()) return null;
    if (!assertDiscountsAllowed()) return null;
    if (!isValidProposalSource(source)) {
      toast.error("This proposal has no valid source record (deal, renewal or client).");
      return null;
    }

    // Destructive-write protection: an existing renewal change may never be
    // overwritten from a partially hydrated (straight-renewal) state.
    if (editingProposal?.id) {
      if (hydrationPending) {
        toast.error("This proposal is still loading. Wait until it is fully open before saving.");
        return null;
      }
      const guard = assertSafeRenewalOverwrite({
        hydration,
        currentMode: changeMode,
        currentTargetPlan: targetPlan,
        currentImplementationGross: planChange.applicable
          ? planChange.implementationGross
          : implementationGrossFromItems(items),
        itemCount: items.length,
      });
      if (!guard.ok) {
        toast.error(guard.reason || "Saving is blocked to protect the persisted proposal.");
        return null;
      }
    }
    setSaving(true);
    try {
      // Auto-assign version on first save (new proposal). Editing keeps existing version.
      const versionForInsert = editingProposal?.version || (await computeNextVersion());
      const insertData: any = {
        ...buildProposalSourcePayload(source),
        version: versionForInsert,
        language,
        plan,
        status,
        hosting: isBusinessCatalogue ? (deployment === "saas" ? "SaaS" : "On-Premise") : hosting,
        product_family: productFamily,
        // Identity fields follow the PRODUCT, not the pricing mode, so a
        // contract-driven Business renewal stays "Business UseIT".
        // Contract-driven renewals persist the resolved (or explicitly chosen)
        // variant; it is never inferred and stays null while unresolved.
        license_model: !isBusinessProduct
          ? null
          : usesContractBaselineItems
          ? effectiveVariant
          : proposalMode === "keepit_only"
          ? "keepit"
          : proposalMode === "useit_only"
          ? "useit"
          : null,

        proposal_mode: isBusinessProduct ? proposalMode : null,
        deployment: isBusinessProduct ? deployment : null,
        business_config: isBusinessCatalogue ? (businessConfig as any) : null,
        client_name: clientName,
        project_name: projectName || null,
        country: country || null,
        proposal_date: proposalDate,
        validity_days: validityDays,
        payment_terms: paymentTerms,
        notes: notes || null,
        implementation_type: isBusinessProduct ? null : implType,
        per_diem: 0,
        discount_pct: 0,
        discount_scope: "none",
        software_discount_pct: 0,
        services_discount_pct: 0,
        include_requests_module: isBusinessCatalogue ? businessConfig.includeRequests : includeRequests,
        web_users: isBusinessCatalogue ? businessConfig.additionalWebUsers : webUsers,
        service_days: isBusinessProduct ? null : onsiteDays || null,
        software_subtotal: money.softwareSubtotal,
        services_subtotal: money.servicesSubtotal,
        discount_amount: money.discountAmount,
        total_year_1: money.totalYear1,
        total_recurring: money.totalRecurring,
        // Renewal plan change — explicit, structured, never inferred later.
        // When the plan-change panel is not active (e.g. a client-sourced
        // change proposal reopened for editing) the persisted definition is
        // carried over verbatim instead of being wiped.
        renewal_change_mode: planChange.applicable ? changeMode : persistedChange?.changeMode ?? "straight",
        source_plan: planChange.applicable ? planChange.currentPlan : persistedChange?.sourcePlan ?? null,
        target_plan: planChange.applicable ? planChange.targetPlan : persistedChange?.targetPlan ?? null,
        // Entitlements + incremental implementation provenance (renewals).
        entitlements: planChange.applicable ? planChange.entitlementSnapshot : persistedChange?.entitlements ?? null,
        implementation_source: planChange.applicable
          ? planChange.implementation.source
          : persistedChange?.implementationSource ?? null,
        implementation_hours: planChange.applicable
          ? planChange.implementation.hours ?? null
          : persistedChange?.implementationHours ?? null,
        implementation_hourly_rate: planChange.applicable
          ? planChange.implementation.hourlyRate ?? null
          : persistedChange?.implementationHourlyRate ?? null,
        implementation_gross: planChange.applicable
          ? planChange.implementationGross
          : persistedChange?.implementationGross ?? null,
        implementation_discount_amount: planChange.applicable
          ? planChange.implementationDiscountAmount
          : persistedChange?.implementationDiscountAmount ?? null,
        implementation_net: planChange.applicable
          ? planChange.implementationNet
          : persistedChange?.implementationNet ?? null,
        implementation_transition_rule_id: planChange.applicable
          ? planChange.implementation.transitionRuleId
          : persistedChange?.implementationTransitionRuleId ?? null,
        implementation_transition_rule_code: planChange.applicable
          ? planChange.implementation.transitionRuleCode
          : persistedChange?.implementationTransitionRuleCode ?? null,
        implementation_justification: planChange.applicable
          ? planChange.implementation.justification ?? null
          : persistedChange?.implementationJustification ?? null,
        created_by: user?.id || null,
      };

      // ── Renewals P0D — one normalization pass before every persistence path.
      // Displayed values, persisted values and generated document values must
      // all be the same. Catalogue/pipeline proposals are untouched.
      const normalizationCtx = {
        usesContractBaselineItems,
        isBusinessProduct,
        baselinePlan: renewalBaseline?.plan ?? null,
        targetPlan: planChange.applicable ? planChange.targetPlan : null,
        effectiveVariant,
        variantNeedsReview: !!renewalBaseline?.variantNeedsReview,
        canonical: isRenewalProposal
          ? {
              renewal_id: source.renewal_id ?? null,
              client_id: source.client_id ?? null,
              partner_uuid: source.partner_uuid ?? null,
            }
          : {},
        clientName,
      };
      const payload = normalizeProposalPayload(insertData, normalizationCtx);

      if (status === "Ready") {
        if (planChange.applicable && planChange.blockers.length > 0) {
          toast.error(planChange.blockers[0]);
          return null;
        }
        const readiness = validateRenewalReadiness(normalizationCtx, {
          totalYear1: money.totalYear1,
          itemCount: items.length,
        });
        if (!readiness.ok) {
          toast.error(readiness.blockers[0]);
          return null;
        }
      }
      // ── Renewal source: one single transactional RPC ────────────────────
      // proposal + items + renewals.source_proposal_id + renewal_activities
      // succeed or fail together. No orphan proposal/items can remain.
      const buildItemRows = (proposalId: string | null): any[] => {
        if (isBusinessCatalogue && businessHeadline) {
          const lines = [
            ...businessHeadline.software,
            ...(businessHeadline.api ? [businessHeadline.api] : []),
            ...businessHeadline.hosting,
            ...(businessHeadline.sat ? [businessHeadline.sat] : []),
            ...businessHeadline.services,
          ];
          return lines.map((l, idx) => ({
            ...(proposalId ? { proposal_id: proposalId } : {}),
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
        }
        return buildProposalItemRows(items, proposalId);
      };

      if (isRenewalProposal) {
        const renewalId = source.renewal_id as string;
        const linkArgs = buildRenewalLinkArgs({
          renewalId,
          proposalId: editingProposal?.id || renewalId,
          isUpdate: !!editingProposal?.id,
          performedBy: profile?.full_name || user?.email || null,
          version: versionForInsert,
          clientName,
        });
        const { data: savedId, error: saveError } = await supabase.rpc("save_renewal_proposal" as any, {
          _renewal_id: renewalId,
          _proposal_id: editingProposal?.id || null,
          _payload: payload,
          _items: buildItemRows(null),
          _performed_by: linkArgs._performed_by,
          _notes: linkArgs._notes,
        } as any);
        if (saveError) throw saveError;

        const { data: saved } = await supabase
          .from("proposals")
          .select("*")
          .eq("id", savedId as unknown as string)
          .single();

        await Promise.all(
          renewalProposalRefreshKeys(renewalId, source.client_id).map((queryKey) =>
            qc.invalidateQueries({ queryKey: queryKey as any })
          )
        );
        return saved as unknown as Proposal;
      }

      const propResponse = editingProposal?.id
        ? await supabase.from("proposals").update(payload).eq("id", editingProposal.id).select().single()
        : await supabase.from("proposals").insert(payload).select().single();
      const { data: prop, error } = propResponse;
      if (error) throw error;

      if (editingProposal?.id) {
        const { error: deleteItemsError } = await supabase.from("proposal_items").delete().eq("proposal_id", editingProposal.id);
        if (deleteItemsError) throw deleteItemsError;
      }

      const itemRows = buildItemRows(prop.id);
      if (itemRows.length > 0) {
        const { error: itErr } = await supabase.from("proposal_items").insert(itemRows);
        if (itErr) throw itErr;
      }
      // ── Client source: existing customer, no deal to value or log ────────
      // A mid-cycle commercial action must never create or touch a Won Deal,
      // and must never write pipeline value.
      if (isClientProposal) {
        qc.invalidateQueries({ queryKey: ["proposals"] });
        qc.invalidateQueries({ queryKey: ["proposals", "client", source.client_id] });
        qc.invalidateQueries({ queryKey: ["client_commercial_intelligence", source.client_id] });
        return prop as unknown as Proposal;
      }

      const expectedValue = money.totalYear1;

      await supabase.from("deals").update({ expected_value: expectedValue }).eq("id", source.deal_id as string);
      // Log activity (best-effort, no stage change)
      try {
        const { logSystemActivity } = await import("@/lib/activity-log");
        const verb = editingProposal?.id ? "updated" : "generated";
        logSystemActivity(source.deal_id as string, `Proposal ${verb}`, `Proposal ${verb} for ${clientName}.`);
      } catch { /* noop */ }
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["deal", source.deal_id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal_activities", source.deal_id] });
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
        const path = `${storagePrefix}/${prop.id}/${fileName}`;
        const { error: upErr } = await supabase.storage.from("proposals").upload(path, blob, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
        if (!upErr) {
          await supabase
            .from("proposals")
            .update({ docx_url: path, generated_at: new Date().toISOString() })
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

  /** Upload a Business DOCX blob to storage and persist URL on the proposal. */
  const uploadBusinessDocx = async (prop: Proposal, blob: Blob, fileName: string) => {
    try {
      const path = `${storagePrefix}/${prop.id}/${fileName}`;
      const { error: upErr } = await supabase.storage.from("proposals").upload(path, blob, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (upErr) return;
      await supabase
        .from("proposals")
        .update({ docx_url: path, status: "Ready", generated_at: new Date().toISOString() })
        .eq("id", prop.id);
      qc.invalidateQueries({ queryKey: ["proposals"] });
    } catch {
      /* upload best-effort */
    }
  };

  /**
   * Renewals P0B — contract-driven renewals produce a dedicated renewal
   * document built from the real baseline lines. Business renewals keep their
   * Business identity; catalogue pricing is never regenerated here.
   */
  const handleGenerateRenewalDocx = async () => {
    if (!renewalReadiness.ok) {
      toast.error(renewalReadiness.blockers[0]);
      return;
    }
    if (planChange.applicable && planChange.blockers.length > 0) {
      toast.error(planChange.blockers[0]);
      return;
    }
    // Generation is a read-only action: it renders the CURRENT dialog state.
    // It never persists the proposal and never changes its status — saving is
    // the explicit "Save as Draft" action.
    try {
      const itemsForDoc = items.map((it, idx) => ({ ...it, sort_order: idx }));
      const proposalForDoc = {
        ...(editingProposal || {}),
        client_name: clientName,
        project_name: projectName,
        language,
        
        plan: planChange.applicable ? planChange.targetPlan : plan,
        total_year_1: money.totalYear1,
        total_recurring: money.totalRecurring,
      } as unknown as Proposal;
      await downloadRenewalProposalDocx({
        proposal: proposalForDoc,
        items: itemsForDoc as any,
        baseline: renewalBaseline,
        proposedRecurring: money.totalRecurring,
        proposedYear1: money.totalYear1,
      });
      toast.success("Renewal document generated (proposal not modified)");
    } catch (e: any) {
      toast.error("Generation failed: " + (e?.message || ""));
    }
  };

  const handleGenerateBusinessDocx = async () => {
    const prop = await persistProposal("Ready");
    if (!prop) return;
    try {
      const { blob, fileName } = await downloadBusinessProposalDocx({ proposal: prop, cfg: businessConfig, rules });
      await uploadBusinessDocx(prop, blob, fileName);
      toast.success("Business DOCX generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("DOCX generation failed: " + (e?.message || ""));
    }
  };

  const handleGenerateBusinessPdf = async () => {
    const prop = await persistProposal("Ready");
    if (!prop) return;
    try {
      printBusinessProposal({ proposal: prop, cfg: businessConfig, rules });
      await supabase
        .from("proposals")
        .update({ status: "Ready", generated_at: new Date().toISOString() })
        .eq("id", prop.id);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("PDF preview opened — use the print dialog to save as PDF");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("PDF generation failed: " + (e?.message || ""));
    }
  };

  const formatPrice = (n: number) => formatEuro(n, language);

  const showWizard = !wizardDone && !!commercialContext && !editingProposal;

  const handleWizardContinue = (result: WizardResult) => {
    const mode = commercialContext?.mode;

    // ── Upgrade / Change License: apply target license to Builder state ──
    if (mode === "upgrade_license" && result.targetLicenseId) {
      const target = LICENSE_ORDER.find((l) => l.id === result.targetLicenseId);
      if (target) {
        setProductFamily(target.family as ProposalProductFamily);
        if (target.family === "Professional" && target.plan) setPlan(target.plan);
        if (target.family === "Business") {
          // Business licenses drive their own compare/keepit/useit mode
          const bMode = target.variant === "KeepIT" ? "keepit_only"
                      : target.variant === "UseIT" ? "useit_only"
                      : "compare_keepit_useit";
          setProposalMode(bMode as ProposalMode);
        }
      }
    } else if (typeof result.plan === "number") {
      setPlan(result.plan);
    }

    // ── Add Users: stage only the additional users, don't re-price existing ──
    if (mode === "add_users") {
      setWebUsers(Math.max(0, result.additionalWebUsers ?? 0));
    } else if (typeof result.additionalWebUsers === "number" && result.additionalWebUsers > 0) {
      setWebUsers((prev) => (prev || 0) + result.additionalWebUsers!);
    }

    // ── Add Modules: capture the picked modules as staged additions ──
    if (result.selectedModules?.length) {
      if (result.selectedModules.some((m) => /request/i.test(m))) setIncludeRequests(true);
      setNotes((prev) => appendStagedLine(prev, `Additional modules: ${result.selectedModules!.join(", ")}`));
    }

    // ── Add Plugins: capture the picked plugins as staged additions ──
    if (result.selectedPlugins?.length) {
      setNotes((prev) => appendStagedLine(prev, `Additional plugins: ${result.selectedPlugins!.join(", ")}`));
    }

    // ── Change Hosting: apply the target hosting to Builder state ──
    if (mode === "change_hosting" && result.newHosting) {
      const target: ProposalHosting = result.newHosting === "OnPremise" ? "On-Premise" : "SaaS";
      setHosting(target);
      setDeployment(result.newHosting === "OnPremise" ? "on_premise" : "saas");
      setNotes((prev) => appendStagedLine(prev, `Hosting change: switch to ${target}`));
    }

    setWizardDone(true);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="h-5 w-5" />
            {editingProposal
              ? `${readOnly ? "Proposal" : "Edit Proposal"} v${editingProposal.version}`
              : "New Proposal"}
            {!showWizard && ` — ${STEPS[step]}`}
            {readOnly && (
              <Badge variant="outline" className="ml-1 text-[10px] font-medium">Read-only</Badge>
            )}
            {commercialContext && !editingProposal && (
              <Badge variant="secondary" className="ml-1 text-[10px] font-medium">
                Existing Customer · {commercialContext.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>


        {commercialContext && !editingProposal && !commercialContext.existingCustomer?.license && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            Current license could not be loaded from this client. Please check the Licensing tab before creating this proposal.
          </div>
        )}

        {showWizard ? (
          <div className="mt-4">
            <CommercialWizard ctx={commercialContext!} onContinue={handleWizardContinue} />
          </div>
        ) : (
          <>
        {commercialContext && !editingProposal && (
          <div className="mt-3">
            <CommercialIntelligencePanel
              ctx={commercialContext}
              newRecurring={money.totalRecurring}
              slot="banners"
            />
          </div>
        )}
        {isRenewalProposal && (
          <RenewalBaselinePanel
            baseline={renewalBaseline}
            isLoading={baselineLoading}
            proposedItems={items.map((it) => ({ item_name: it.item_name, qty: it.qty, unit_price: it.unit_price }))}
            proposedRecurring={money.totalRecurring}
            proposedYear1={money.totalYear1}
            selectedVariantLabel={selectedVariantLabel}

          />
        )}

        {/* Business pricing readiness — blocking state */}
        {isBusinessCatalogue && businessReadiness && !businessReadiness.ok && (
          <div
            role="alert"
            className={`mt-3 rounded-md border p-3 text-sm ${
              businessReadiness.loading
                ? "border-border bg-muted/40 text-muted-foreground"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            <div className="flex items-start gap-2">
              {businessReadiness.loading ? (
                <Loader2 className="h-4 w-4 mt-0.5 animate-spin shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">
                  {businessReadiness.loading
                    ? "Loading pricing configuration…"
                    : businessReadiness.queryFailed
                    ? "Pricing could not be loaded"
                    : "Business pricing configuration incomplete"}
                </p>
                <p>{businessReadiness.message}</p>
                {businessReadiness.missing.length > 0 && (
                  <ul className="list-disc pl-5 font-mono text-xs">
                    {businessReadiness.missing.map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

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
              {/* Row 1: Product family + Language */}
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              {/* Row 2: Plan/Proposal mode + Hosting */}
              <div className="grid grid-cols-2 gap-4">
                {isBusinessCatalogue ? (
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
                ) : isContractRenewal ? (
                  isBusinessProduct ? null : (
                    <div>
                      <Label>Plan</Label>
                      <div className="h-10 flex items-center text-sm">
                        {renewalBaseline?.plan ? (
                          <span className="font-medium">Plan {renewalBaseline.plan}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Not recorded · <span className="text-amber-600">Needs review</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Taken from the current contract — never inferred.
                      </p>
                    </div>
                  )
                ) : (
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
                )}
                {isBusinessCatalogue ? (
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
                ) : (
                  <div>
                    <Label>Hosting</Label>
                    <Select value={isBusinessProduct ? (deployment === "on_premise" ? "On-Premise" : "SaaS") : "SaaS"} disabled onValueChange={(v) => setHosting(v as ProposalHosting)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SaaS">SaaS</SelectItem>
                        <SelectItem value="On-Premise">On-Premise</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {isBusinessProduct ? "Kept from the current contract." : "Professional is SaaS-only."}
                    </p>
                  </div>
                )}

                {/* Renewals P0C — variant not recorded in the source contract. */}
                {usesContractBaselineItems && renewalBaseline?.variantNeedsReview && (
                  <div>
                    <Label>Commercial variant (this proposal only)</Label>
                    <Select
                      value={proposalVariant ?? ""}
                      onValueChange={(v) => setProposalVariant(v as "keepit" | "useit")}
                    >
                      <SelectTrigger><SelectValue placeholder="Not recorded — select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keepit">KeepIT</SelectItem>
                        <SelectItem value="useit">UseIT</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Applies to this proposal only — the current contract and license are not modified.
                    </p>
                  </div>
                )}



              </div>

              {/* Row 3: Client + Project */}
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

              {/* Row 4: Date + Validity + Country */}
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
          {step === 1 && isBusinessCatalogue && (
            <BusinessSoftwareStep
              rules={rules}
              language={language}
              config={businessConfig}
              onChange={setBusinessConfig}
              proposalMode={proposalMode}
              softwareDiscountMax={discountLimits.software}
              servicesDiscountMax={discountLimits.services}
            />
          )}
          {step === 1 && !isBusinessCatalogue && !isContractRenewal && (
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
                    <Label className="text-xs">Professional plan discount % (max {discountLimits.software}%)</Label>
                    <Input type="number" min={0} max={discountLimits.software} value={planDiscountPct} onChange={(e) => setPlanDiscountPct(clampDiscountPct(e.target.value, discountLimits.software))} />
                    <div className="flex items-center justify-between mt-2">
                      <Label className="text-[11px] text-muted-foreground">Apply to renewals</Label>
                      <Switch checked={planDiscountRenews} onCheckedChange={setPlanDiscountRenews} disabled={planDiscountPct <= 0} />
                    </div>
                  </div>
                  <div className={!includeRequests ? "opacity-50 pointer-events-none" : ""}>
                    <Label className="text-xs">Requests Module discount % (max {discountLimits.software}%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={discountLimits.software}
                      value={includeRequests ? requestsDiscountPct : 0}
                      onChange={(e) => setRequestsDiscountPct(clampDiscountPct(e.target.value, discountLimits.software))}
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
                    <Label className="text-xs">Web/Mobile users discount % (max {discountLimits.software}%)</Label>
                    <Input type="number" min={0} max={discountLimits.software} value={webUsersDiscountPct} onChange={(e) => setWebUsersDiscountPct(clampDiscountPct(e.target.value, discountLimits.software))} />
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
          {step === 2 && isBusinessCatalogue && (
            <BusinessServicesStep
              rules={rules}
              language={language}
              config={businessConfig}
              onChange={setBusinessConfig}
              proposalMode={proposalMode}
              softwareDiscountMax={discountLimits.software}
              servicesDiscountMax={discountLimits.services}
            />
          )}
          {step === 2 && !isBusinessCatalogue && !isContractRenewal && (
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
                  <Label>Services discount % (max {discountLimits.services}%)</Label>
                  <Input type="number" min={0} max={discountLimits.services} value={servicesDiscountPct}
                    onChange={(e) => setServicesDiscountPct(clampDiscountPct(e.target.value, discountLimits.services))} />
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

          {/* STEP 1: Software — contract-driven renewal */}
          {step === 1 && isContractRenewal && (
            <div className="space-y-4">
              <div className="bg-secondary/40 border rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Current contract configuration</h4>
                <p className="text-xs text-muted-foreground">
                  {renewalBaseline?.product || "—"}
                  {" · "}
                  {renewalBaseline?.hosting || "Not recorded"}
                  {" · Backoffice users: "}
                  {renewalBaseline?.backofficeUsers ?? "Not recorded"}
                  {" · Web users: "}
                  {renewalBaseline?.webUsers ?? "Not recorded"}
                </p>
                {(renewalBaseline?.modules?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {renewalBaseline!.modules.map((m) => (
                      <Badge key={m.name} variant="secondary" className="text-[11px]">{m.name}</Badge>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Software is taken from the linked contract and license. Catalogue plans and modules do not apply to a renewal — edit the real lines in the Preview step.
                </p>
              </div>

              {planChangeAvailable && (
                <RenewalPlanChangePanel
                  mode={changeMode}
                  onModeChange={setChangeMode}
                  targetPlan={targetPlan}
                  onTargetPlanChange={setTargetPlan}
                  implementationKind={implKind}
                  onImplementationKindChange={setImplKind}
                  implementationDiscountPct={clampedImplDiscount}
                  onImplementationDiscountChange={setImplDiscountPct}
                  maxServicesDiscountPct={discountLimits.services}
                  currentProductLabel={renewalBaseline?.product ?? null}
                  computation={planChange}
                  manualImplementationGross={manualImplGross}
                  onManualImplementationGrossChange={setManualImplGross}
                  manualJustification={manualImplJustification}
                  onManualJustificationChange={setManualImplJustification}
                  canAuthorizeManualImplementation={isHQ}
                />
              )}
            </div>
          )}

          {/* STEP 2: Services — contract-driven renewal */}
          {step === 2 && isContractRenewal && (
            <div className="space-y-4">
              <div className="bg-secondary/30 border rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Recurring services in the current contract</h4>
                {(renewalBaseline?.recurringLines || []).filter((l) => l.lineType === "sat" || l.lineType === "support" || l.lineType === "implementation" || l.lineType === "training").length > 0 ? (
                  <ul className="text-xs text-muted-foreground list-disc pl-5">
                    {renewalBaseline!.recurringLines
                      .filter((l) => ["sat", "support", "implementation", "training"].includes(l.lineType))
                      .map((l, i) => (
                        <li key={i}>{l.label}</li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No recurring service line in the current contract. No implementation service is added automatically.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Add a one-time service in the Preview step only if it was deliberately negotiated for this renewal.
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
          {step === 4 && isBusinessCatalogue && (
            <div className="space-y-4">
              {commercialContext && !editingProposal && (
                <CommercialIntelligencePanel
                  ctx={commercialContext}
                  newRecurring={businessHeadline?.totalYear2Plus || 0}
                  slot="summary"
                />
              )}
              {businessBlocked ? null : (
                <BusinessPreviewStep
                  rules={rules}
                  language={language}
                  config={businessConfig}
                  onChange={setBusinessConfig}
                  proposalMode={proposalMode}
                />
              )}
            </div>
          )}
          {step === 4 && !isBusinessCatalogue && (
            <div className="space-y-4">
              {commercialContext && !editingProposal && (
                <CommercialIntelligencePanel
                  ctx={commercialContext}
                  newRecurring={totals.totalRecurring}
                  slot="summary"
                />
              )}
              {planChangeAvailable && planChange.applicable && (
                <RenewalPlanChangePanel
                  summaryOnly
                  mode={changeMode}
                  onModeChange={setChangeMode}
                  targetPlan={targetPlan}
                  onTargetPlanChange={setTargetPlan}
                  implementationKind={implKind}
                  onImplementationKindChange={setImplKind}
                  implementationDiscountPct={clampedImplDiscount}
                  onImplementationDiscountChange={setImplDiscountPct}
                  maxServicesDiscountPct={discountLimits.services}
                  currentProductLabel={renewalBaseline?.product ?? null}
                  computation={planChange}
                  manualImplementationGross={manualImplGross}
                  onManualImplementationGrossChange={setManualImplGross}
                  manualJustification={manualImplJustification}
                  onManualJustificationChange={setManualImplJustification}
                  canAuthorizeManualImplementation={isHQ}
                />
              )}
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
                          <Input
                            type="number"
                            className="h-8"
                            value={it.discount_value || 0}
                            onChange={(e) => updateItem(idx, { discount_value: clampLineDiscountValue(it, e.target.value) })}
                          />
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
              {usesContractBaselineItems ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Generate {isBusinessProduct ? "Business" : "Professional"} renewal proposal
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {renewalBaseline?.variantLabel
                        ? `${renewalBaseline.product}`
                        : `${renewalBaseline?.product || productFamily} · variant ${
                            selectedVariantLabel ? `${selectedVariantLabel} (this proposal)` : "not recorded"
                          }`}{" "}
                      · {renewalBaseline?.hosting || hosting} · {language}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Current recurring: <strong>{formatPrice(renewalBaseline?.currentRecurring || 0)}</strong>
                      {" · "}Proposed Year 1: <strong>{formatPrice(money.totalYear1)}</strong>
                      {" · "}Year 2+: <strong>{formatPrice(money.totalRecurring)}/yr</strong>
                    </p>
                    {!renewalReadiness.ok && (
                      <div role="alert" className="text-sm text-destructive mt-2 space-y-1">
                        {renewalReadiness.blockers.map((b) => (
                          <p key={b}>{b}</p>
                        ))}
                      </div>
                    )}
                    {renewalReadiness.warnings.map((w) => (
                      <p key={w} className="text-xs text-muted-foreground mt-1">{w}</p>
                    ))}
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={writeBlocked}>Save as Draft</Button>
                    <Button onClick={handleGenerateRenewalDocx} disabled={saving || !renewalReadiness.ok}>
                      <Download className="h-4 w-4 mr-2" />Generate Renewal DOCX

                    </Button>
                  </div>
                </>
              ) : isBusinessCatalogue ? (

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
                  <div className="flex justify-center gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={writeBlocked || businessBlocked}>Save as Draft</Button>
                    <Button onClick={handleGenerateBusinessDocx} disabled={writeBlocked || businessBlocked}>
                      <Download className="h-4 w-4 mr-2" />Generate DOCX
                    </Button>
                    <Button variant="outline" onClick={handleGenerateBusinessPdf} disabled={writeBlocked || businessBlocked}>
                      <Download className="h-4 w-4 mr-2" />Generate PDF
                    </Button>
                    <Button
                      variant="outline"
                      disabled={writeBlocked || businessBlocked}
                      onClick={async () => {
                        const prop = await persistProposal("Draft");
                        if (!prop) return;
                        try {
                          downloadBusinessXlsx({ proposal: prop, cfg: businessConfig, rules });
                          toast.success("Excel exported");
                          onOpenChange(false);
                        } catch (e: any) {
                          toast.error("Excel export failed: " + (e?.message || ""));
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />Export Excel
                    </Button>
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
                    <Button variant="outline" onClick={handleSaveDraft} disabled={writeBlocked}>Save as Draft</Button>
                    <Button onClick={handleGenerate} disabled={writeBlocked}>
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
            <Button size="sm" onClick={next} disabled={businessBlocked}>
              Next<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <span />
          )}
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

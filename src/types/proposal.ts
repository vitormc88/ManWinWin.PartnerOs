export type ProposalLanguage = "EN" | "PT" | "ES" | "RO" | "TH";
export type ProposalPlan = 1 | 2 | 3;
export type ProposalStatus = "Draft" | "Ready" | "Sent" | "Won" | "Lost";
export type ProposalHosting = "SaaS" | "On-Premise";

/** Product family — Professional (default) or Business (KeepIT/UseIT). */
export type ProposalProductFamily = "Professional" | "Business";

/** License model used by Business proposals. */
export type ProposalLicenseModel = "keepit" | "useit";

/** How a Business proposal is presented. */
export type ProposalMode = "compare_keepit_useit" | "keepit_only" | "useit_only";

/** Deployment target — Business proposals can be SaaS or On-Premise. */
export type ProposalDeployment = "saas" | "on_premise";
export type ProposalDiscountScope = "none" | "services" | "software" | "total";
export type ProposalLineDiscountType = "none" | "percent" | "fixed";
/**
 * Implementation flavours. "RCI Professional" is reserved for Business proposals
 * (not exposed in the Professional UI yet).
 */
export type ImplementationType = "Online" | "Onsite" | "Light Implementation" | "RCI Professional";
export type ItemCategory = "software" | "service" | "addon" | "custom";
export type ItemFrequency = "monthly" | "yearly" | "one-time" | "per-user-month" | "per-hour";

export interface PricingRule {
  id: string;
  code: string;
  label: string;
  category: string;
  unit_price: number;
  unit_type: ItemFrequency | string;
  currency: string;
  active: boolean;
  notes: string | null;
  description?: string | null;
  product_family?: string | null;
  license_model?: string | null;
  applicable_plan?: string | null;
  billing_frequency?: string | null;
  region?: string | null;
  optional?: boolean;
  included_by_default?: boolean;
  can_override?: boolean;
  sort_order?: number;
  support_calculation_type?: string | null;
  support_percentage?: number | null;
  applies_to_license_total?: boolean;
}

export interface ProposalItem {
  id?: string;
  proposal_id?: string;
  category: ItemCategory;
  item_code: string | null;
  item_name: string;
  description: string | null;
  qty: number;
  unit_price: number;
  frequency: ItemFrequency;
  total: number;
  discount_type?: ProposalLineDiscountType;
  discount_value?: number;
  gross_total?: number;
  discount_amount?: number;
  net_total?: number;
  /**
   * If true and the item is recurring, the discount also applies to Year 2+.
   * Default false: discounts apply to Year 1 only.
   */
  apply_discount_to_renewal?: boolean;
  is_override: boolean;
  is_recurring: boolean;
  sort_order: number;

  /* ── Structured provenance (renewal plan changes) ────────────────────
   * Persisted so a line can be audited without parsing its description. */
  /** Catalogue rule that priced this line, when it came from pricing_rules. */
  pricing_rule_code?: string | null;
  pricing_rule_id?: string | null;
  /** Plan proven by the source contract at proposal time. */
  source_plan?: number | null;
  /** Plan proposed by this renewal change. */
  target_plan?: number | null;
  /** Canonical contract vocabulary (license, mww_web, sat, implementation …). */
  line_type?: string | null;
  /** "unchanged" | "plan_change" | "implementation_delta". */
  change_kind?: string | null;
  /** Incremental value this line represents versus the current contract. */
  gross_delta?: number | null;
}

export interface Proposal {
  id: string;
  lead_id: string;
  parent_proposal_id: string | null;
  version: number;
  language: ProposalLanguage;
  /** Null when no plan applies (e.g. a contract-driven Business renewal). */
  plan: ProposalPlan | null;
  status: ProposalStatus;
  hosting: ProposalHosting;
  /** Defaults to "Professional" for legacy rows. */
  product_family?: ProposalProductFamily;
  /** Business only — chosen license model (when not in compare mode). */
  license_model?: ProposalLicenseModel | null;
  /** Business only — proposal presentation mode. */
  proposal_mode?: ProposalMode | null;
  /** Business only — deployment target. */
  deployment?: ProposalDeployment | null;
  client_name: string;
  project_name: string | null;
  country: string | null;
  proposal_date: string;
  validity_days: number;
  payment_terms: string | null;
  notes: string | null;
  /** Null when no implementation service applies (e.g. renewals). */
  implementation_type: ImplementationType | null;
  service_days: number | null;
  service_hours: number | null;
  backoffice_work_hours: number | null;
  per_diem: number;
  discount_pct: number;
  discount_scope: ProposalDiscountScope;
  software_discount_pct?: number;
  services_discount_pct?: number;
  include_requests_module: boolean;
  web_users: number;
  software_subtotal: number;
  services_subtotal: number;
  discount_amount: number;
  total_year_1: number;
  total_recurring: number;
  docx_url: string | null;
  pdf_url: string | null;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProposalLanguage = "EN" | "PT" | "ES" | "RO" | "TH";
export type ProposalPlan = 1 | 2 | 3;
export type ProposalStatus = "Draft" | "Ready" | "Sent" | "Won" | "Lost";
export type ProposalHosting = "SaaS" | "On-Premise";
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
  is_override: boolean;
  is_recurring: boolean;
  sort_order: number;
}

export interface Proposal {
  id: string;
  lead_id: string;
  parent_proposal_id: string | null;
  version: number;
  language: ProposalLanguage;
  plan: ProposalPlan;
  status: ProposalStatus;
  hosting: ProposalHosting;
  client_name: string;
  project_name: string | null;
  country: string | null;
  proposal_date: string;
  validity_days: number;
  payment_terms: string | null;
  notes: string | null;
  implementation_type: ImplementationType;
  service_days: number | null;
  service_hours: number | null;
  backoffice_work_hours: number | null;
  per_diem: number;
  discount_pct: number;
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

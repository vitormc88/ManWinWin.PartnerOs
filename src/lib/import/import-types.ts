/**
 * PHASE 4 — Safe production import: shared input schema.
 *
 * Pure types only. No IO, no Supabase, no side effects.
 * See supabase/migrations_review/PHASE4_DATA_IMPORT_READINESS.md.
 */

import type { ContractLineType } from "@/lib/contract-lines";

export interface ImportContractLineInput {
  line_type: string;
  description: string;
  amount: number | null;
  currency: string | null;
  billing_frequency: string | null;
  notes?: string | null;
}

export interface ImportLicenseInput {
  /** Canonical product/variant (e.g. "Business UseIT"). */
  product: string | null;
  /** Hosting: SaaS | On-Premise (never a database engine). */
  deployment: string | null;
  /** Operational version as reported by the customer; empty stays empty. */
  version?: string | null;
  /** BackOffice users = number of purchased licenses. Employee Accesses is ignored. */
  backoffice_users: number | null;
  web_users?: number | null;
  /** Canonical module keys; "Base"-included items must not be duplicated. */
  modules?: string[];
  /** Real business date, never an import timestamp. */
  first_installation_date?: string | null;
}

export interface ImportLifecycleEventInput {
  event_type: string;
  event_title: string;
  /** Real historical date; when absent the event is marked unknown. */
  occurred_at?: string | null;
  /** True when the event describes the import act itself. */
  technical?: boolean;
}

export interface ImportClientInput {
  /** Stable external key namespace, e.g. "lic" | "erp". */
  source_system?: string | null;
  /** Stable external identifier inside `source_system`. */
  external_client_id?: string | null;
  /** Only accepted as an identity key when explicitly confirmed by a human. */
  client_code?: string | null;
  client_code_confirmed?: boolean;

  commercial_name: string;
  country?: string | null;

  /** Canonical partner relation. Legacy text partner_id is never promoted. */
  partner_uuid?: string | null;
  /** Legacy reference, carried for display/debug only. */
  legacy_partner_id?: string | null;
  /** True when the client belongs to HQ Direct (no partner). */
  hq_direct?: boolean;

  license?: ImportLicenseInput | null;

  contract?: {
    contract_start_date: string | null;
    contract_end_date: string | null;
    currency: string | null;
    lines: ImportContractLineInput[];
  } | null;

  renewal?: {
    renewal_date: string | null;
    estimated_value?: number | null;
  } | null;

  /** Declared totals used to reconcile against the computed line totals. */
  declared_totals?: {
    recurring_arr?: number | null;
    one_time?: number | null;
    year_1?: number | null;
  } | null;

  lifecycle_events?: ImportLifecycleEventInput[];
}

export type ImportRowState = "valid" | "needs_review" | "blocked";

export interface ImportIssue {
  code: string;
  field?: string;
  message: string;
}

export interface NormalizedPreview {
  identityKey: string;
  commercial_name: string;
  country: string | null;
  partner_uuid: string | null;
  legacy_partner_id: string | null;
  license: {
    product: string;
    productIsCanonical: boolean;
    deployment: string;
    version: string;
    backoffice_users: number | null;
    modules: string[];
    first_installation_date: string | null;
  } | null;
  contract: {
    start_date: string | null;
    end_date: string | null;
    currency: string;
    lines: Array<{
      line_type: ContractLineType | string;
      description: string;
      amount: number;
      currency: string;
      billing_frequency: string;
    }>;
  } | null;
  totals: { recurring_arr: number; one_time: number; year_1: number };
  renewal: { renewal_date: string | null; estimated_value: number } | null;
  lifecycle_events: Array<{
    event_type: string;
    event_title: string;
    occurred_at: string | null;
    occurred_at_known: boolean;
    technical: boolean;
  }>;
}

export interface ValidatedImportRow {
  index: number;
  state: ImportRowState;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  normalizedPreview: NormalizedPreview;
  input: ImportClientInput;
}

export interface ValidatedImportBatch {
  rows: ValidatedImportRow[];
  summary: { total: number; valid: number; needs_review: number; blocked: number };
}

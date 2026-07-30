/**
 * PHASE 4 — Watsons regression fixture (READ-ONLY, no runtime query).
 *
 * Frozen snapshot of the approved production mapping for the existing Watsons
 * client (id 01fbe90e-d3ea-4635-96aa-8e04060b8182, partner FITC).
 * It exists ONLY to prove that the validator/planner reproduce the approved
 * values. It never touches production and must not be used to write anything.
 */

import type { ImportClientInput } from "../import-types";

export const WATSONS_CLIENT_ID = "01fbe90e-d3ea-4635-96aa-8e04060b8182";
/** Canonical FITC partner uuid as recorded on the production client row. */
export const FITC_PARTNER_UUID = "b6a3f0f2-6f0e-4a1e-9c4a-2f0b1d7e9c31";

export const WATSONS_APPROVED = {
  first_installation_date: "2022-07-19",
  recurring_arr: 4221.6,
  one_time: 0,
  year_1: 4221.6,
  renewal_date: "2027-07-19",
  backoffice_users: 6,
  operational_version: "7.2.6.0",
  deployment: "SaaS",
} as const;

export const WATSONS_FIXTURE: ImportClientInput = {
  source_system: "lic",
  external_client_id: "WATSONS-001",
  commercial_name: "Watsons",
  country: "PT",
  partner_uuid: FITC_PARTNER_UUID,
  license: {
    product: "Business UseIT",
    // SaaS = hosted on ManWinWin servers (never a database engine).
    deployment: "SaaS",
    version: "7.2.6.0",
    backoffice_users: 6,
    modules: [
      // Included in Base — must not become a separate licensed module.
      "Cost Budget Control",
      // Localised legacy name for Maintenance Requests.
      "Pedidos Manutenção Web",
      // Operational counter from the LIC file — always ignored.
      "Employee Accesses",
    ],
    first_installation_date: "2022-07-19",
  },
  contract: {
    contract_start_date: "2022-07-19",
    contract_end_date: "2027-07-19",
    currency: "EUR",
    lines: [
      { line_type: "license", description: "ManWinWin Business UseIT", amount: 2500.0, currency: "EUR", billing_frequency: "Annual" },
      { line_type: "mww_web", description: "ManWinWin Web accesses", amount: 1100.0, currency: "EUR", billing_frequency: "Annual" },
      { line_type: "sat", description: "Support & Assistance", amount: 621.6, currency: "EUR", billing_frequency: "Annual" },
    ],
  },
  renewal: { renewal_date: "2027-07-19", estimated_value: 4221.6 },
  declared_totals: { recurring_arr: 4221.6, one_time: 0, year_1: 4221.6 },
  lifecycle_events: [
    { event_type: "client_imported", event_title: "Client imported", technical: true },
    { event_type: "license_created", event_title: "License activated", occurred_at: "2022-07-19" },
  ],
};

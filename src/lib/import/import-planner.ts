/**
 * PHASE 4 — Pure, deterministic import PLANNER.
 *
 * Turns validated rows into an ordered list of write operations.
 * It NEVER executes anything: there is no Supabase client here on purpose.
 *
 * Rules:
 *  - only `valid` rows produce operations; needs_review / blocked produce none;
 *  - order is fixed: client → license → licensed_modules → contract →
 *    contract_lines → renewal → lifecycle_events (partners must pre-exist);
 *  - every operation carries a deterministic idempotency key derived from the
 *    row identity key, so re-planning the same input yields the same keys;
 *  - operations are insert-only (`never_overwrite`): an existing record is only
 *    ever matched by its explicit external key, never by name.
 */

import type { ValidatedImportBatch, ValidatedImportRow } from "./import-types";

export type ImportOperationTable =
  | "clients"
  | "licenses"
  | "licensed_modules"
  | "contracts"
  | "contract_lines"
  | "renewals"
  | "lifecycle_events";

export interface ImportOperation {
  /** Global execution order across the whole plan. */
  order: number;
  rowIndex: number;
  table: ImportOperationTable;
  /** Deterministic key — identical input always yields an identical key. */
  idempotencyKey: string;
  /** Local reference so later operations can point at this record. */
  ref: string;
  /** References to earlier operations (by `ref`) that must exist first. */
  dependsOn: string[];
  /** Insert-only: an existing row is matched by external key, never by name. */
  mode: "insert_if_absent";
  payload: Record<string, unknown>;
}

export interface ImportPlan {
  operations: ImportOperation[];
  /** Rows that produced no operations, with the reason. */
  skipped: Array<{ rowIndex: number; identityKey: string; state: string; reason: string }>;
  /**
   * Manual rollback manifest: the idempotency keys that would be created,
   * grouped by table, in reverse deletion order. Self-contained — it does not
   * rely on any TEMP TABLE or session state.
   */
  rollbackManifest: Array<{ table: ImportOperationTable; idempotencyKeys: string[] }>;
}

const ROLLBACK_ORDER: ImportOperationTable[] = [
  "lifecycle_events",
  "renewals",
  "contract_lines",
  "contracts",
  "licensed_modules",
  "licenses",
  "clients",
];

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function planRow(row: ValidatedImportRow, push: (op: Omit<ImportOperation, "order">) => void): void {
  const p = row.normalizedPreview;
  const key = p.identityKey;
  const clientRef = `client:${key}`;

  push({
    rowIndex: row.index,
    table: "clients",
    idempotencyKey: `${key}#client`,
    ref: clientRef,
    dependsOn: [],
    mode: "insert_if_absent",
    payload: {
      source_system: row.input.source_system ?? null,
      external_client_id: row.input.external_client_id ?? null,
      client_code: row.input.client_code ?? null,
      commercial_name: p.commercial_name,
      country: p.country,
      // Canonical relation only; legacy text is never written.
      partner_uuid: p.partner_uuid,
      status: "Active",
      first_installation_date: p.license?.first_installation_date ?? null,
    },
  });

  const licenseRef = `license:${key}`;
  if (p.license) {
    push({
      rowIndex: row.index,
      table: "licenses",
      idempotencyKey: `${key}#license`,
      ref: licenseRef,
      dependsOn: [clientRef],
      mode: "insert_if_absent",
      payload: {
        product: p.license.product,
        deployment_type: p.license.deployment,
        license_version: p.license.version,
        backoffice_users: p.license.backoffice_users,
        first_installation_date: p.license.first_installation_date,
      },
    });
    p.license.modules.forEach((m) => {
      push({
        rowIndex: row.index,
        table: "licensed_modules",
        idempotencyKey: `${key}#module:${slug(m)}`,
        ref: `module:${key}:${slug(m)}`,
        dependsOn: [licenseRef],
        mode: "insert_if_absent",
        payload: { module_name: m },
      });
    });
  }

  const contractRef = `contract:${key}`;
  if (p.contract) {
    push({
      rowIndex: row.index,
      table: "contracts",
      idempotencyKey: `${key}#contract`,
      ref: contractRef,
      dependsOn: [clientRef],
      mode: "insert_if_absent",
      payload: {
        contract_start_date: p.contract.start_date,
        contract_end_date: p.contract.end_date,
        currency: p.contract.currency,
        is_imported: true,
      },
    });
    p.contract.lines.forEach((l, i) => {
      push({
        rowIndex: row.index,
        table: "contract_lines",
        idempotencyKey: `${key}#line:${i}:${l.line_type}:${slug(l.description)}`,
        ref: `line:${key}:${i}`,
        dependsOn: [contractRef],
        mode: "insert_if_absent",
        payload: {
          line_type: l.line_type,
          description: l.description,
          amount: l.amount,
          currency: l.currency,
          billing_frequency: l.billing_frequency,
          source: "legacy",
        },
      });
    });
  }

  if (p.renewal?.renewal_date) {
    push({
      rowIndex: row.index,
      table: "renewals",
      idempotencyKey: `${key}#renewal:${p.renewal.renewal_date}`,
      ref: `renewal:${key}`,
      dependsOn: [clientRef, ...(p.contract ? [contractRef] : [])],
      mode: "insert_if_absent",
      payload: {
        renewal_date: p.renewal.renewal_date,
        estimated_value: p.renewal.estimated_value,
        status: "Upcoming",
        partner_uuid: p.partner_uuid,
      },
    });
  }

  p.lifecycle_events.forEach((e, i) => {
    push({
      rowIndex: row.index,
      table: "lifecycle_events",
      idempotencyKey: `${key}#event:${i}:${e.event_type}`,
      ref: `event:${key}:${i}`,
      dependsOn: [clientRef],
      mode: "insert_if_absent",
      payload: {
        event_type: e.event_type,
        event_title: e.event_title,
        occurred_at: e.occurred_at,
        occurred_at_known: e.occurred_at_known,
        // Technical events describe the import act, not the business history.
        is_technical: e.technical,
      },
    });
  });
}

export function buildImportPlan(batch: ValidatedImportBatch): ImportPlan {
  const operations: ImportOperation[] = [];
  const skipped: ImportPlan["skipped"] = [];

  for (const row of batch.rows) {
    if (row.state !== "valid") {
      skipped.push({
        rowIndex: row.index,
        identityKey: row.normalizedPreview.identityKey,
        state: row.state,
        reason:
          row.state === "blocked"
            ? row.errors.map((e) => e.code).join(", ") || "blocked"
            : row.warnings.map((w) => w.code).join(", ") || "needs_review",
      });
      continue;
    }
    planRow(row, (op) => operations.push({ ...op, order: operations.length + 1 }));
  }

  const rollbackManifest = ROLLBACK_ORDER.map((table) => ({
    table,
    idempotencyKeys: operations.filter((o) => o.table === table).map((o) => o.idempotencyKey),
  })).filter((g) => g.idempotencyKeys.length > 0);

  return { operations, skipped, rollbackManifest };
}

import { supabase } from "@/integrations/supabase/client";

type Table = "clients" | "client_contacts" | "licenses" | "licensed_modules" | "contracts" | "contract_lines" | "renewals";
/** Build related rows locally; nothing is saved until the single transaction commits. */
export function createClientWritePlan() {
  const rows: { table: Table; row: Record<string, unknown> }[] = [];
  return {
    insert(table: Table, payload: any) {
      const array = Array.isArray(payload);
      const records = (array ? payload : [payload]).map((row: any) => ({ ...row, id: row.id || crypto.randomUUID() }));
      records.forEach((row: any) => rows.push({ table, row }));
      return Promise.resolve({ data: array ? records : records[0], error: null });
    },
    async commit() {
      const { error } = await (supabase.rpc as any)("commit_client_write_plan", { p_rows: rows });
      if (error) throw error;
    },
  };
}

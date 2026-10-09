import { daysToRenewal } from "@/lib/renewal-kpi";

type LicenseRow = { id: string; license_status?: string | null; is_draft?: boolean | null; license_start_date?: string | null; created_at?: string | null };
type ContractRow = { id: string; contract_start_date?: string | null; contract_end_date?: string | null; created_at?: string | null };
const newest = (a: { id: string; created_at?: string | null }, b: { id: string; created_at?: string | null }) => (b.created_at || "").localeCompare(a.created_at || "") || a.id.localeCompare(b.id);

export function currentLicenses<T extends LicenseRow>(rows: T[], today = new Date()): T[] {
  return rows.filter(r => !r.is_draft && (!r.license_status || r.license_status.toLowerCase() === "active") && (daysToRenewal(r.license_start_date, today) ?? 0) <= 0)
    .sort((a, b) => (b.license_start_date || "").localeCompare(a.license_start_date || "") || newest(a, b));
}

/** Current agreement first; latest expired agreement remains available for renewal context. */
export function primaryContract<T extends ContractRow>(rows: T[], today = new Date()): T | null {
  const started = rows.filter(r => (daysToRenewal(r.contract_start_date, today) ?? 0) <= 0);
  const current = started.filter(r => (daysToRenewal(r.contract_end_date, today) ?? 0) >= 0);
  return [...(current.length ? current : started)].sort((a, b) => (b.contract_start_date || "").localeCompare(a.contract_start_date || "") || (b.contract_end_date || "").localeCompare(a.contract_end_date || "") || newest(a, b))[0] || null;
}

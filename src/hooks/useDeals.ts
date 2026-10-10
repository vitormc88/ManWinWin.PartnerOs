import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { canonicalRenewalComponents, selectActiveCycle, isDerivedComponent, suppressDerivedForClosedCycles, isPerpetualKeepIt } from "@/lib/renewal-active-cycle";

import { withRenewalHistory } from "@/lib/renewal-pipeline";
import { fetchAllPages } from "@/lib/loss-analysis";
import { useNotificationInbox } from "@/hooks/useNotificationInbox";

export type Deal = Tables<"deals">;

export function useDeals(
  filters?: { stage?: string; partner_id?: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["deals", filters],
    enabled: options?.enabled ?? true,
    queryFn: async () => {

      let query = supabase.from("deals").select("*").order("created_at", { ascending: false });
      if (filters?.stage) query = query.eq("stage", filters.stage);
      if (filters?.partner_id) query = query.eq("partner_id", filters.partner_id);
      return fetchAllPages<Deal>((from, to) => query.order("id").range(from, to));
    },
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: ["deal", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("deals").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Deal;
    },
    enabled: !!id,
  });
}

export function useRenewals(filters?: { status?: string; includeHistory?: boolean }, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["renewals", filters],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      // Fetch explicit renewal records
      let query = supabase.from("renewals").select("*").order("renewal_date");
      if (filters?.status) query = query.eq("status", filters.status);
      const existing = await fetchAllPages<any>((from, to) => query.order("id").range(from, to));

      const explicit = canonicalRenewalComponents(existing || []);

      // Track license_ids and contract clients already covered by explicit renewals,
      // so we don't generate phantom "License"/"SAT" derived rows on top of real operationalized ones.
      const coveredLicenseIds = new Set(
        explicit.filter((r: any) => r.license_id).map((r: any) => r.license_id)
      );
      const coveredKeys = new Set(
        explicit.map((r: any) => `${r.client_id}::${r.renewal_type}`)
      );

      // Derive renewal candidates from contracts and licenses
      const derived: any[] = [];

      // Batch-fetch all clients for partner_id lookup
      const allClients = await fetchAllPages<any>((from, to) => supabase.from("clients").select("id, partner_id, partner_uuid").order("id").range(from, to));
      const clientPartnerMap: Record<string, string | null> = {};
      const clientCanonicalPartnerMap: Record<string, string | null> = {};
      (allClients || []).forEach((c: any) => {
        clientPartnerMap[c.id] = c.partner_id;
        clientCanonicalPartnerMap[c.id] = c.partner_uuid;
      });

      // Derive from contracts
      const contracts = await fetchAllPages<any>((from, to) => supabase.from("contracts").select("id, client_id, contract_end_date, total_value").order("contract_end_date").order("id").range(from, to));

      for (const c of contracts || []) {
        if (!c.contract_end_date) continue;
        const key = `${c.client_id}::Contract`;
        if (coveredKeys.has(key)) continue;

        const days = Math.ceil((new Date(c.contract_end_date).getTime() - Date.now()) / 86400000);
        let status = "Upcoming";
        if (days < 0) status = "Expired";
        else if (days <= 30) status = "Due Soon";

        derived.push({
          id: `derived-contract-${c.id}`,
          client_id: c.client_id,
          partner_id: clientPartnerMap[c.client_id] || null,
          partner_uuid: clientCanonicalPartnerMap[c.client_id] || null,
          renewal_type: "Contract",
          renewal_date: c.contract_end_date,
          estimated_value: c.total_value,
          status,
          priority: days < 0 ? "Critical" : days <= 30 ? "High" : "Medium",
          assigned_owner: null,
          notes: null,
        });
        coveredKeys.add(key);
      }

      // Derive from licenses
      const licenses = await fetchAllPages<any>((from, to) => supabase.from("licenses").select("id, client_id, license_end_date, sat_end_date, sat_active, product, edition").order("id").range(from, to));

      for (const l of licenses || []) {
        // Skip licenses already covered by an explicit operationalized renewal
        if (coveredLicenseIds.has(l.id)) continue;
        // KeepIT is perpetual: only active S&AT/hosting creates an obligation.
        if (l.license_end_date && !isPerpetualKeepIt(l as any)) {
          const key = `${l.client_id}::License`;
          if (!coveredKeys.has(key)) {
            const days = Math.ceil((new Date(l.license_end_date).getTime() - Date.now()) / 86400000);
            let status = "Upcoming";
            if (days < 0) status = "Expired";
            else if (days <= 30) status = "Due Soon";

            derived.push({
              id: `derived-license-${l.id}`,
              client_id: l.client_id,
              partner_id: clientPartnerMap[l.client_id] || null,
              partner_uuid: clientCanonicalPartnerMap[l.client_id] || null,
              renewal_type: "License",
              renewal_date: l.license_end_date,
              estimated_value: null,
              status,
              priority: days < 0 ? "Critical" : days <= 30 ? "High" : "Medium",
              assigned_owner: null,
              notes: null,
            });
            coveredKeys.add(key);
          }
        }

        if (l.sat_end_date && l.sat_active) {
          const key = `${l.client_id}::SAT`;
          if (!coveredKeys.has(key)) {
            const days = Math.ceil((new Date(l.sat_end_date).getTime() - Date.now()) / 86400000);
            let status = "Upcoming";
            if (days < 0) status = "Expired";
            else if (days <= 30) status = "Due Soon";

            derived.push({
              id: `derived-sat-${l.id}`,
              client_id: l.client_id,
              partner_id: clientPartnerMap[l.client_id] || null,
              partner_uuid: clientCanonicalPartnerMap[l.client_id] || null,
              renewal_type: "SAT",
              renewal_date: l.sat_end_date,
              estimated_value: null,
              status,
              priority: days < 0 ? "Critical" : days <= 30 ? "High" : "Medium",
              assigned_owner: null,
              notes: null,
            });
            coveredKeys.add(key);
          }
        }
      }

      // Merge explicit + derived, sort by renewal_date
      const all = [...explicit, ...derived];
      all.sort((a: any, b: any) => (a.renewal_date || "").localeCompare(b.renewal_date || ""));

      // --- Consolidate: one commercial renewal per client ---
      // License / Contract / S&AT are implementation details of a single commercial
      // renewal. Group every underlying record by client_id and emit a single row.
      const SERVICE_LABEL: Record<string, string> = {
        License: "License",
        Contract: "Contract",
        SAT: "Support & Maintenance",
      };
      const byClient = new Map<string, any[]>();
      const orphans: any[] = []; // rows without client_id stay as-is
      for (const r of all) {
        if (!r.client_id) { orphans.push(r); continue; }
        const arr = byClient.get(r.client_id) || [];
        arr.push(r);
        byClient.set(r.client_id, arr);
      }

      const consolidated: any[] = [];
      for (const [clientId, rawComponents] of byClient.entries()) {
        // A closed cycle owns its period: derived rows for it never come back as pending.
        const components = suppressDerivedForClosedCycles(rawComponents);
        // Active pipeline = the open operational cycle. Closed history and stale
        // derived rows must never shadow the cycle created by a closure.
        const selection = selectActiveCycle(components);
        if (!selection) continue;
        const primary = selection.primary;
        const scope = selection.isClosed ? [primary] : selection.valueComponents;

        // Prefer an explicit (non-derived) row for ownership / notes / id.
        const isExplicit = (c: any) => !isDerivedComponent(c);
        const explicitRow = (isExplicit(primary) ? primary : scope.find(isExplicit)) || null;
        const base = explicitRow || primary;

        // Highest estimated value within the selected cycle.
        const value = scope.reduce(
          (max, c) => Math.max(max, Number(c.estimated_value || 0)),
          0,
        );

        // Included services list, deduped, ordered License → Contract → S&AT.
        const services: string[] = [];
        for (const k of ["License", "Contract", "SAT"]) {
          if (components.some((c) => c.renewal_type === k)) services.push(SERVICE_LABEL[k]);
        }

        consolidated.push({
          ...base,
          id: base.id,
          client_id: clientId,
          partner_id: base.partner_id ?? primary.partner_id ?? null,
          renewal_date: primary.renewal_date,
          estimated_value: value || null,
          status: primary.status,
          priority: primary.priority,
          assigned_owner: explicitRow?.assigned_owner ?? primary.assigned_owner ?? null,
          notes: explicitRow?.notes ?? primary.notes ?? null,
          // Commercial renewal metadata
          renewal_type: "Commercial",
          included_services: services,
          _components: components,
        });
      }

      const rows = [...consolidated, ...orphans];
      const result = filters?.includeHistory ? withRenewalHistory(rows, explicit) : rows;
      result.sort((a, b) => (a.renewal_date || "").localeCompare(b.renewal_date || ""));
      return result;
    },
  });
}

export function useNotifications(enabled: boolean = true) {
  const query = useNotificationInbox(enabled, { unreadOnly: true, pageSize: 15 });
  return { ...query, data: query.data?.items };
}

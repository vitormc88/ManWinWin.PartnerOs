import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllProfilesMap } from "@/hooks/useAssignableUsers";
import {
  fetchAllPages, buildOpportunityRows, buildRenewalRows, applyLossFilters, categoryDistribution,
  reasonDistribution, lossSummary, dayStart, dayEnd, NO_PARTNER, type LossRow,
} from "@/lib/loss-analysis";

const eur = (v: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

function useLossData(enabled: boolean) {
  return useQuery({
    queryKey: ["analytics", "loss-analysis"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [deals, details, reasons, renewals, partners] = await Promise.all([
        fetchAllPages<any>((f, t) => supabase.from("deals").select("id,status,company_name,partner_id,total_value,expected_value,assigned_user_id,assigned_salesperson,lost_at").eq("status", "Lost").order("id").range(f, t)),
        fetchAllPages<any>((f, t) => supabase.from("opportunity_loss_details").select("id,deal_id,loss_category,competitor_name,competitor_other,notes,lost_at").order("id").range(f, t)),
        fetchAllPages<any>((f, t) => supabase.from("opportunity_loss_reasons").select("loss_detail_id,reason").order("id").range(f, t)),
        fetchAllPages<any>((f, t) => supabase.from("renewals").select("id,client_id,partner_id,partner_uuid,status,outcome,closed_at,assigned_user_id,assigned_owner,estimated_value,loss_reason,closing_notes").or("status.ilike.lost,outcome.ilike.lost").order("id").range(f, t)),
        fetchAllPages<any>((f, t) => supabase.from("partners").select("id,company_name").order("id").range(f, t)),
      ]);
      const clientIds = [...new Set(renewals.map((r) => r.client_id).filter(Boolean))];
      const clientNames = new Map<string, string>();
      for (let i = 0; i < clientIds.length; i += 200) {
        const { data, error } = await supabase.from("clients").select("id,commercial_name,short_name").in("id", clientIds.slice(i, i + 200));
        if (error) throw error;
        (data || []).forEach((c: any) => clientNames.set(c.id, c.commercial_name || c.short_name));
      }
      return {
        opportunities: buildOpportunityRows(deals, details, reasons),
        renewals: buildRenewalRows(renewals, clientNames),
        partnerNames: new Map<string, string>(partners.map((p) => [p.id, p.company_name])),
      };
    },
  });
}

function Bars({ title, items, total, showValue, note }: { title: string; items: { label: string; count: number; value?: number }[]; total: number; showValue?: boolean; note?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {note && <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>}
      {items.length === 0 ? <p className="text-xs text-muted-foreground py-4">No records in this selection.</p> : (
        <div className="space-y-2 mt-3">
          {items.map((i) => (
            <div key={i.label}>
              <div className="flex justify-between text-xs"><span className="text-foreground">{i.label}</span>
                <span className="text-muted-foreground">{i.count} ({total ? Math.round((i.count / total) * 100) : 0}%){showValue && i.value !== undefined ? ` · ${eur(i.value)}` : ""}</span></div>
              <div className="h-1.5 rounded bg-muted mt-1"><div className="h-1.5 rounded bg-primary" style={{ width: `${(i.count / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export function LossAnalysis({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const q = useLossData(active);
  const profiles = useAllProfilesMap();
  const [type, setType] = useState<"opportunity" | "renewal">("opportunity");
  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partner, setPartner] = useState("all");
  const [owner, setOwner] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const bounds = useMemo(() => {
    const now = new Date();
    if (preset === "ytd") return { from: dayStart(new Date(now.getFullYear(), 0, 1)), to: dayEnd(now) };
    if (preset === "90") { const s = new Date(now); s.setDate(s.getDate() - 89); return { from: dayStart(s), to: dayEnd(now) }; }
    if (preset === "custom") return { from: from ? dayStart(new Date(`${from}T00:00:00`)) : null, to: to ? dayEnd(new Date(`${to}T00:00:00`)) : null };
    return { from: null, to: null };
  }, [preset, from, to]);

  const base: LossRow[] = q.data ? (type === "opportunity" ? q.data.opportunities : q.data.renewals) : [];
  const ownerName = (r: LossRow) => r.ownerUserId ? (profiles.data?.get(r.ownerUserId)?.full_name || profiles.data?.get(r.ownerUserId)?.email || "Unknown user") : (r.ownerText ? `${r.ownerText} (unlinked)` : "Unassigned");
  const partnerName = (id: string | null) => id ? (q.data?.partnerNames.get(id) || "Unknown partner") : "HQ Direct / Unassigned";
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    base.forEach((r) => r.ownerKey && m.set(r.ownerKey, ownerName(r)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [base, profiles.data]);
  const partners = useMemo(() => [...new Set(base.map((r) => r.partnerId).filter(Boolean) as string[])].map((id) => [id, partnerName(id)] as const).sort((a, b) => a[1].localeCompare(b[1])), [base, q.data]);

  const { rows, undatedExcluded } = applyLossFilters(base, {
    ...bounds,
    partnerId: partner === "all" ? null : partner,
    ownerKey: owner === "all" ? null : owner,
  });
  const sorted = [...rows].sort((a, b) => (b.lostAt ?? "").localeCompare(a.lostAt ?? ""));
  const s = lossSummary(rows);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const pageRows = sorted.slice(page * PAGE, page * PAGE + PAGE);

  if (q.isError || profiles.isError) return <p className="text-sm text-center py-8 text-muted-foreground">Loss data unavailable — figures are hidden rather than shown as zero.</p>;
  if (q.isLoading || profiles.isLoading || !q.data) return <p className="text-sm text-center py-8 text-muted-foreground">Loading loss data…</p>;

  const isOpp = type === "opportunity";
  const reset = () => setPage(0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={type} onValueChange={(v: any) => { setType(v); setOwner("all"); setPartner("all"); reset(); }}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="opportunity">Opportunities</SelectItem><SelectItem value="renewal">Renewals</SelectItem></SelectContent>
        </Select>
        <Select value={preset} onValueChange={(v) => { setPreset(v); reset(); }}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All time</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent>
        </Select>
        {preset === "custom" && <>
          <Input type="date" className="w-40 h-9" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} aria-label="From" />
          <Input type="date" className="w-40 h-9" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} aria-label="To" />
        </>}
        <Select value={partner} onValueChange={(v) => { setPartner(v); reset(); }}>
          <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All partners</SelectItem><SelectItem value={NO_PARTNER}>HQ Direct / Unassigned</SelectItem>
            {partners.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={owner} onValueChange={(v) => { setOwner(v); reset(); }}>
          <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All owners</SelectItem>
            {owners.map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {undatedExcluded > 0 && <p className="text-xs text-muted-foreground">{undatedExcluded} loss(es) without a recorded loss date are excluded from this period (included in All time).</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label={isOpp ? "Lost opportunities" : "Lost renewals"} value={String(s.count)} />
        <Card label={isOpp ? "Lost opportunity value" : "Estimated renewal value lost"} value={eur(s.value)} sub={s.valueMissing ? `${s.valueMissing} with no value recorded` : undefined} />
        <Card label="Explanation coverage" value={s.coverage === null ? "—" : `${s.coverage}%`} sub={isOpp ? "Category recorded" : "Loss reason recorded"} />
        <Card label="Missing explanation" value={String(s.missingCategory)} sub={isOpp ? `${s.missingReasons} without detailed reasons` : undefined} />
      </div>

      {s.count === 0 ? <p className="text-sm text-center py-6 text-muted-foreground">No losses recorded for this selection.</p> : <>
        <div className="grid md:grid-cols-2 gap-3">
          <Bars title={isOpp ? "Loss category" : "Loss reason"} items={categoryDistribution(rows)} total={s.count} showValue />
          {isOpp && <Bars title="Detailed reasons" items={reasonDistribution(rows)} total={s.count} note="A deal can have several reasons, so shares can add up to more than 100%. Values are not split by reason." />}
        </div>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr className="border-b">
              <th className="text-left p-2">{isOpp ? "Opportunity" : "Client"}</th><th className="text-left p-2">Partner</th><th className="text-left p-2">Owner</th>
              <th className="text-left p-2">Loss date</th><th className="text-right p-2">{isOpp ? "Value" : "Est. value"}</th><th className="text-left p-2">{isOpp ? "Category / reasons" : "Reason"}</th></tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="p-2"><button className="text-primary hover:underline" onClick={(e) => { e.stopPropagation(); navigate(isOpp ? `/deals/${r.id}` : `/renewals?renewal=${r.id}`); }}>{r.name}</button></td>
                    <td className="p-2">{partnerName(r.partnerId)}</td>
                    <td className="p-2">{ownerName(r)}</td>
                    <td className="p-2">{r.lostAt ? new Date(r.lostAt).toLocaleDateString() : "Not recorded"}</td>
                    <td className="p-2 text-right">{r.valueMissing ? "Not recorded" : eur(r.value)}</td>
                    <td className="p-2"><span className="font-medium">{r.category ?? "Not recorded"}</span>
                      {r.reasons.map((x) => <Badge key={x} variant="secondary" className="ml-1 text-[10px] font-normal">{x}</Badge>)}</td>
                  </tr>
                  {open === r.id && <tr className="border-b bg-muted/30"><td colSpan={6} className="p-2 text-muted-foreground">
                    {r.competitor && <div>Competitor: <span className="text-foreground">{r.competitor}</span></div>}
                    <div>{isOpp ? "Notes" : "Closing notes"}: <span className="text-foreground">{r.notes || "None"}</span></div>
                  </td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          {pages > 1 && <div className="flex justify-end gap-2 p-2 text-xs">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button>
            <span>{page + 1} / {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button>
          </div>}
        </div>
      </>}
    </div>
  );
}

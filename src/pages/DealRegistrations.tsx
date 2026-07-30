import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDealRegistrations } from "@/hooks/useCommissions";
import { usePartners } from "@/hooks/usePartners";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Clock, XCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusConfig: Record<string, { variant: "warning" | "success" | "destructive" | "secondary"; icon: typeof Clock }> = {
  Pending: { variant: "warning", icon: Clock },
  Approved: { variant: "success", icon: ShieldCheck },
  Rejected: { variant: "destructive", icon: XCircle },
};
const unknownStatus = { variant: "secondary" as const, icon: HelpCircle };

export default function DealRegistrations() {
  const [filter, setFilter] = useState<"all" | "Pending" | "Approved" | "Rejected">("all");
  const { data: registrations, isLoading, isError, error } = useDealRegistrations();
  const { isHQ, profile } = useAuth();
  const { canEdit, canAdmin } = useModuleAccess();
  const canReview = isHQ && (canEdit("deal_registrations") || canAdmin("deal_registrations"));
  // Partner users must never depend on the full partners table being readable.
  const { data: partners } = usePartners(undefined, { enabled: isHQ });
  const queryClient = useQueryClient();

  const rows = useMemo(() => (Array.isArray(registrations) ? registrations : []), [registrations]);

  const partnerMap = useMemo(
    () => new Map((partners ?? []).map((p: any) => [p.id, p.company_name])),
    [partners]
  );

  const partnerLabel = (partnerId: string | null | undefined) => {
    if (!partnerId) return "—";
    const known = partnerMap.get(partnerId);
    if (known) return known;
    if (profile?.partner_id && partnerId === profile.partner_id) return "Your organisation";
    return "—";
  };

  const filtered = filter === "all" ? rows : rows.filter((r: any) => r.registration_status === filter);
  const pending = rows.filter((r: any) => r.registration_status === "Pending").length;

  // Duplicate detection
  const conflicts = useMemo(() => {
    const nameGroups = new Map<string, any[]>();
    rows.forEach((r: any) => {
      const key = String((r.deals as any)?.company_name || "").toLowerCase().replace(/\s+/g, "");
      if (!key) return;
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key)!.push(r);
    });
    return [...nameGroups.values()].filter(g => g.length > 1);
  }, [rows]);

  const handleAction = async (id: string, status: "Approved" | "Rejected") => {
    const { error: updateError } = await supabase.from("deal_registrations").update({
      registration_status: status,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (updateError) { toast.error(updateError.message || "Failed to update"); return; }
    toast.success(`Registration ${status.toLowerCase()}`);
    queryClient.invalidateQueries({ queryKey: ["deal_registrations"] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="rounded-xl border bg-card p-6 text-center">
          <AlertTriangle className="h-6 w-6 mx-auto text-destructive mb-2" />
          <p className="text-sm font-semibold text-foreground">Unable to load deal registrations</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as any)?.message || "Please refresh the page or contact your administrator."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Deal Registrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} registration{rows.length === 1 ? "" : "s"}{canReview ? ` · ${pending} pending approval` : ""}
        </p>
      </div>

      {canReview && conflicts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3 animate-reveal-up" style={{ animationDelay: "60ms" }}>
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Potential Conflicts Detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">{conflicts.length} company name{conflicts.length > 1 ? "s" : ""} appear in multiple registrations</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap animate-reveal-up" style={{ animationDelay: "90ms" }}>
        {(["all", "Pending", "Approved", "Rejected"] as const).map(status => (
          <button key={status} onClick={() => setFilter(status)}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${filter === status ? "bg-primary text-primary-foreground" : "bg-card border text-muted-foreground hover:bg-secondary"}`}>
            {status === "all" ? "All" : status} {status === "Pending" && pending > 0 && `(${pending})`}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up" style={{ animationDelay: "120ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Partner</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Country</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Value</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Submitted</th>
                {canReview && <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((reg: any) => {
                const deal = (reg?.deals as any) ?? null;
                const status = reg?.registration_status ?? null;
                const cfg = (status && statusConfig[status]) || unknownStatus;
                const StatusIcon = cfg.icon;
                const submitted = reg?.submitted_at ? new Date(reg.submitted_at) : null;
                return (
                  <tr key={reg.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3">
                      {reg?.deal_id ? (
                        <Link to={`/deals/${reg.deal_id}`} className="font-medium text-foreground hover:text-primary transition-colors">{deal?.company_name || "—"}</Link>
                      ) : (
                        <span className="font-medium text-foreground">{deal?.company_name || "—"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{partnerLabel(reg?.partner_id)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{deal?.country || "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">€{Number(deal?.expected_value || 0).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <Badge variant={cfg.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status || "Unknown"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {submitted && !Number.isNaN(submitted.getTime()) ? submitted.toLocaleDateString("en-GB") : "—"}
                    </td>
                    {canReview && (
                      <td className="px-5 py-3 text-right">
                        {status === "Pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleAction(reg.id, "Approved")} className="h-7 px-2.5 rounded-md bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 transition-colors active:scale-95">Approve</button>
                            <button onClick={() => handleAction(reg.id, "Rejected")} className="h-7 px-2.5 rounded-md border text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors active:scale-95">Reject</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canReview ? 7 : 6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0 ? "No deal registrations yet." : "No registrations match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

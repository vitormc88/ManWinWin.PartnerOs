import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { RefreshCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRenewals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { useClients } from "@/hooks/useClients";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusColors: Record<string, string> = {
  "Upcoming": "bg-info/10 text-info border-info/20",
  "Due Soon": "bg-warning/15 text-warning-foreground border-warning/30",
  "In Negotiation": "bg-purple-50 text-purple-700 border-purple-200",
  "Quoted": "bg-info/10 text-info border-info/20",
  "Won": "bg-success/10 text-success border-success/20",
  "Lost": "bg-destructive/10 text-destructive border-destructive/20",
  "Expired": "bg-muted text-muted-foreground border-border",
};

const priorityColors: Record<string, string> = {
  "Critical": "bg-destructive/10 text-destructive",
  "High": "bg-warning/15 text-warning-foreground",
  "Medium": "bg-info/10 text-info",
  "Low": "bg-success/10 text-success",
};

export default function Renewals() {
  const { data: renewals = [], isLoading } = useRenewals();
  const { data: partners = [] } = usePartners();
  const { data: clients = [] } = useClients();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clientMap = useMemo(() => {
    const m: Record<string, any> = {};
    clients.forEach(c => { m[c.id] = c; });
    return m;
  }, [clients]);

  const partnerMap = useMemo(() => {
    const m: Record<string, string> = {};
    partners.forEach(p => { m[p.id] = p.company_name; });
    return m;
  }, [partners]);

  const now = new Date();

  const enriched = useMemo(() => {
    return renewals.map((r: any) => {
      const cl = clientMap[r.client_id];
      const days = r.renewal_date ? Math.ceil((new Date(r.renewal_date).getTime() - now.getTime()) / 86400000) : 999;
      return { ...r, clientName: cl?.commercial_name || "Unknown", clientCode: cl?.client_code || "", partnerName: r.partner_id ? (partnerMap[r.partner_id] || "Unknown") : "HQ Direct", daysUntil: days };
    });
  }, [renewals, clientMap, partnerMap]);

  const filtered = useMemo(() => {
    return enriched.filter(r => {
      if (search && !r.clientName.toLowerCase().includes(search.toLowerCase()) && !r.clientCode.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.renewal_type !== typeFilter) return false;
      if (partnerFilter !== "all" && r.partner_id !== partnerFilter) return false;
      return true;
    });
  }, [enriched, search, statusFilter, typeFilter, partnerFilter]);

  const stats = useMemo(() => ({
    total: enriched.length,
    expired: enriched.filter(r => r.status === "Expired").length,
    dueSoon: enriched.filter(r => r.status === "Due Soon").length,
    inProgress: enriched.filter(r => r.status === "In Negotiation" || r.status === "Quoted").length,
    atRisk: enriched.filter(r => r.daysUntil < 0 && r.status !== "Won").length,
    totalValue: enriched.reduce((s, r) => s + Number(r.estimated_value || 0), 0),
  }), [enriched]);

  const detail = selectedId ? enriched.find(r => r.id === selectedId) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Renewals Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage all license, SAT and contract renewals</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-reveal-up stagger-1">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Due Soon", value: stats.dueSoon, color: "text-amber-600" },
          { label: "In Progress", value: stats.inProgress, color: "text-purple-600" },
          { label: "At Risk", value: stats.atRisk, color: "text-destructive" },
          { label: "Expired", value: stats.expired, color: "text-muted-foreground" },
          { label: "Pipeline Value", value: `€${(stats.totalValue / 1000).toFixed(0)}k`, color: "text-foreground" },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border shadow-sm p-4">
            <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 animate-reveal-up stagger-2">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search client..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["Upcoming", "Due Soon", "In Negotiation", "Quoted", "Won", "Lost", "Expired"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="License">License</SelectItem>
            <SelectItem value="SAT">SAT</SelectItem>
            <SelectItem value="Contract">Contract</SelectItem>
          </SelectContent>
        </Select>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Partner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-secondary/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Partner</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Days</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
            </tr></thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading renewals...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No renewals found.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedId(r.id)}>
                  <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityColors[r.priority || "Medium"] || ""}`}>{r.priority}</span></td>
                  <td className="px-4 py-3"><Link to={`/clients/${r.client_id}`} className="font-medium text-foreground hover:text-primary" onClick={e => e.stopPropagation()}>{r.clientCode}</Link><p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.clientName}</p></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.partnerName}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-[11px]">{r.renewal_type}</Badge></td>
                  <td className="px-4 py-3 tabular-nums text-xs">{r.renewal_date}</td>
                  <td className="px-4 py-3"><span className={`tabular-nums text-xs font-semibold ${r.daysUntil < 0 ? "text-destructive" : r.daysUntil <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>{r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d overdue` : `${r.daysUntil}d`}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColors[r.status] || ""}`}>{r.status}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">€{Number(r.estimated_value || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.assigned_owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.clientName}</DialogTitle>
                <p className="text-sm text-muted-foreground">{detail.renewal_type} Renewal · {detail.clientCode}</p>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Status</span><p className="font-medium mt-0.5">{detail.status}</p></div>
                  <div><span className="text-muted-foreground">Priority</span><p className="font-medium mt-0.5">{detail.priority}</p></div>
                  <div><span className="text-muted-foreground">Renewal Date</span><p className="font-medium mt-0.5 tabular-nums">{detail.renewal_date}</p></div>
                  <div><span className="text-muted-foreground">Days Until</span><p className="font-medium mt-0.5 tabular-nums">{detail.daysUntil < 0 ? `${Math.abs(detail.daysUntil)} overdue` : `${detail.daysUntil} days`}</p></div>
                  <div><span className="text-muted-foreground">Estimated Value</span><p className="font-medium mt-0.5 tabular-nums">€{Number(detail.estimated_value || 0).toLocaleString()}</p></div>
                  <div><span className="text-muted-foreground">Owner</span><p className="font-medium mt-0.5">{detail.assigned_owner}</p></div>
                </div>
                {detail.notes && (
                  <div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground mb-1">Notes</p><p className="text-sm text-muted-foreground">{detail.notes}</p></div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

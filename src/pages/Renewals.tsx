import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { RefreshCcw, Filter, Search, ArrowUpDown, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mockRenewals, RenewalWorkflowStatus, RenewalType, RenewalPriority, mockRenewalActivities } from "@/data/renewals-mock-data";
import { RenewalBadge } from "@/components/clients/RenewalBadge";
import { getRenewalStatus, partnerRenewalSettings, defaultRenewalSettings } from "@/data/clients-mock-data";
import { partners } from "@/data/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusColors: Record<RenewalWorkflowStatus, string> = {
  "Upcoming": "bg-blue-50 text-blue-700 border-blue-200",
  "Due Soon": "bg-amber-50 text-amber-700 border-amber-200",
  "In Negotiation": "bg-purple-50 text-purple-700 border-purple-200",
  "Quoted": "bg-sky-50 text-sky-700 border-sky-200",
  "Won": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Lost": "bg-red-50 text-red-700 border-red-200",
  "Expired": "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityColors: Record<RenewalPriority, string> = {
  "Critical": "bg-red-100 text-red-800",
  "High": "bg-orange-100 text-orange-800",
  "Medium": "bg-yellow-100 text-yellow-800",
  "Low": "bg-green-100 text-green-800",
};

const statusFlow: RenewalWorkflowStatus[] = ["Upcoming", "Due Soon", "In Negotiation", "Quoted", "Won", "Lost", "Expired"];

export default function Renewals() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [selectedRenewal, setSelectedRenewal] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return mockRenewals.filter(r => {
      if (search && !r.clientName.toLowerCase().includes(search.toLowerCase()) && !r.clientCode.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.renewalType !== typeFilter) return false;
      if (partnerFilter !== "all" && r.partnerId !== partnerFilter) return false;
      return true;
    });
  }, [search, statusFilter, typeFilter, partnerFilter]);

  const stats = useMemo(() => {
    const all = mockRenewals;
    return {
      total: all.length,
      expired: all.filter(r => r.status === "Expired").length,
      dueSoon: all.filter(r => r.status === "Due Soon").length,
      inNegotiation: all.filter(r => r.status === "In Negotiation" || r.status === "Quoted").length,
      atRisk: all.filter(r => r.daysUntil < 0 || (r.daysUntil <= 30 && r.status !== "Won")).length,
      totalValue: all.reduce((s, r) => s + r.estimatedValue, 0),
    };
  }, []);

  const detail = selectedRenewal ? mockRenewals.find(r => r.id === selectedRenewal) : null;
  const detailActivities = selectedRenewal ? mockRenewalActivities.filter(a => a.renewalId === selectedRenewal) : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Renewals Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage all license, SAT and contract renewals</p>
        </div>
        <button className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.97]">
          <RefreshCcw className="h-4 w-4 inline mr-2" />
          Sync Renewals
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-reveal-up stagger-1">
        {[
          { label: "Total Renewals", value: stats.total, color: "text-foreground" },
          { label: "Due Soon", value: stats.dueSoon, color: "text-amber-600" },
          { label: "In Progress", value: stats.inNegotiation, color: "text-purple-600" },
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 animate-reveal-up stagger-2">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search client..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statusFlow.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
            {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Renewals Table */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Partner</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Renewal Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Days</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Est. Value</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedRenewal(r.id)}>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityColors[r.priority]}`}>
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/clients/${r.clientId}`} className="font-medium text-foreground hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                      {r.clientCode}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.clientName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.partnerName}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[11px] font-normal">{r.renewalType}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs">{r.renewalDate}</td>
                  <td className="px-4 py-3">
                    <span className={`tabular-nums text-xs font-semibold ${r.daysUntil < 0 ? "text-destructive" : r.daysUntil <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d overdue` : `${r.daysUntil}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColors[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">€{r.estimatedValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.assignedOwner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renewal Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={() => setSelectedRenewal(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{detail.clientName}</DialogTitle>
                <p className="text-sm text-muted-foreground">{detail.renewalType} Renewal · {detail.clientCode}</p>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Status</span><p className="font-medium mt-0.5">{detail.status}</p></div>
                  <div><span className="text-muted-foreground">Priority</span><p className="font-medium mt-0.5">{detail.priority}</p></div>
                  <div><span className="text-muted-foreground">Renewal Date</span><p className="font-medium mt-0.5 tabular-nums">{detail.renewalDate}</p></div>
                  <div><span className="text-muted-foreground">Days Until</span><p className="font-medium mt-0.5 tabular-nums">{detail.daysUntil < 0 ? `${Math.abs(detail.daysUntil)} overdue` : `${detail.daysUntil} days`}</p></div>
                  <div><span className="text-muted-foreground">Estimated Value</span><p className="font-medium mt-0.5 tabular-nums">€{detail.estimatedValue.toLocaleString()}</p></div>
                  <div><span className="text-muted-foreground">Owner</span><p className="font-medium mt-0.5">{detail.assignedOwner}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Partner</span><p className="font-medium mt-0.5">{detail.partnerName}</p></div>
                </div>

                {/* Workflow actions */}
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {["Contacted", "Quoted", "Negotiating", "Won", "Lost"].map(action => (
                      <button key={action} className="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-secondary transition-colors active:scale-[0.97]">
                        Mark as {action}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity log */}
                {detailActivities.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Activity</p>
                    <div className="space-y-2">
                      {detailActivities.map(a => (
                        <div key={a.id} className="text-xs">
                          <span className="font-medium">{a.performedBy}</span>
                          <span className="text-muted-foreground"> · {a.action}</span>
                          {a.notes && <p className="text-muted-foreground mt-0.5">{a.notes}</p>}
                          <p className="text-muted-foreground/60 mt-0.5">{new Date(a.createdAt).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.notes && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-muted-foreground">{detail.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

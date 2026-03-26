import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIncomingLeads, type IncomingLead } from "@/hooks/useIncomingLeads";
import { usePartners } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink, Building2 } from "lucide-react";
import { format } from "date-fns";

const statusColor = (s: string) => {
  switch (s) {
    case "New": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Assigned": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "In Review": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "Contacted": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    case "Qualified": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "Rejected": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function IncomingLeads() {
  const { data: leads = [], isLoading } = useIncomingLeads();
  const { data: partners = [] } = usePartners();
  const { isHQ, isAdmin } = useAuth();
  const navigate = useNavigate();

  const isHQUser = isHQ || isAdmin;

  const [search, setSearch] = useState("");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterPartner, setFilterPartner] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const activePartners = partners.filter(p => p.is_active);

  const filtered = leads.filter(lead => {
    const matchesSearch = !search || [lead.company_name, lead.contact_name, lead.email, lead.country]
      .filter(Boolean).some(v => v!.toLowerCase().includes(search.toLowerCase()));
    const matchesOwner = filterOwner === "all" || lead.lead_owner_type === filterOwner;
    const matchesPartner = filterPartner === "all" || lead.linked_partner_id === filterPartner;
    const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
    return matchesSearch && matchesOwner && matchesPartner && matchesStatus;
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading incoming leads…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage incoming leads from all sources.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, contact, email, country…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {isHQUser && (
          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Partner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Partners</SelectItem>
              {activePartners
                .sort((a, b) => a.company_name.localeCompare(b.company_name))
                .map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterOwner} onValueChange={setFilterOwner}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Owner type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            <SelectItem value="HQ">HQ</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Assigned">Assigned</SelectItem>
            <SelectItem value="In Review">In Review</SelectItem>
            <SelectItem value="Contacted">Contacted</SelectItem>
            <SelectItem value="Qualified">Qualified</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Country</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Assigned Partner</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Owner</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 font-medium text-muted-foreground w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    No leads found.
                  </td>
                </tr>
              ) : (
                filtered.map(lead => (
                  <tr
                    key={lead.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/incoming-leads/${lead.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {lead.company_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.contact_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.country || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {lead.partners ? (
                        <Badge variant="secondary" className="gap-1">
                          <Building2 className="h-3 w-3" />
                          {lead.partners.company_name}
                        </Badge>
                      ) : (
                        <Badge variant="outline">HQ</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.lead_owner_type || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColor(lead.status || "New")}>
                        {lead.status || "New"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

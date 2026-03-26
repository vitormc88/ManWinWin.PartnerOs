import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIncomingLeads, useUpdateIncomingLead, type IncomingLead } from "@/hooks/useIncomingLeads";
import { usePartners } from "@/hooks/usePartners";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ExternalLink, Building2, Plus, Inbox } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";

const JOB_ROLE_OPTIONS = [
  "Maintenance Manager",
  "Plant Manager",
  "General Manager",
  "IT Manager",
  "Unknown",
];
const ASSET_RANGE_OPTIONS = ["1–100", "101–250", "+250"];
const TEAM_SIZE_OPTIONS = ["1–3", "4 or more", "Unknown"];

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

const defaultForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  country: "",
  sector: "",
  job_role: "",
  asset_range: "",
  maintenance_team_size: "",
  lead_source: "Manual",
  linked_partner_id: "",
  assigned_to: "",
  notes: "",
};

export default function IncomingLeads() {
  const { data: leads = [], isLoading } = useIncomingLeads();
  const { data: partners = [] } = usePartners();
  const { isHQ, isAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isHQUser = isHQ || isAdmin;
  const userPartnerId = !isHQUser ? profile?.partner_id : null;

  const [search, setSearch] = useState("");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterPartner, setFilterPartner] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...defaultForm, linked_partner_id: userPartnerId || "" });
  const [creating, setCreating] = useState(false);

  const { data: partnerUsers = [] } = usePartnerUsers(form.linked_partner_id || userPartnerId || null);

  const activePartners = partners.filter(p => p.is_active);

  const filtered = leads.filter(lead => {
    const matchesSearch = !search || [lead.company_name, lead.contact_name, lead.email, lead.country]
      .filter(Boolean).some(v => v!.toLowerCase().includes(search.toLowerCase()));
    const matchesOwner = filterOwner === "all" || lead.lead_owner_type === filterOwner;
    const matchesPartner = filterPartner === "all" || lead.linked_partner_id === filterPartner;
    const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
    return matchesSearch && matchesOwner && matchesPartner && matchesStatus;
  });

  const handleCreate = async () => {
    if (!form.company_name.trim()) {
      toast.error("Company Name is required");
      return;
    }
    setCreating(true);
    try {
      const partnerId = userPartnerId || form.linked_partner_id || null;
      const { error } = await supabase.from("incoming_leads").insert({
        company_name: form.company_name,
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        country: form.country || null,
        sector: form.sector || null,
        job_role: form.job_role || null,
        asset_range: form.asset_range || null,
        maintenance_team_size: form.maintenance_team_size || null,
        lead_source: form.lead_source || "Manual",
        linked_partner_id: partnerId,
        lead_owner_type: partnerId ? "partner" : "HQ",
        notes: form.notes || null,
        status: "New",
      });
      if (error) throw error;
      toast.success("Lead created successfully");
      queryClient.invalidateQueries({ queryKey: ["incoming_leads"] });
      setShowCreate(false);
      setForm({ ...defaultForm, linked_partner_id: userPartnerId || "" });
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("permission denied")) {
        toast.error("You do not have permission to create leads.");
      } else {
        toast.error(msg || "Failed to create lead");
      }
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Incoming Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} lead{leads.length !== 1 ? "s" : ""} from all sources
          </p>
        </div>
        {isHQUser && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Lead
          </Button>
        )}
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
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table or Empty State */}
      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">No leads yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Incoming leads from SharpSpring or manual entry will appear here.
          </p>
          {isHQUser && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Lead
            </Button>
          )}
        </div>
      ) : (
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
                      No leads match your filters.
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
      )}

      {/* New Lead Dialog — mirrors Pipeline form */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Ownership */}
            <div className="grid grid-cols-2 gap-4">
              {isHQUser ? (
                <div>
                  <Label>Linked Partner</Label>
                  <Select
                    value={form.linked_partner_id || "none"}
                    onValueChange={v => setForm(f => ({ ...f, linked_partner_id: v === "none" ? "" : v, assigned_to: "" }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {activePartners
                        .sort((a, b) => a.company_name.localeCompare(b.company_name))
                        .map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Linked Partner</Label>
                  <Input value={partners.find(p => p.id === userPartnerId)?.company_name || "Your Partner"} disabled />
                </div>
              )}
              <div>
                <Label>Assigned To</Label>
                <Select
                  value={form.assigned_to || "none"}
                  onValueChange={v => setForm(f => ({ ...f, assigned_to: v === "none" ? "" : v }))}
                  disabled={!form.linked_partner_id && !userPartnerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!form.linked_partner_id && !userPartnerId ? "Select a partner first" : "Select user"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {partnerUsers.length === 0 && (form.linked_partner_id || userPartnerId) && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No users available</div>
                    )}
                    {partnerUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || "Unnamed"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lead details */}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact person name" /></div>
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Country</Label><CountryCombobox value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} /></div>
              <div>
                <Label>Lead Source</Label>
                <Select value={form.lead_source} onValueChange={v => setForm(f => ({ ...f, lead_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manual">Manual</SelectItem>
                    <SelectItem value="Partner (Outbound)">Partner (Outbound)</SelectItem>
                    <SelectItem value="HQ (Inbound)">HQ (Inbound)</SelectItem>
                    <SelectItem value="SharpSpring">SharpSpring</SelectItem>
                    <SelectItem value="Website">Website</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Job Role</Label>
                <Select value={form.job_role || "none"} onValueChange={v => setForm(f => ({ ...f, job_role: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {JOB_ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sector</Label>
                <SectorSelect value={form.sector} onChange={v => setForm(f => ({ ...f, sector: v }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>No. of Assets</Label>
                <Select value={form.asset_range || "none"} onValueChange={v => setForm(f => ({ ...f, asset_range: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {ASSET_RANGE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Maintenance Team</Label>
                <Select value={form.maintenance_team_size || "none"} onValueChange={v => setForm(f => ({ ...f, maintenance_team_size: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {TEAM_SIZE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating…" : "Create Lead"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

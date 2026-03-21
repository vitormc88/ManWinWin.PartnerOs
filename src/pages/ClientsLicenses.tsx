import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Download, Plus, ChevronDown, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientsKPIBar } from "@/components/clients/ClientsKPIBar";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { usePartners } from "@/hooks/usePartners";
import { toast } from "sonner";

export default function ClientsLicenses() {
  const navigate = useNavigate();
  const { data: clients = [], isLoading } = useClients();
  const { data: partners = [] } = usePartners();
  const createClient = useCreateClient();
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<string>("commercial_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ client_code: "", commercial_name: "", short_name: "", country: "", sector: "", partner_id: "", license_type: "", status: "Active" });

  const partnerMap = useMemo(() => {
    const m: Record<string, string> = {};
    partners.forEach(p => { m[p.id] = p.company_name; });
    return m;
  }, [partners]);

  const filtered = useMemo(() => {
    let list = [...clients];
    list = list.filter(c => showArchived ? c.status === "Archived" : c.status !== "Archived");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.commercial_name.toLowerCase().includes(q) || c.client_code.toLowerCase().includes(q) || (c.country || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
    }
    if (partnerFilter !== "all") {
      list = list.filter(c => partnerFilter === "hq" ? !c.partner_id : c.partner_id === partnerFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter(c => c.status === statusFilter);
    }
    list.sort((a, b) => {
      let av: any = (a as any)[sortField];
      let bv: any = (b as any)[sortField];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [clients, search, partnerFilter, statusFilter, sortField, sortDir, showArchived]);

  const activeCount = filtered.filter(c => c.status === "Active").length;
  const premiumCount = filtered.filter(c => c.is_premium).length;

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort(field)}>
      <span className="inline-flex items-center gap-1">{children}{sortField === field && <ChevronDown className={`h-3 w-3 transition-transform ${sortDir === "desc" ? "rotate-180" : ""}`} />}</span>
    </TableHead>
  );

  const handleExport = () => {
    const headers = ["Client Code", "Client Name", "Partner", "Country", "Sector", "License Type", "Version", "Status"];
    const rows = filtered.map(c => [c.client_code, c.commercial_name, c.partner_id ? (partnerMap[c.partner_id] || "Unknown") : "HQ Direct", c.country, c.sector, c.license_type, c.current_version, c.status]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "clients-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreate = async () => {
    if (!form.client_code || !form.commercial_name) { toast.error("Client code and commercial name are required"); return; }
    try {
      await createClient.mutateAsync({
        client_code: form.client_code,
        commercial_name: form.commercial_name,
        short_name: form.short_name || null,
        country: form.country || null,
        sector: form.sector || null,
        partner_id: form.partner_id || null,
        license_type: form.license_type || null,
        status: form.status,
      });
      toast.success("Client created successfully");
      setShowCreate(false);
      setForm({ client_code: "", commercial_name: "", short_name: "", country: "", sector: "", partner_id: "", license_type: "", status: "Active" });
    } catch (e: any) { toast.error(e?.message || "Failed to create client"); }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div className="animate-reveal-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Clients & Licenses</h1>
          <p className="text-sm text-muted-foreground mt-1">Centralized license management across all partners</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            <Archive className="h-4 w-4 mr-1.5" /> {showArchived ? "Show Active" : "Show Archived"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1.5" /> Export</Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Client</Button>
        </div>
      </div>

      <div className="animate-reveal-up" style={{ animationDelay: "60ms" }}>
        <ClientsKPIBar active={activeCount} total={filtered.length} premium={premiumCount} totalValue={0} renewals30={0} overdue={0} />
      </div>

      <div className="animate-reveal-up flex flex-wrap items-center gap-3" style={{ animationDelay: "120ms" }}>
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="All Partners" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            <SelectItem value="hq">HQ Direct</SelectItem>
            {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="animate-reveal-up rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" style={{ animationDelay: "180ms" }}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <SortHeader field="client_code">Code</SortHeader>
                <SortHeader field="commercial_name">Client</SortHeader>
                <TableHead>Partner</TableHead>
                <SortHeader field="country">Country</SortHeader>
                <SortHeader field="sector">Sector</SortHeader>
                <TableHead>License</TableHead>
                <TableHead>Version</TableHead>
                <SortHeader field="status">Status</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">Loading clients...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">{showArchived ? "No archived clients." : "No clients match your filters."} <button onClick={() => setShowCreate(true)} className="text-primary hover:underline">Create client</button></TableCell></TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => navigate(`/clients/${c.id}`)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.client_code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[160px]">
                      <span className="font-medium text-foreground">{c.short_name || c.commercial_name}</span>
                      {c.is_premium && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 bg-amber-50">Premium</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.partner_id ? (partnerMap[c.partner_id] || "Unknown") : "HQ Direct"}</TableCell>
                  <TableCell className="text-sm">{c.country}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.sector}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs font-normal">{c.license_type || "—"}</Badge></TableCell>
                  <TableCell className="text-xs tabular-nums">{c.current_version}</TableCell>
                  <TableCell><Badge variant={c.status === "Active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          Showing {filtered.length} of {clients.length} clients
        </div>
      </div>

      {/* Create Client Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Client</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Client Code *</Label><Input value={form.client_code} onChange={e => setForm(f => ({...f, client_code: e.target.value}))} placeholder="e.g. CL-001" /></div>
              <div><Label>Commercial Name *</Label><Input value={form.commercial_name} onChange={e => setForm(f => ({...f, commercial_name: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Short Name</Label><Input value={form.short_name} onChange={e => setForm(f => ({...f, short_name: e.target.value}))} /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Sector</Label><Input value={form.sector} onChange={e => setForm(f => ({...f, sector: e.target.value}))} /></div>
              <div>
                <Label>Linked Partner</Label>
                <Select value={form.partner_id || "none"} onValueChange={v => setForm(f => ({...f, partner_id: v === "none" ? "" : v}))}>
                  <SelectTrigger><SelectValue placeholder="HQ Direct" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">HQ Direct</SelectItem>
                    {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>License Type</Label><Input value={form.license_type} onChange={e => setForm(f => ({...f, license_type: e.target.value}))} placeholder="e.g. Business" /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createClient.isPending}>{createClient.isPending ? "Creating..." : "Create Client"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

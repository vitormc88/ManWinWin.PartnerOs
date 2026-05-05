import { usePartners, useCreatePartner, useArchivePartner, useRestorePartner, type Partner } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Search, Plus, Archive, RotateCcw, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CountryCodeCombobox } from "@/components/partners/CountryCodeCombobox";
import { usePartnershipLevels } from "@/hooks/usePartners";

const statusVariant: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  Active: "success", Inactive: "secondary", Negotiation: "warning", Archived: "secondary",
};

export default function Partners() {
  const { data: partners = [], isLoading } = usePartners();
  const createPartner = useCreatePartner();
  const archivePartner = useArchivePartner();
  const restorePartner = useRestorePartner();
  const { data: partnershipLevels = [] } = usePartnershipLevels();
  const { isAdmin, isHQ, profile } = useAuth();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const initialForm = { company_name: "", country: "", partnership_level: "", status: "Active", first_name: "", last_name: "", primary_contact_email: "", notes: "" };
  const [form, setForm] = useState(initialForm);

  const filtered = partners
    .filter(p => showArchived ? p.status === "Archived" : p.status !== "Archived")
    .filter(p => p.company_name.toLowerCase().includes(search.toLowerCase()) || (p.country || "").toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!form.company_name.trim()) { toast.error("Company name is required"); return; }
    if (!form.country) { toast.error("Country is required"); return; }
    if (form.primary_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.primary_contact_email)) { toast.error("Please enter a valid email"); return; }
    const dup = partners.some(p => p.company_name.trim().toLowerCase() === form.company_name.trim().toLowerCase());
    if (dup) { toast.error("A partner with this company name already exists"); return; }
    const primary_contact_name = [form.first_name, form.last_name].filter(Boolean).join(" ").trim() || null;
    try {
      await createPartner.mutateAsync({
        company_name: form.company_name.trim(),
        country: form.country,
        partnership_level: form.partnership_level || null,
        status: form.status,
        primary_contact_name,
        primary_contact_email: form.primary_contact_email || null,
        notes: form.notes || null,
      } as any);
      toast.success("Partner created successfully");
      setShowCreate(false);
      setForm(initialForm);
    } catch (e: any) { toast.error(e?.message || "Failed to create partner"); }
  };

  const handleArchive = async (id: string, name: string) => {
    try { await archivePartner.mutateAsync(id); toast.success(`${name} archived`); }
    catch (e: any) { toast.error(e?.message || "Failed to archive"); }
  };

  const handleRestore = async (id: string, name: string) => {
    try { await restorePartner.mutateAsync(id); toast.success(`${name} restored`); }
    catch (e: any) { toast.error(e?.message || "Failed to restore"); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Partner CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {partners.filter(p => p.status === "Active").length} active · {partners.filter(p => p.status === "Archived").length} archived
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
                <Archive className="h-4 w-4 mr-1.5" /> {showArchived ? "Show Active" : "Show Archived"}
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Partner</Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 animate-reveal-up stagger-1">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search by company or country..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-reveal-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Country</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Level</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Pipeline</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Health</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Clients</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">Loading partners...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">{showArchived ? "No archived partners." : "No partners found."} <button onClick={() => setShowCreate(true)} className="text-primary hover:underline">Create partner</button></td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/partners/${p.id}`} className="font-medium text-foreground hover:text-primary transition-colors">{p.company_name}</Link>
                    <p className="text-[11px] text-muted-foreground">{p.partner_code}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{p.country}</td>
                  <td className="px-5 py-3"><Badge variant="outline" className="text-xs font-normal">{p.partnership_level}</Badge></td>
                  <td className="px-5 py-3"><Badge variant={statusVariant[p.status || "Active"] || "secondary"}>{p.status}</Badge></td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-foreground">€{Number(p.total_revenue || 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">€{Number(p.pipeline_value || 0).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: (p.health_score ?? 50) >= 80 ? "hsl(var(--success))" : (p.health_score ?? 50) >= 60 ? "hsl(var(--info))" : (p.health_score ?? 50) >= 40 ? "hsl(var(--warning))" : "hsl(var(--destructive))" }} />
                      <span className="text-xs">{p.health_score ?? 50}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{p.number_of_clients ?? 0}</td>
                  <td className="px-5 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link to={`/partners/${p.id}`}>View Details</Link></DropdownMenuItem>
                        {isAdmin && (p.status === "Archived" ? (
                          <DropdownMenuItem onClick={() => handleRestore(p.id, p.company_name)}><RotateCcw className="h-4 w-4 mr-2" /> Restore</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleArchive(p.id, p.company_name)} className="text-destructive"><Archive className="h-4 w-4 mr-2" /> Archive</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Partner</DialogTitle></DialogHeader>
          <div className="space-y-6 mt-2">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Partner Information</h3>
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Country *</Label>
                  <CountryCodeCombobox value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} />
                </div>
                <div>
                  <Label>Partnership Level</Label>
                  <Select value={form.partnership_level} onValueChange={v => setForm(f => ({ ...f, partnership_level: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger>
                    <SelectContent>
                      {partnershipLevels.map(l => (
                        <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Contact Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>First Name</Label><Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
                <div><Label>Last Name</Label><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
              </div>
              <div><Label>Contact Email</Label><Input type="email" value={form.primary_contact_email} onChange={e => setForm(f => ({ ...f, primary_contact_email: e.target.value }))} /></div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">System</h3>
              <div>
                <Label>Partner Code</Label>
                <Input value="Auto-generated on save" readOnly disabled className="bg-muted/50 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground mt-1">Format: [COUNTRY]-[SHORTNAME]-[SEQ] · e.g. PT-DAS-001</p>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Notes</h3>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Optional notes..." />
            </section>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createPartner.isPending}>{createPartner.isPending ? "Creating..." : "Create Partner"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

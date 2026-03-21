import { useParams, Link, useNavigate } from "react-router-dom";
import { usePartner, useUpdatePartner, useArchivePartner } from "@/hooks/usePartners";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { useDeals } from "@/hooks/useDeals";
import { useRenewals } from "@/hooks/useDeals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Archive, Save, X, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

export default function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: partner, isLoading } = usePartner(id);
  const { data: clients = [] } = useClients({ partner_id: id });
  const { data: deals = [] } = useDeals({ partner_id: id });
  const { data: renewals = [] } = useRenewals();
  const updatePartner = useUpdatePartner();
  const archivePartner = useArchivePartner();
  const createClient = useCreateClient();
  const { data: certs = [] } = useQuery({
    queryKey: ["partner_certs", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase.from("partner_certifications").select("*").eq("partner_id", id);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const partnerRenewals = renewals.filter((r: any) => r.partner_id === id);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [clientForm, setClientForm] = useState({ client_code: "", commercial_name: "", country: "", sector: "" });
  const [dealForm, setDealForm] = useState({ company_name: "", country: "", expected_value: "", assigned_salesperson: "" });
  const [saving, setSaving] = useState(false);

  if (isLoading) return <div className="max-w-5xl mx-auto py-12 text-center text-muted-foreground">Loading...</div>;
  if (!partner) return (
    <div className="max-w-5xl mx-auto py-12 text-center">
      <p className="text-muted-foreground">Partner not found</p>
      <Link to="/partners" className="text-primary text-sm mt-2 inline-block hover:underline">← Back to Partners</Link>
    </div>
  );

  const startEdit = () => {
    setEditForm({
      company_name: partner.company_name,
      legal_name: partner.legal_name || "",
      primary_contact_name: partner.primary_contact_name || "",
      primary_contact_email: partner.primary_contact_email || "",
      phone: partner.phone || "",
      website: partner.website || "",
      country: partner.country || "",
      region: partner.region || "",
      partnership_level: partner.partnership_level || "Reseller",
      status: partner.status || "Active",
      alert_notice_days: partner.alert_notice_days ?? 60,
      onboarding_status: partner.onboarding_status || "Not Started",
      notes: partner.notes || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await updatePartner.mutateAsync({ id: partner.id, ...editForm });
      toast.success("Partner updated successfully");
      setEditing(false);
    } catch (e: any) { toast.error(e?.message || "Failed to update partner"); }
  };

  const handleArchive = async () => {
    try {
      await archivePartner.mutateAsync(partner.id);
      toast.success("Partner archived");
      navigate("/partners");
    } catch (e: any) { toast.error(e?.message || "Failed to archive"); }
  };

  const handleAddClient = async () => {
    if (!clientForm.client_code || !clientForm.commercial_name) { toast.error("Client code and name are required"); return; }
    setSaving(true);
    try {
      await createClient.mutateAsync({
        client_code: clientForm.client_code,
        commercial_name: clientForm.commercial_name,
        country: clientForm.country || null,
        sector: clientForm.sector || null,
        partner_id: partner.id,
      });
      toast.success("Client created and linked to partner");
      setShowAddClient(false);
      setClientForm({ client_code: "", commercial_name: "", country: "", sector: "" });
    } catch (e: any) { toast.error(e?.message || "Failed to create client"); }
    finally { setSaving(false); }
  };

  const handleAddDeal = async () => {
    if (!dealForm.company_name) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("deals").insert({
        company_name: dealForm.company_name,
        partner_id: partner.id,
        country: dealForm.country || null,
        expected_value: dealForm.expected_value ? parseFloat(dealForm.expected_value) : 0,
        assigned_salesperson: dealForm.assigned_salesperson || null,
        stage: "Lead",
        status: "Open",
      });
      if (error) throw error;
      toast.success("Deal created and linked to partner");
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setShowAddDeal(false);
      setDealForm({ company_name: "", country: "", expected_value: "", assigned_salesperson: "" });
    } catch (e: any) { toast.error(e?.message || "Failed to create deal"); }
    finally { setSaving(false); }
  };

  const score = partner.health_score ?? 50;
  const healthLabel = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "At Risk" : "Critical";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <Link to="/partners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Partners
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{partner.company_name}</h1>
              <Badge variant={partner.status === "Active" ? "success" : partner.status === "Negotiation" ? "warning" : "secondary"}>{partner.status}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>{partner.country}</span>
              {partner.start_date && <span>Since {partner.start_date}</span>}
              <Badge variant="outline" className="font-normal">{partner.partnership_level}</Badge>
              <span className="font-mono text-xs">{partner.partner_code}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
            {partner.status !== "Archived" && (
              <Button variant="outline" size="sm" onClick={handleArchive} className="text-destructive hover:text-destructive"><Archive className="h-3.5 w-3.5 mr-1.5" /> Archive</Button>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-reveal-up stagger-1">
        {[
          { label: "Revenue YTD", value: `€${Number(partner.revenue_ytd || 0).toLocaleString()}` },
          { label: "Pipeline", value: `€${Number(partner.pipeline_value || 0).toLocaleString()}` },
          { label: "Clients", value: clients.length },
          { label: "Open Deals", value: deals.filter(d => d.status === "Open").length },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card rounded-xl border p-5 shadow-sm">
            <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
            <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview" className="animate-reveal-up stagger-2">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
          <TabsTrigger value="deals">Deals ({deals.length})</TabsTrigger>
          <TabsTrigger value="renewals">Renewals ({partnerRenewals.length})</TabsTrigger>
          <TabsTrigger value="certifications">Certifications ({certs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
              <h3 className="font-semibold text-foreground text-sm">Partner Info</h3>
              {[
                ["Legal Name", partner.legal_name],
                ["Contact", partner.primary_contact_name],
                ["Email", partner.primary_contact_email],
                ["Phone", partner.phone],
                ["Website", partner.website],
                ["Region", partner.region],
                ["Alert Days", partner.alert_notice_days],
                ["Onboarding", partner.onboarding_status],
                ["Health Score", `${score}/100 · ${healthLabel}`],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-start gap-3 py-1 border-b border-border/40 last:border-0">
                  <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
                  <span className="text-sm text-foreground">{value || "—"}</span>
                </div>
              ))}
            </div>
            {partner.notes && (
              <div className="bg-card rounded-xl border shadow-sm p-5">
                <h3 className="font-semibold text-foreground text-sm mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground">{partner.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddClient(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Client</Button>
          </div>
          {clients.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              No clients linked to this partner. <button onClick={() => setShowAddClient(true)} className="text-primary hover:underline">Add one</button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Country</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Sector</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">License</th>
                </tr></thead>
                <tbody className="divide-y">
                  {clients.map(c => (
                    <tr key={c.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3"><Link to={`/clients/${c.id}`} className="font-medium hover:text-primary">{c.commercial_name}</Link><p className="text-[11px] text-muted-foreground font-mono">{c.client_code}</p></td>
                      <td className="px-5 py-3 text-muted-foreground">{c.country}</td>
                      <td className="px-5 py-3 text-muted-foreground">{c.sector}</td>
                      <td className="px-5 py-3"><Badge variant={c.status === "Active" ? "default" : "secondary"}>{c.status}</Badge></td>
                      <td className="px-5 py-3"><Badge variant="outline" className="text-xs">{c.license_type || "—"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddDeal(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Deal</Button>
          </div>
          {deals.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              No deals found. <button onClick={() => setShowAddDeal(true)} className="text-primary hover:underline">Create one</button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Stage</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Value</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                </tr></thead>
                <tbody className="divide-y">
                  {deals.map(d => (
                    <tr key={d.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3"><Link to={`/deals/${d.id}`} className="font-medium hover:text-primary">{d.company_name}</Link></td>
                      <td className="px-5 py-3"><Badge variant="outline">{d.stage}</Badge></td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">€{Number(d.expected_value || 0).toLocaleString()}</td>
                      <td className="px-5 py-3"><Badge variant={d.status === "Won" ? "success" : d.status === "Lost" ? "destructive" : "default"}>{d.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="renewals" className="mt-5">
          {partnerRenewals.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">No renewals found.</div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Value</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Priority</th>
                </tr></thead>
                <tbody className="divide-y">
                  {partnerRenewals.map((r: any) => (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3"><Badge variant="outline">{r.renewal_type}</Badge></td>
                      <td className="px-5 py-3 tabular-nums">{r.renewal_date}</td>
                      <td className="px-5 py-3"><Badge variant="secondary">{r.status}</Badge></td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">€{Number(r.estimated_value || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-xs">{r.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="certifications" className="mt-5">
          {certs.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">No certifications yet.</div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Certification</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Level</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Score</th>
                </tr></thead>
                <tbody className="divide-y">
                  {certs.map(c => (
                    <tr key={c.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3 font-medium">{c.user_name}<p className="text-[11px] text-muted-foreground">{c.user_email}</p></td>
                      <td className="px-5 py-3">{c.certification_name}</td>
                      <td className="px-5 py-3">Level {c.certification_level}</td>
                      <td className="px-5 py-3"><Badge variant={c.status === "Completed" ? "success" : "secondary"}>{c.status}</Badge></td>
                      <td className="px-5 py-3 tabular-nums">{c.score ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Partner Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Partner</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Company Name *</Label><Input value={editForm.company_name || ""} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div><Label>Legal Name</Label><Input value={editForm.legal_name || ""} onChange={e => setEditForm(f => ({ ...f, legal_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Contact Person</Label><Input value={editForm.primary_contact_name || ""} onChange={e => setEditForm(f => ({ ...f, primary_contact_name: e.target.value }))} /></div>
              <div><Label>Contact Email</Label><Input value={editForm.primary_contact_email || ""} onChange={e => setEditForm(f => ({ ...f, primary_contact_email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Website</Label><Input value={editForm.website || ""} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Country</Label><Input value={editForm.country || ""} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} /></div>
              <div><Label>Region</Label><Input value={editForm.region || ""} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Partnership Level</Label>
                <Select value={editForm.partnership_level || "Reseller"} onValueChange={v => setEditForm(f => ({ ...f, partnership_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Reseller">Reseller</SelectItem>
                    <SelectItem value="Implementer">Implementer</SelectItem>
                    <SelectItem value="Strategic Connector">Strategic Connector</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status || "Active"} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Negotiation">Negotiation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Alert Notice Days</Label><Input type="number" value={editForm.alert_notice_days ?? 60} onChange={e => setEditForm(f => ({ ...f, alert_notice_days: parseInt(e.target.value) || 60 }))} /></div>
              <div>
                <Label>Onboarding Status</Label>
                <Select value={editForm.onboarding_status || "Not Started"} onValueChange={v => setEditForm(f => ({ ...f, onboarding_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
              <Button onClick={saveEdit} disabled={updatePartner.isPending}><Save className="h-4 w-4 mr-1.5" /> {updatePartner.isPending ? "Saving..." : "Save Changes"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Client to {partner.company_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Client Code *</Label><Input value={clientForm.client_code} onChange={e => setClientForm(f => ({ ...f, client_code: e.target.value }))} placeholder="e.g. CL-001" /></div>
              <div><Label>Commercial Name *</Label><Input value={clientForm.commercial_name} onChange={e => setClientForm(f => ({ ...f, commercial_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Country</Label><Input value={clientForm.country} onChange={e => setClientForm(f => ({ ...f, country: e.target.value }))} /></div>
              <div><Label>Sector</Label><Input value={clientForm.sector} onChange={e => setClientForm(f => ({ ...f, sector: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddClient(false)}>Cancel</Button>
              <Button onClick={handleAddClient} disabled={saving}>{saving ? "Creating..." : "Create Client"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Deal Dialog */}
      <Dialog open={showAddDeal} onOpenChange={setShowAddDeal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Deal for {partner.company_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Company Name *</Label><Input value={dealForm.company_name} onChange={e => setDealForm(f => ({ ...f, company_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Country</Label><Input value={dealForm.country} onChange={e => setDealForm(f => ({ ...f, country: e.target.value }))} /></div>
              <div><Label>Expected Value (€)</Label><Input type="number" value={dealForm.expected_value} onChange={e => setDealForm(f => ({ ...f, expected_value: e.target.value }))} /></div>
            </div>
            <div><Label>Assigned Salesperson</Label><Input value={dealForm.assigned_salesperson} onChange={e => setDealForm(f => ({ ...f, assigned_salesperson: e.target.value }))} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDeal(false)}>Cancel</Button>
              <Button onClick={handleAddDeal} disabled={saving}>{saving ? "Creating..." : "Create Deal"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useParams, Link, useNavigate } from "react-router-dom";
import { usePartner, useUpdatePartner, useArchivePartner, usePartnershipLevels } from "@/hooks/usePartners";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { useDeals } from "@/hooks/useDeals";
import { useRenewals } from "@/hooks/useDeals";
import { usePartnerMetrics } from "@/hooks/usePartnerMetrics";
import { useHQUsers } from "@/hooks/useHQUsers";
import { usePartnerNotes, useAddPartnerNote, useDeletePartnerNote } from "@/hooks/usePartnerNotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Pencil, Archive, Save, X, Plus, Info, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { CountryCodeCombobox } from "@/components/partners/CountryCodeCombobox";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString() : "—";
const fmtDateTime = (d?: string | null) => d ? new Date(d).toLocaleString() : "—";

export default function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: partner, isLoading } = usePartner(id);
  const { data: clients = [] } = useClients({ partner_id: id });
  const { data: deals = [] } = useDeals({ partner_id: id });
  const { data: renewals = [] } = useRenewals();
  const { data: metricsMap = {} } = usePartnerMetrics();
  const { data: partnershipLevels = [] } = usePartnershipLevels();
  const { data: hqUsers = [] } = useHQUsers();
  const { data: notes = [] } = usePartnerNotes(id);
  const addNote = useAddPartnerNote();
  const deleteNote = useDeletePartnerNote();
  const updatePartner = useUpdatePartner();
  const archivePartner = useArchivePartner();
  const createClient = useCreateClient();
  const { data: certs = [], refetch: refetchCerts } = useQuery({
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
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showAddCert, setShowAddCert] = useState(false);
  const [certForm, setCertForm] = useState({ user_name: "", certification_name: "", certification_type: "Sales", certification_level: 1, issue_date: "", expiry_date: "", file_url: "" });
  const [showAddRenewal, setShowAddRenewal] = useState(false);
  const [renewalForm, setRenewalForm] = useState({ client_id: "", renewal_type: "License", renewal_date: "", estimated_value: 0, priority: "Medium" });
  const [clientForm, setClientForm] = useState({ commercial_name: "", country: "", sector: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const metrics = id ? metricsMap[id] : undefined;

  const lastActivity = useMemo(() => {
    const dates: number[] = [];
    notes.forEach(n => dates.push(new Date(n.created_at).getTime()));
    deals.forEach(d => d.last_activity_at && dates.push(new Date(d.last_activity_at).getTime()));
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  }, [notes, deals]);

  if (isLoading) return <div className="max-w-5xl mx-auto py-12 text-center text-muted-foreground">Loading...</div>;
  if (!partner) return (
    <div className="max-w-5xl mx-auto py-12 text-center">
      <p className="text-muted-foreground">Partner not found</p>
      <Link to="/partners" className="text-primary text-sm mt-2 inline-block hover:underline">← Back to Partner Management</Link>
    </div>
  );

  const splitName = (full?: string | null) => {
    const parts = (full || "").trim().split(/\s+/);
    if (!parts[0]) return { first_name: "", last_name: "" };
    return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
  };

  const startEdit = () => {
    const { first_name, last_name } = splitName(partner.primary_contact_name);
    setEditForm({
      company_name: partner.company_name,
      legal_name: partner.legal_name || "",
      first_name,
      last_name,
      primary_contact_email: partner.primary_contact_email || "",
      phone: partner.phone || "",
      website: partner.website || "",
      country: partner.country || "",
      region: partner.region || "",
      partnership_level: partner.partnership_level || "",
      status: partner.status || "Active",
      alert_notice_days: partner.alert_notice_days ?? 60,
      onboarding_status: partner.onboarding_status || "Not Started",
      account_owner_id: (partner as any).account_owner_id || "",
      last_meeting_date: (partner as any).last_meeting_date || "",
      next_meeting_date: (partner as any).next_meeting_date || "",
      meeting_cadence: (partner as any).meeting_cadence || "",
      uses_own_database: !!(partner as any).uses_own_database,
      uses_manwinwin_database: !!(partner as any).uses_manwinwin_database,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const { first_name, last_name, ...rest } = editForm;
      const primary_contact_name = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
      await updatePartner.mutateAsync({
        id: partner.id,
        ...rest,
        primary_contact_name,
        account_owner_id: rest.account_owner_id || null,
        last_meeting_date: rest.last_meeting_date || null,
        next_meeting_date: rest.next_meeting_date || null,
        meeting_cadence: rest.meeting_cadence || null,
      } as any);
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

  const generateClientCode = () => {
    const prefix = (partner.partner_code || "CL").split("-").slice(0, 2).join("-") || "CL";
    const seq = String(clients.length + 1).padStart(3, "0");
    return `${prefix}-C${seq}`;
  };

  const handleAddClient = async () => {
    if (!clientForm.commercial_name.trim()) { toast.error("Commercial name is required"); return; }
    setSaving(true);
    try {
      await createClient.mutateAsync({
        client_code: generateClientCode(),
        commercial_name: clientForm.commercial_name.trim(),
        country: clientForm.country || null,
        sector: clientForm.sector || null,
        email: clientForm.email || null,
        phone: clientForm.phone || null,
        partner_id: partner.id,
      } as any);
      toast.success("Client created and linked to partner");
      setShowAddClient(false);
      setClientForm({ commercial_name: "", country: "", sector: "", email: "", phone: "" });
    } catch (e: any) { toast.error(e?.message || "Failed to create client"); }
    finally { setSaving(false); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync({ partner_id: partner.id, content: noteText.trim() });
      setNoteText("");
      setShowAddNote(false);
      toast.success("Note added");
    } catch (e: any) { toast.error(e?.message || "Failed to add note"); }
  };

  const handleAddCert = async () => {
    if (!certForm.user_name.trim() || !certForm.certification_name.trim()) { toast.error("User and certification name required"); return; }
    try {
      const { error } = await supabase.from("partner_certifications").insert({
        partner_id: partner.id,
        user_name: certForm.user_name.trim(),
        certification_name: certForm.certification_name.trim(),
        certification_type: certForm.certification_type,
        certification_level: certForm.certification_level,
        issue_date: certForm.issue_date || null,
        expiry_date: certForm.expiry_date || null,
        file_url: certForm.file_url || null,
        status: "Completed",
        awarded_at: certForm.issue_date ? new Date(certForm.issue_date).toISOString() : new Date().toISOString(),
      } as any);
      if (error) throw error;
      toast.success("Certification added");
      setShowAddCert(false);
      setCertForm({ user_name: "", certification_name: "", certification_type: "Sales", certification_level: 1, issue_date: "", expiry_date: "", file_url: "" });
      refetchCerts();
    } catch (e: any) { toast.error(e?.message || "Failed to add certification"); }
  };

  const handleAddRenewal = async () => {
    if (!renewalForm.client_id || !renewalForm.renewal_date) { toast.error("Client and date are required"); return; }
    try {
      const { error } = await supabase.from("renewals").insert({
        client_id: renewalForm.client_id,
        partner_id: partner.id,
        renewal_type: renewalForm.renewal_type,
        renewal_date: renewalForm.renewal_date,
        estimated_value: renewalForm.estimated_value,
        priority: renewalForm.priority,
        status: "Upcoming",
      });
      if (error) throw error;
      toast.success("Renewal added");
      setShowAddRenewal(false);
      setRenewalForm({ client_id: "", renewal_type: "License", renewal_date: "", estimated_value: 0, priority: "Medium" });
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
    } catch (e: any) { toast.error(e?.message || "Failed to add renewal"); }
  };

  const updateRenewalStatus = async (renewalId: string, status: string) => {
    try {
      const { error } = await supabase.from("renewals").update({ status }).eq("id", renewalId);
      if (error) throw error;
      toast.success("Renewal updated");
      queryClient.invalidateQueries({ queryKey: ["renewals"] });
    } catch (e: any) { toast.error(e?.message || "Failed to update renewal"); }
  };

  const score = metrics?.health_score ?? partner.health_score ?? 0;
  const healthLabel = score >= 80 ? "Healthy" : score >= 40 ? "Moderate" : "At Risk";
  const healthColor = score >= 80 ? "hsl(var(--success))" : score >= 40 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  const revenue = metrics?.revenue ?? 0;
  const pipeline = metrics?.pipeline ?? 0;
  const clientCount = metrics?.clients ?? clients.length;

  const certStatus = (c: any) => {
    if (!c.expiry_date) return { label: "Valid", variant: "success" as const };
    const exp = new Date(c.expiry_date).getTime();
    const now = Date.now();
    const days = (exp - now) / 86400000;
    if (days < 0) return { label: "Expired", variant: "destructive" as const };
    if (days < 30) return { label: "Expiring soon", variant: "warning" as const };
    return { label: "Valid", variant: "success" as const };
  };

  const openDeals = deals.filter(d => d.status === "Open");
  const wonDeals = deals.filter(d => d.status === "Won");
  const lostDeals = deals.filter(d => d.status === "Lost");
  const accountOwner = hqUsers.find((u: any) => u.id === (partner as any).account_owner_id);
  const countryName = partner.country ? (COUNTRY_NAME_BY_CODE[partner.country] ?? partner.country) : "—";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <Link to="/partners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Partner Management
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{partner.company_name}</h1>
              <Badge variant={partner.status === "Active" ? "success" : partner.status === "Negotiation" ? "warning" : "secondary"}>{partner.status}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>{countryName}</span>
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
          { label: "Revenue", value: `€${revenue.toLocaleString()}` },
          { label: "Pipeline", value: `€${pipeline.toLocaleString()}` },
          { label: "Clients", value: clientCount },
          { label: "Open Leads", value: openDeals.length },
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
          <TabsTrigger value="activity">Activity ({notes.length})</TabsTrigger>
          <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
          <TabsTrigger value="leads">Leads ({deals.length})</TabsTrigger>
          <TabsTrigger value="renewals">Renewals ({partnerRenewals.length})</TabsTrigger>
          <TabsTrigger value="certifications">Certifications ({certs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
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
                ["Country", countryName],
                ["Onboarding", partner.onboarding_status],
                ["Meeting Cadence", (partner as any).meeting_cadence || "—"],
                ["Uses Own Database", (partner as any).uses_own_database ? "Yes" : "No"],
                ["Uses ManWinWin Database", (partner as any).uses_manwinwin_database ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-start gap-3 py-1 border-b border-border/40 last:border-0">
                  <span className="text-xs text-muted-foreground w-40 shrink-0">{label}</span>
                  <span className="text-sm text-foreground">{value || "—"}</span>
                </div>
              ))}
            </div>

            <div className="space-y-5">
              <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">Health</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" /></button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Health is based on revenue, pipeline activity, and client base. Scores 80–100 = Healthy, 40–70 = Moderate, 0–30 = At Risk.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: healthColor }} />
                  <span className="text-2xl font-bold tabular-nums">{score}<span className="text-sm font-normal text-muted-foreground">/100</span></span>
                  <Badge variant="outline" className="ml-2">{healthLabel}</Badge>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${score}%`, backgroundColor: healthColor }} />
                </div>
              </div>

              <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
                <h3 className="font-semibold text-foreground text-sm">Relationship</h3>
                {[
                  ["Account Owner", accountOwner ? (accountOwner as any).full_name || (accountOwner as any).email : "—"],
                  ["Last Activity", lastActivity ? fmtDateTime(lastActivity) : "—"],
                  ["Last Meeting", fmt((partner as any).last_meeting_date)],
                  ["Next Meeting", fmt((partner as any).next_meeting_date)],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-start gap-3 py-1 border-b border-border/40 last:border-0">
                    <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
                    <span className="text-sm text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddNote(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Note</Button>
          </div>
          {notes.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              No activity yet. <button onClick={() => setShowAddNote(true)} className="text-primary hover:underline">Add a note</button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm divide-y">
              {notes.map(n => (
                <div key={n.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">
                      {fmtDateTime(n.created_at)} — <span className="font-medium text-foreground">{n.author_name || "Unknown"}</span>
                    </div>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{n.content}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteNote.mutate({ id: n.id, partner_id: partner.id })}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddClient(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Client</Button>
          </div>
          {clients.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              No clients linked. <button onClick={() => setShowAddClient(true)} className="text-primary hover:underline">Add one</button>
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

        <TabsContent value="leads" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowCreateLead(true)}><Plus className="h-4 w-4 mr-1.5" /> New Lead</Button>
          </div>
          {deals.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{openDeals.length} Open</span><span>·</span>
              <span className="text-success">{wonDeals.length} Won</span><span>·</span>
              <span className="text-destructive">{lostDeals.length} Lost</span>
            </div>
          )}
          {deals.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              No leads found. <button onClick={() => setShowCreateLead(true)} className="text-primary hover:underline">Create one</button>
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

        <TabsContent value="renewals" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddRenewal(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Renewal</Button>
          </div>
          {partnerRenewals.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">No renewals yet.</div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Value</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground"></th>
                </tr></thead>
                <tbody className="divide-y">
                  {partnerRenewals.map((r: any) => (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3"><Badge variant="outline">{r.renewal_type}</Badge></td>
                      <td className="px-5 py-3 tabular-nums">{r.renewal_date}</td>
                      <td className="px-5 py-3">
                        <Select value={r.status} onValueChange={(v) => updateRenewalStatus(r.id, v)}>
                          <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Upcoming">Upcoming</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Lost">Lost</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">€{Number(r.estimated_value || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right">
                        {r.status !== "Completed" && (
                          <Button variant="ghost" size="sm" onClick={() => updateRenewalStatus(r.id, "Completed")}>Mark Completed</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="certifications" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddCert(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Certification</Button>
          </div>
          {certs.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-8 text-center text-muted-foreground">No certifications yet.</div>
          ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-secondary/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Certification</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Issued</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Expires</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                </tr></thead>
                <tbody className="divide-y">
                  {certs.map((c: any) => {
                    const s = certStatus(c);
                    return (
                      <tr key={c.id} className="hover:bg-secondary/30">
                        <td className="px-5 py-3 font-medium">{c.user_name}<p className="text-[11px] text-muted-foreground">{c.user_email}</p></td>
                        <td className="px-5 py-3">{c.certification_name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{c.certification_type || `Level ${c.certification_level}`}</td>
                        <td className="px-5 py-3 tabular-nums text-muted-foreground">{fmt(c.issue_date) || "—"}</td>
                        <td className="px-5 py-3 tabular-nums text-muted-foreground">{fmt(c.expiry_date) || "—"}</td>
                        <td className="px-5 py-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Partner Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Partner</DialogTitle></DialogHeader>
          <div className="space-y-6 mt-2">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Partner Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Company Name *</Label><Input value={editForm.company_name || ""} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))} /></div>
                <div><Label>Legal Name</Label><Input value={editForm.legal_name || ""} onChange={e => setEditForm(f => ({ ...f, legal_name: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Country *</Label>
                  <CountryCodeCombobox value={editForm.country || ""} onChange={v => setEditForm(f => ({ ...f, country: v }))} />
                </div>
                <div>
                  <Label>Partnership Level</Label>
                  <Select value={editForm.partnership_level || ""} onValueChange={v => setEditForm(f => ({ ...f, partnership_level: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {partnershipLevels.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Region</Label><Input value={editForm.region || ""} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} /></div>
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
              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">Uses Own Database</span>
                  <Switch checked={!!editForm.uses_own_database} onCheckedChange={v => setEditForm(f => ({ ...f, uses_own_database: v }))} />
                </label>
                <label className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">Uses ManWinWin DB</span>
                  <Switch checked={!!editForm.uses_manwinwin_database} onCheckedChange={v => setEditForm(f => ({ ...f, uses_manwinwin_database: v }))} />
                </label>
              </div>
              <div>
                <Label>Meeting Cadence</Label>
                <Select value={editForm.meeting_cadence || ""} onValueChange={v => setEditForm(f => ({ ...f, meeting_cadence: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Contact Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>First Name</Label><Input value={editForm.first_name || ""} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} /></div>
                <div><Label>Last Name</Label><Input value={editForm.last_name || ""} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contact Email</Label><Input value={editForm.primary_contact_email || ""} onChange={e => setEditForm(f => ({ ...f, primary_contact_email: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div><Label>Website</Label><Input value={editForm.website || ""} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} /></div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Relationship</h3>
              <div>
                <Label>Account Owner</Label>
                <Select value={editForm.account_owner_id || ""} onValueChange={v => setEditForm(f => ({ ...f, account_owner_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select owner..." /></SelectTrigger>
                  <SelectContent>
                    {hqUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Last Meeting Date</Label><Input type="date" value={editForm.last_meeting_date || ""} onChange={e => setEditForm(f => ({ ...f, last_meeting_date: e.target.value }))} /></div>
                <div><Label>Next Meeting Date</Label><Input type="date" value={editForm.next_meeting_date || ""} onChange={e => setEditForm(f => ({ ...f, next_meeting_date: e.target.value }))} /></div>
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
            </section>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
              <Button onClick={saveEdit} disabled={updatePartner.isPending}><Save className="h-4 w-4 mr-1.5" /> {updatePartner.isPending ? "Saving..." : "Save Changes"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea rows={5} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Write a note..." autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddNote(false)}>Cancel</Button>
              <Button onClick={handleAddNote} disabled={addNote.isPending || !noteText.trim()}>{addNote.isPending ? "Saving..." : "Add Note"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Client to {partner.company_name}</DialogTitle></DialogHeader>
          <div className="space-y-6 mt-2">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Client Information</h3>
              <div><Label>Commercial Name *</Label><Input value={clientForm.commercial_name} onChange={e => setClientForm(f => ({ ...f, commercial_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Country</Label>
                  <CountryCombobox value={clientForm.country} onChange={v => setClientForm(f => ({ ...f, country: v }))} />
                </div>
                <div>
                  <Label>Sector</Label>
                  <SectorSelect value={clientForm.sector} onChange={v => setClientForm(f => ({ ...f, sector: v }))} />
                </div>
              </div>
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input type="email" value={clientForm.email} onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input value={clientForm.phone} onChange={e => setClientForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">System</h3>
              <div>
                <Label>Client Code</Label>
                <Input value={generateClientCode()} readOnly disabled className="bg-muted/50 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground mt-1">Auto-generated from partner code.</p>
              </div>
            </section>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowAddClient(false)}>Cancel</Button>
              <Button onClick={handleAddClient} disabled={saving}>{saving ? "Creating..." : "Create Client"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Certification Dialog */}
      <Dialog open={showAddCert} onOpenChange={setShowAddCert}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Certification</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>User Name *</Label><Input value={certForm.user_name} onChange={e => setCertForm(f => ({ ...f, user_name: e.target.value }))} /></div>
            <div><Label>Certification Name *</Label><Input value={certForm.certification_name} onChange={e => setCertForm(f => ({ ...f, certification_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={certForm.certification_type} onValueChange={v => setCertForm(f => ({ ...f, certification_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Tech">Tech</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Level</Label>
                <Select value={String(certForm.certification_level)} onValueChange={v => setCertForm(f => ({ ...f, certification_level: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Issue Date</Label><Input type="date" value={certForm.issue_date} onChange={e => setCertForm(f => ({ ...f, issue_date: e.target.value }))} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={certForm.expiry_date} onChange={e => setCertForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
            </div>
            <div><Label>File URL (optional)</Label><Input value={certForm.file_url} onChange={e => setCertForm(f => ({ ...f, file_url: e.target.value }))} placeholder="https://..." /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddCert(false)}>Cancel</Button>
              <Button onClick={handleAddCert}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Renewal Dialog */}
      <Dialog open={showAddRenewal} onOpenChange={setShowAddRenewal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Renewal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client *</Label>
              <Select value={renewalForm.client_id} onValueChange={v => setRenewalForm(f => ({ ...f, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.commercial_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={renewalForm.renewal_type} onValueChange={v => setRenewalForm(f => ({ ...f, renewal_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="License">License</SelectItem>
                    <SelectItem value="SAT">SAT</SelectItem>
                    <SelectItem value="Hosting">Hosting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={renewalForm.priority} onValueChange={v => setRenewalForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Renewal Date *</Label><Input type="date" value={renewalForm.renewal_date} onChange={e => setRenewalForm(f => ({ ...f, renewal_date: e.target.value }))} /></div>
              <div><Label>Estimated Value</Label><Input type="number" value={renewalForm.estimated_value} onChange={e => setRenewalForm(f => ({ ...f, estimated_value: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddRenewal(false)}>Cancel</Button>
              <Button onClick={handleAddRenewal}>Add Renewal</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreateLeadDialog
        open={showCreateLead}
        onOpenChange={setShowCreateLead}
        lockedPartnerId={partner.id}
        lockedPartnerName={partner.company_name}
      />
    </div>
  );
}

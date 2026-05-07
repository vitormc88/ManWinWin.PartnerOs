import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDeal } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useDealContacts, useDealActivities } from "@/hooks/useCommissions";
import { useDealTasksEnhanced } from "@/hooks/useDealTasksCRUD";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Building2, MapPin, User, Calendar, DollarSign, Phone, Mail, MessageSquare, Plus, Pencil, Trash2, Save, X, FileText } from "lucide-react";
import { DealTaskList } from "@/components/deals/DealTaskList";
import { ProposalsTab } from "@/components/proposals/ProposalsTab";
import { CreateProposalDialog } from "@/components/proposals/CreateProposalDialog";
import { useLeadProposals } from "@/hooks/useProposals";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { PIPELINE_STAGES, ACTIVE_STAGES, getStageProbability, type DealStage } from "@/data/pipeline-stages";
import { cn } from "@/lib/utils";
import { logSystemActivity, ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS } from "@/lib/activity-log";
import { useAuth } from "@/contexts/AuthContext";
import { MarkAsWonButton } from "@/components/deals/MarkAsWonButton";
import { CreateLicenseDialog } from "@/components/deals/CreateLicenseDialog";
import { findOrCreateClientFromDeal } from "@/lib/lifecycle";

const JOB_ROLE_OPTIONS = [
  "Maintenance Manager",
  "Plant Manager",
  "General Manager",
  "IT Manager",
  "Unknown",
];
const ASSET_RANGE_OPTIONS = ["1–100", "101–250", "+250"];
const TEAM_SIZE_OPTIONS = ["1–3", "4 or more", "Unknown"];

export default function DealDetail() {
  const { id } = useParams();
  const { data: deal, isLoading } = useDeal(id);
  const { data: contacts = [] } = useDealContacts(id);
  const { data: dealTasks = [] } = useDealTasksEnhanced(id);
  const { data: activities = [] } = useDealActivities(id);
  const { data: partners = [] } = usePartners();
  const { data: proposals = [] } = useLeadProposals(id);
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const currentUserName = profile?.full_name || profile?.email || user?.email || "";
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const dealPartnerId = editForm.partner_id || deal?.partner_id || null;
  const { data: partnerUsers = [] } = usePartnerUsers(dealPartnerId);
  // Contact add
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ contact_name: "", role: "", email: "", phone: "", is_decision_maker: false });
  // Activity add — default Performed By to the logged-in user
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({ activity_type: "note", subject: "", description: "", performed_by: "" });
  useEffect(() => {
    setActivityForm((f) => ({ ...f, performed_by: f.performed_by || currentUserName }));
  }, [currentUserName]);

  const startEdit = () => {
    setEditForm({
      company_name: deal.company_name,
      contact_person_name: (deal as any).contact_person_name || "",
      country: deal.country || "",
      industry: deal.industry || "",
      lead_source: deal.lead_source || "",
      partner_id: deal.partner_id || "",
      assigned_salesperson: deal.assigned_salesperson || "",
      stage: deal.stage,
      expected_value: deal.expected_value || 0,
      probability: deal.probability || 0,
      expected_close_date: deal.expected_close_date || "",
      notes: deal.notes || "",
      description: deal.description || "",
      contact_email: (deal as any).contact_email || "",
      contact_phone: (deal as any).contact_phone || "",
      job_role: (deal as any).job_role || "",
      sector: (deal as any).sector || "",
      asset_range: (deal as any).asset_range || "",
      maintenance_team_size: (deal as any).maintenance_team_size || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const stageChanged = editForm.stage !== deal.stage;
    const oldStage = deal.stage;
    const updates: any = {
      company_name: editForm.company_name,
      contact_person_name: editForm.contact_person_name || null,
      country: editForm.country || null,
      industry: editForm.industry || editForm.sector || null,
      lead_source: editForm.lead_source || null,
      partner_id: editForm.partner_id || null,
      assigned_salesperson: editForm.assigned_salesperson || null,
      stage: editForm.stage,
      expected_value: parseFloat(editForm.expected_value) || 0,
      probability: stageChanged ? getStageProbability(editForm.stage) : (parseInt(editForm.probability) || 0),
      expected_close_date: editForm.expected_close_date || null,
      notes: editForm.notes || null,
      description: editForm.description || null,
      status: editForm.stage === "Won" ? "Won" : editForm.stage === "Lost" ? "Lost" : "Open",
      contact_email: editForm.contact_email || null,
      contact_phone: editForm.contact_phone || null,
      job_role: editForm.job_role || null,
      sector: editForm.sector || null,
      asset_range: editForm.asset_range || null,
      maintenance_team_size: editForm.maintenance_team_size || null,
    };
    if (stageChanged) updates.stage_entered_at = new Date().toISOString();

    const { error } = await supabase.from("deals").update(updates).eq("id", deal.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead updated");
    if (stageChanged) {
      const subj =
        editForm.stage === "Won"
          ? "Lead marked as Won"
          : editForm.stage === "Lost"
          ? "Lead marked as Lost"
          : "Stage changed";
      logSystemActivity(
        deal.id,
        subj,
        `Stage changed from ${oldStage} to ${editForm.stage}.`
      );

      // If stage transitioned to Won, run client/license lifecycle
      if (editForm.stage === "Won" && oldStage !== "Won") {
        try {
          const { client, created } = await findOrCreateClientFromDeal({ ...deal, ...updates } as any);
          if (!created) {
            toast.message("Existing client found — linked to current deal.", { description: client.commercial_name });
          } else {
            toast.success(`Client ${client.client_code} created`);
          }
          const { count } = await supabase
            .from("licenses")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id);
          if ((count ?? 0) === 0) {
            setPendingClientId(client.id);
            setLicenseModalOpen(true);
          }
          queryClient.invalidateQueries({ queryKey: ["clients"] });
        } catch (e: any) {
          toast.error(e?.message || "Failed to create client from deal");
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ["deal", id] });
    queryClient.invalidateQueries({ queryKey: ["deals"] });
    queryClient.invalidateQueries({ queryKey: ["deal_activities", id] });
    setEditing(false);
  };


  // Contact actions
  const addContact = async () => {
    if (!contactForm.contact_name) { toast.error("Name required"); return; }
    const { error } = await supabase.from("deal_contacts").insert({
      deal_id: deal.id,
      contact_name: contactForm.contact_name,
      role: contactForm.role || null,
      email: contactForm.email || null,
      phone: contactForm.phone || null,
      is_decision_maker: contactForm.is_decision_maker,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Contact added");
    queryClient.invalidateQueries({ queryKey: ["deal_contacts", id] });
    setShowAddContact(false);
    setContactForm({ contact_name: "", role: "", email: "", phone: "", is_decision_maker: false });
  };

  const deleteContact = async (contactId: string) => {
    await supabase.from("deal_contacts").delete().eq("id", contactId);
    queryClient.invalidateQueries({ queryKey: ["deal_contacts", id] });
    toast.success("Contact removed");
  };

  // Activity actions
  const addActivity = async () => {
    if (!activityForm.subject) { toast.error("Subject required"); return; }
    const { error } = await supabase.from("deal_activities").insert({
      deal_id: deal.id,
      activity_type: activityForm.activity_type,
      subject: activityForm.subject,
      description: activityForm.description || null,
      performed_by: activityForm.performed_by || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Activity logged");
    queryClient.invalidateQueries({ queryKey: ["deal_activities", id] });
    setShowAddActivity(false);
    setActivityForm({ activity_type: "note", subject: "", description: "", performed_by: currentUserName });
  };

  const activityIcon = (type: string) => {
    if (type === "call") return <Phone className="h-3.5 w-3.5 text-blue-500" />;
    if (type === "email") return <Mail className="h-3.5 w-3.5 text-amber-500" />;
    if (type === "meeting") return <Calendar className="h-3.5 w-3.5 text-emerald-500" />;
    if (type === "system") return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!deal) return <div className="p-8 text-center text-muted-foreground">Deal not found</div>;

  const latestProposal = [...proposals]
    .filter((proposal) => proposal.status !== "Lost")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const expectedValue = latestProposal?.total_year_1 ?? deal.expected_value ?? 0;
  const weightedValue = expectedValue > 0 ? Math.round((expectedValue * getStageProbability(deal.stage)) / 100) : 0;

  const stageIdx = PIPELINE_STAGES.findIndex(s => s.key === deal.stage);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 animate-reveal-up">
        <Link to="/pipeline" className="h-8 w-8 rounded-lg border bg-card flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground tracking-tight truncate">{deal.company_name}</h1>
            <Badge variant={deal.status === "Won" ? "success" : deal.status === "Lost" ? "destructive" : "outline"}>{deal.stage}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {(deal as any).contact_person_name ? `${(deal as any).contact_person_name} · ` : ""}
            {deal.assigned_salesperson || "Unassigned"}
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            {deal.stage !== "Lost" && <MarkAsWonButton deal={deal} />}
            <Button size="sm" onClick={() => setShowCreateProposal(true)}>
              <FileText className="h-3.5 w-3.5 mr-1.5" />Generate Proposal
            </Button>
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
            </Button>
          </div>
        )}
      </div>

      {/* Stage progress */}
      <div className="bg-card rounded-xl border shadow-sm p-4 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-1">
          {PIPELINE_STAGES.filter(s => s.key !== "Lost").map((stage) => {
            const thisIdx = PIPELINE_STAGES.findIndex(s => s.key === stage.key);
            const isActive = deal.stage !== "Lost" && thisIdx <= stageIdx;
            return <div key={stage.key} className="flex-1"><div className={`h-2 rounded-full transition-colors ${isActive ? "bg-primary" : "bg-secondary"}`} /></div>;
          })}
        </div>
        <div className="flex justify-between mt-2">
          {PIPELINE_STAGES.filter(s => s.key !== "Lost").map(stage => (
            <span key={stage.key} className={`text-[9px] ${deal.stage === stage.key ? "text-primary font-semibold" : "text-muted-foreground"}`}>{stage.label}</span>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview" className="animate-reveal-up" style={{ animationDelay: "120ms" }}>
        <TabsList className="w-full justify-start bg-secondary/50 rounded-lg">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({dealTasks.length})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="communication">Communication ({activities.length})</TabsTrigger>
          <TabsTrigger value="proposals">Proposals ({proposals.length})</TabsTrigger>
        </TabsList>

        {/* ───── Overview ───── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {editing ? (
            <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Edit Lead</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
                  <Button size="sm" onClick={saveEdit}><Save className="h-4 w-4 mr-1" />Save</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Name</Label><Input value={editForm.contact_person_name} onChange={e => setEditForm((f: any) => ({ ...f, contact_person_name: e.target.value }))} placeholder="Contact person name" /></div>
                <div><Label>Company Name</Label><Input value={editForm.company_name} onChange={e => setEditForm((f: any) => ({ ...f, company_name: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Country</Label><CountryCombobox value={editForm.country} onChange={v => setEditForm((f: any) => ({ ...f, country: v }))} /></div>
                <div>
                  <Label>Linked Partner</Label>
                  <Select value={editForm.partner_id || "none"} onValueChange={v => setEditForm((f: any) => ({ ...f, partner_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Assigned To</Label>
                  <Select
                    value={partnerUsers.find(u => u.full_name === editForm.assigned_salesperson)?.id || "none"}
                    onValueChange={v => {
                      const user = partnerUsers.find(u => u.id === v);
                      setEditForm((f: any) => ({ ...f, assigned_salesperson: user?.full_name || "" }));
                    }}
                    disabled={!editForm.partner_id}
                  >
                    <SelectTrigger><SelectValue placeholder={editForm.assigned_salesperson || "Select user"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {partnerUsers.length === 0 && editForm.partner_id && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No users available for this partner</div>
                      )}
                      {partnerUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || "Unnamed"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lead Source</Label>
                  <Select value={editForm.lead_source || "none"} onValueChange={v => setEditForm((f: any) => ({ ...f, lead_source: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      <SelectItem value="Partner (Outbound)">Partner (Outbound)</SelectItem>
                      <SelectItem value="HQ (Inbound)">HQ (Inbound)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Job Role</Label>
                  <Select value={editForm.job_role || "none"} onValueChange={v => setEditForm((f: any) => ({ ...f, job_role: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select —</SelectItem>
                      {JOB_ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Sector</Label><SectorSelect value={editForm.sector} onChange={v => setEditForm((f: any) => ({ ...f, sector: v }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input value={editForm.contact_email} onChange={e => setEditForm((f: any) => ({ ...f, contact_email: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input value={editForm.contact_phone} onChange={e => setEditForm((f: any) => ({ ...f, contact_phone: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>No. of Assets</Label>
                  <Select value={editForm.asset_range || "none"} onValueChange={v => setEditForm((f: any) => ({ ...f, asset_range: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select —</SelectItem>
                      {ASSET_RANGE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Maintenance Team</Label>
                  <Select value={editForm.maintenance_team_size || "none"} onValueChange={v => setEditForm((f: any) => ({ ...f, maintenance_team_size: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select —</SelectItem>
                      {TEAM_SIZE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Commercial Details (later stages)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stage</Label>
                    <Select value={editForm.stage} onValueChange={v => setEditForm((f: any) => ({ ...f, stage: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Expected Close</Label><Input type="date" value={editForm.expected_close_date} onChange={e => setEditForm((f: any) => ({ ...f, expected_close_date: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><Label>Expected Value (€)</Label><Input type="number" value={editForm.expected_value} onChange={e => setEditForm((f: any) => ({ ...f, expected_value: e.target.value }))} /></div>
                  <div><Label>Probability (%)</Label><Input type="number" value={editForm.probability} onChange={e => setEditForm((f: any) => ({ ...f, probability: e.target.value }))} /></div>
                </div>
              </div>
              <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} rows={3} /></div>
              <div><Label>Description</Label><Textarea value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={2} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Lead Information</h3>
                {[
                  { icon: User, label: "Contact Person", value: (deal as any).contact_person_name || "—" },
                  { icon: Building2, label: "Company", value: deal.company_name },
                  { icon: MapPin, label: "Country", value: deal.country || "—" },
                  { icon: User, label: "Assigned To", value: deal.assigned_salesperson || "—" },
                  { icon: User, label: "Lead Source", value: deal.lead_source || "—" },
                  { icon: Building2, label: "Sector", value: (deal as any).sector || deal.industry || "—" },
                  { icon: Mail, label: "Email", value: (deal as any).contact_email || "—" },
                  { icon: Phone, label: "Phone", value: (deal as any).contact_phone || "—" },
                  { icon: User, label: "Job Role", value: (deal as any).job_role || "—" },
                  { icon: Building2, label: "No. of Assets", value: (deal as any).asset_range || "—" },
                  { icon: User, label: "Maintenance Team", value: (deal as any).maintenance_team_size || "—" },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <row.icon className="h-3.5 w-3.5" />
                      <span className="text-xs">{row.label}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Pipeline Metrics</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Stage Probability", value: `${getStageProbability(deal.stage)}%`, color: getStageProbability(deal.stage) >= 60 ? "text-emerald-600" : "text-foreground" },
                    { label: "Expected Value", value: expectedValue > 0 ? `€${expectedValue.toLocaleString()}` : "—", color: "text-foreground" },
                    { label: "Expected Close", value: deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString("en-GB") : "—", color: "text-foreground" },
                    { label: "Weighted Value", value: weightedValue > 0 ? `€${weightedValue.toLocaleString()}` : "—", color: "text-foreground" },
                  ].map(m => (
                    <div key={m.label} className="bg-secondary/50 rounded-lg p-3 text-center">
                      <p className={`text-lg font-bold tabular-nums ${m.color}`}>{m.value}</p>
                      <p className="text-[11px] text-muted-foreground">{m.label}</p>
                    </div>
                  ))}
                </div>
                {deal.description && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground">{deal.description}</p>
                  </div>
                )}
                {deal.notes && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground">{deal.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ───── Tasks ───── */}
        <TabsContent value="tasks" className="mt-4">
          <DealTaskList
            dealId={deal.id}
            dealCompanyName={deal.company_name}
            linkedPartnerId={deal.partner_id || null}
            dealStage={deal.stage}
            defaultAssigneeId={user?.id || null}
          />
        </TabsContent>

        {/* ───── Contacts ───── */}
        <TabsContent value="contacts" className="mt-4">
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Contacts</h3>
              <Button size="sm" variant="outline" onClick={() => setShowAddContact(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add Contact</Button>
            </div>
            <div className="divide-y">
              {contacts.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-foreground shrink-0">
                      {c.contact_name.split(" ").map((n: string) => n[0]).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{c.contact_name}</p>
                        {c.is_decision_maker && <Badge variant="secondary" className="text-[10px]">Decision Maker</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{c.role || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-[11px] text-muted-foreground">
                      <p>{c.email || "—"}</p>
                      <p>{c.phone || "—"}</p>
                    </div>
                    <button onClick={() => deleteContact(c.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
              {contacts.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No contacts yet</div>}
            </div>
          </div>
        </TabsContent>

        {/* ───── Communication / Activity Timeline ───── */}
        <TabsContent value="communication" className="mt-4">
          <div className="bg-card rounded-xl border shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
              <Button size="sm" variant="outline" onClick={() => setShowAddActivity(true)}><Plus className="h-3.5 w-3.5 mr-1" />Log Activity</Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Historical record of calls, meetings, emails, demos and system events. Use the Tasks tab for upcoming work.
            </p>
            <div className="space-y-0">
              {activities.map((a, i) => {
                const isSystem = a.activity_type === "system";
                return (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isSystem ? "bg-muted/60" : "bg-secondary"}`}>
                        {activityIcon(a.activity_type)}
                      </div>
                      {i < activities.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className={`text-sm font-medium ${isSystem ? "text-muted-foreground" : "text-foreground"}`}>{a.subject}</p>
                        <Badge variant="outline" className="text-[10px]">{ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type}</Badge>
                        {isSystem && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{a.performed_by || "—"} · {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                      {a.description && <p className="text-sm text-foreground/80 whitespace-pre-wrap">{a.description}</p>}
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet</p>}
            </div>
          </div>
        </TabsContent>

        {/* ───── Proposals ───── */}
        <TabsContent value="proposals" className="mt-4">
          <ProposalsTab
            leadId={deal.id}
            defaultClientName={deal.company_name}
            defaultCountry={deal.country}
          />
        </TabsContent>
      </Tabs>

      {/* ─── Generate Proposal Dialog (triggered by header button) ─── */}
      <CreateProposalDialog
        open={showCreateProposal}
        onOpenChange={setShowCreateProposal}
        leadId={deal.id}
        defaultClientName={deal.company_name}
        defaultCountry={deal.country}
      />

      {/* ─── Add Contact Dialog ─── */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Name *</Label><Input value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Input value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} /></div>
              <div><Label>Email</Label><Input value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" checked={contactForm.is_decision_maker} onChange={e => setContactForm(f => ({ ...f, is_decision_maker: e.target.checked }))} id="dm" className="rounded" />
                <label htmlFor="dm" className="text-sm text-foreground">Decision Maker</label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddContact(false)}>Cancel</Button>
              <Button onClick={addContact}>Add Contact</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Log Activity Dialog ─── */}
      <Dialog open={showAddActivity} onOpenChange={setShowAddActivity}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={activityForm.activity_type} onValueChange={v => setActivityForm(f => ({ ...f, activity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPE_OPTIONS.filter(o => o.value !== "system").map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Performed By</Label><Input value={activityForm.performed_by} onChange={e => setActivityForm(f => ({ ...f, performed_by: e.target.value }))} /></div>
            </div>
            <div><Label>Subject *</Label><Input value={activityForm.subject} onChange={e => setActivityForm(f => ({ ...f, subject: e.target.value }))} /></div>
            <div><Label>Details</Label><Textarea value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddActivity(false)}>Cancel</Button>
              <Button onClick={addActivity}>Log Activity</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {pendingClientId && (
        <CreateLicenseDialog
          open={licenseModalOpen}
          onOpenChange={setLicenseModalOpen}
          clientId={pendingClientId}
          dealId={deal.id}
          onSkip={() => toast.message("License setup skipped — client will show 'Missing license configuration'.")}
        />
      )}
    </div>
  );
}
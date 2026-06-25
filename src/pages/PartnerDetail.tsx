import { useParams, Link, useNavigate } from "react-router-dom";
import { usePartner, useUpdatePartner, useArchivePartner, usePartnershipLevels } from "@/hooks/usePartners";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { useDeals } from "@/hooks/useDeals";
import { useRenewals } from "@/hooks/useDeals";
import { usePartnerMetrics } from "@/hooks/usePartnerMetrics";
import { useHQUsers } from "@/hooks/useHQUsers";
import { usePartnerNotes, useAddPartnerNote, useDeletePartnerNote } from "@/hooks/usePartnerNotes";
import { RelationshipEntryDialog } from "@/components/partners/RelationshipEntryDialog";
import { RelationshipTimelineEntry } from "@/components/partners/RelationshipTimelineEntry";
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
import { ArrowLeft, Pencil, Archive, Save, X, Plus, Info, Trash2, ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { CountryCodeCombobox } from "@/components/partners/CountryCodeCombobox";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";
import { PartnerHealthCard } from "@/components/partners/PartnerHealthCard";
import { NextBestActionsCard } from "@/components/partners/NextBestActionsCard";
import { buildNextBestActions } from "@/lib/partner-next-actions";
import { buildPartnerNarrative } from "@/lib/partner-health-narrative";
import { PartnerBriefCard } from "@/components/partners/PartnerBriefCard";
import { buildPartnerBrief } from "@/lib/partner-brief";


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
  void addNote;
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
  const relStatus = (partner as any).relationship_status || "Healthy";
  const daysUntilMeeting = (partner as any).next_meeting_date
    ? Math.ceil((new Date((partner as any).next_meeting_date).getTime() - Date.now()) / 86400000)
    : null;
  const expiringCertCount = certs.filter((c: any) => {
    if (!c.expiry_date) return false;
    const days = (new Date(c.expiry_date).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  }).length;
  const expiredRenewalsCount = partnerRenewals.filter((r: any) => {
    if (r.status === "Completed") return false;
    return r.renewal_date && new Date(r.renewal_date).getTime() < Date.now();
  }).length;

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4 space-y-6">

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
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
          <TabsList className="h-12 p-0 bg-transparent gap-1 rounded-none w-full justify-start overflow-x-auto no-scrollbar flex-nowrap">
            {[
              ["overview", "Overview", null],
              ["relationship", "Relationship", notes.length],
              ["clients", "Clients", clients.length],
              ["leads", "Leads", deals.length],
              ["renewals", "Renewals", partnerRenewals.length],
              ["certifications", "Certifications", certs.length],
            ].map(([value, label, count]) => (
              <TabsTrigger
                key={value as string}
                value={value as string}
                className="group relative h-12 px-3 shrink-0 rounded-none bg-transparent border-0 shadow-none text-sm font-normal text-muted-foreground transition-colors hover:text-foreground/80 data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:left-3 data-[state=active]:after:right-3 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-primary data-[state=active]:after:rounded-full"
              >
                <span>{label}</span>
                {count !== null && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">
                    {count as number}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-6 animate-fade-in space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Partner Profile — compact executive profile */}
            <aside className="lg:col-span-4 space-y-4">
              <div className="bg-card rounded-xl border shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">Partner Profile</h3>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={startEdit}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>

                {/* Identity */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</h4>
                  <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Legal name</dt>
                    <dd className="text-foreground truncate">{partner.legal_name || "—"}</dd>
                    <dt className="text-muted-foreground">Region</dt>
                    <dd className="text-foreground">{partner.region || "—"}</dd>
                    <dt className="text-muted-foreground">Country</dt>
                    <dd className="text-foreground">{countryName}</dd>
                    <dt className="text-muted-foreground">Onboarding</dt>
                    <dd className="text-foreground">{partner.onboarding_status || "—"}</dd>
                  </dl>
                </div>

                {/* Contact */}
                <div className="space-y-1.5 pt-1 border-t border-border/60">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">Primary Contact</h4>
                  <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="text-foreground truncate">{partner.primary_contact_name || "—"}</dd>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="text-foreground truncate">
                      {partner.primary_contact_email ? (
                        <a href={`mailto:${partner.primary_contact_email}`} className="hover:text-primary">{partner.primary_contact_email}</a>
                      ) : "—"}
                    </dd>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-foreground">{partner.phone || "—"}</dd>
                    <dt className="text-muted-foreground">Website</dt>
                    <dd className="text-foreground truncate">
                      {partner.website ? (
                        <a href={partner.website} target="_blank" rel="noreferrer" className="hover:text-primary">{partner.website.replace(/^https?:\/\//, "")}</a>
                      ) : "—"}
                    </dd>
                  </dl>
                </div>

                {/* Setup */}
                <div className="space-y-1.5 pt-1 border-t border-border/60">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">Setup</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(partner as any).uses_own_database && (
                      <Badge variant="outline" className="text-[10px] font-normal">Own DB</Badge>
                    )}
                    {(partner as any).uses_manwinwin_database && (
                      <Badge variant="outline" className="text-[10px] font-normal">ManWinWin DB</Badge>
                    )}
                    {accountOwner && (
                      <Badge variant="outline" className="text-[10px] font-normal">Owner: {accountOwner.full_name || accountOwner.email}</Badge>
                    )}
                    {!(partner as any).uses_own_database && !(partner as any).uses_manwinwin_database && !accountOwner && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>
            </aside>

            {/* Partner Intelligence — unified workspace */}
            {(() => {
              const narrative = buildPartnerNarrative({
                score,
                maturity: metrics?.maturity,
                partner: {
                  onboarding_status: partner.onboarding_status,
                  next_meeting_date: (partner as any).next_meeting_date,
                  last_meeting_date: (partner as any).last_meeting_date,
                  account_owner_id: (partner as any).account_owner_id,
                  assigned_manager_id: (partner as any).assigned_manager_id,
                },
                clients,
                deals,
                notes,
                leadsOpen: openDeals.length,
                renewalsUpcoming: partnerRenewals.filter((r: any) => {
                  if (!r.renewal_date) return false;
                  const days = (new Date(r.renewal_date).getTime() - Date.now()) / 86400000;
                  return days >= 0 && days <= 120 && r.status !== "Completed";
                }).length,
              });
              const nextActions = buildNextBestActions({
                maturity: metrics?.maturity,
                partner: {
                  onboarding_status: partner.onboarding_status,
                  next_meeting_date: (partner as any).next_meeting_date,
                  last_meeting_date: (partner as any).last_meeting_date,
                  account_owner_id: (partner as any).account_owner_id,
                },
                clients,
                deals,
                notes,
                leadsOpen: openDeals.length,
                renewalsUpcoming: partnerRenewals.filter((r: any) => {
                  if (!r.renewal_date) return false;
                  const days = (new Date(r.renewal_date).getTime() - Date.now()) / 86400000;
                  return days >= 0 && days <= 120 && r.status !== "Completed";
                }).length,
              });
              const brief = buildPartnerBrief({
                partner: {
                  company_name: partner.company_name,
                  onboarding_status: partner.onboarding_status,
                  start_date: partner.start_date,
                  created_at: (partner as any).created_at,
                },
                maturity: metrics?.maturity,
                score,
                clients,
                deals,
                notes,
                renewalsUpcoming: partnerRenewals.filter((r: any) => {
                  if (!r.renewal_date) return false;
                  const days = (new Date(r.renewal_date).getTime() - Date.now()) / 86400000;
                  return days >= 0 && days <= 120 && r.status !== "Completed";
                }).length,
              });
              return (
                <section aria-label="Partner intelligence" className="lg:col-span-8 space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Partner Intelligence
                    </span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>

                  {/* Primary: Brief as executive narrative */}
                  <PartnerBriefCard brief={brief} variant="primary" />

                  {/* Diagnostic row: Health + Next Best Actions side-by-side */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <PartnerHealthCard
                      score={score}
                      summary={narrative.summary}
                      factors={narrative.factors}
                    />
                    <NextBestActionsCard actions={nextActions} />
                  </div>
                </section>
              );
            })()}
          </div>

          {/* Relationship Settings — secondary management section */}
          <details className="group bg-card/60 rounded-xl border border-border/70 shadow-sm">
            <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3 select-none">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Relationship Management</span>
                <Badge
                  variant={relStatus === "Healthy" || relStatus === "Growing" ? "success" : relStatus === "At Risk" ? "destructive" : "secondary"}
                  className="text-[10px] font-normal"
                >
                  {relStatus}
                </Badge>
                {accountOwner && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">· {accountOwner.full_name || accountOwner.email}</span>
                )}
                {(partner as any).meeting_cadence && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">· {(partner as any).meeting_cadence}</span>
                )}
                {daysUntilMeeting !== null && (
                  <span className={`text-[11px] hidden md:inline ${daysUntilMeeting < 0 ? "text-destructive" : daysUntilMeeting <= 7 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                    · {daysUntilMeeting < 0 ? `Overdue ${Math.abs(daysUntilMeeting)}d` : daysUntilMeeting === 0 ? "Today" : `${daysUntilMeeting}d`}
                  </span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>

            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/60">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <Label className="text-[11px] text-muted-foreground font-normal">Account Owner</Label>
                  <Select value={(partner as any).account_owner_id || ""} onValueChange={v => updatePartner.mutate({ id: partner.id, account_owner_id: v || null } as any)}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      {hqUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-normal">Meeting Cadence</Label>
                  <Select value={(partner as any).meeting_cadence || ""} onValueChange={v => updatePartner.mutate({ id: partner.id, meeting_cadence: v || null } as any)}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-normal">Last Meeting</Label>
                  <Input type="date" className="h-8 mt-1" value={(partner as any).last_meeting_date || ""} onChange={e => updatePartner.mutate({ id: partner.id, last_meeting_date: e.target.value || null } as any)} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-normal">Next Meeting</Label>
                  <Input type="date" className="h-8 mt-1" value={(partner as any).next_meeting_date || ""} onChange={e => updatePartner.mutate({ id: partner.id, next_meeting_date: e.target.value || null } as any)} />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <Label className="text-[11px] text-muted-foreground font-normal">Relationship Status</Label>
                  <Select value={relStatus} onValueChange={v => updatePartner.mutate({ id: partner.id, relationship_status: v } as any)}>
                    <SelectTrigger className="h-8 mt-1 max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Healthy">Healthy</SelectItem>
                      <SelectItem value="Growing">Growing</SelectItem>
                      <SelectItem value="Silent">Silent</SelectItem>
                      <SelectItem value="At Risk">At Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(daysUntilMeeting !== null || expiringCertCount > 0 || expiredRenewalsCount > 0) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {daysUntilMeeting !== null && (
                    <span className={`text-[11px] rounded-md px-2 py-1 border ${daysUntilMeeting < 0 ? "bg-destructive/10 text-destructive border-destructive/30" : daysUntilMeeting <= 7 ? "bg-warning/10 text-warning-foreground border-warning/30" : "bg-info/10 text-info border-info/20"}`}>
                      {daysUntilMeeting < 0 ? `Meeting overdue by ${Math.abs(daysUntilMeeting)}d` : daysUntilMeeting === 0 ? "Meeting today" : `Meeting in ${daysUntilMeeting}d`}
                    </span>
                  )}
                  {expiringCertCount > 0 && (
                    <span className="text-[11px] rounded-md px-2 py-1 border bg-warning/10 text-warning-foreground border-warning/30">
                      {expiringCertCount} cert{expiringCertCount > 1 ? "s" : ""} expiring ≤30d
                    </span>
                  )}
                  {expiredRenewalsCount > 0 && (
                    <span className="text-[11px] rounded-md px-2 py-1 border bg-destructive/10 text-destructive border-destructive/30">
                      {expiredRenewalsCount} renewal{expiredRenewalsCount > 1 ? "s" : ""} expired
                    </span>
                  )}
                </div>
              )}
            </div>
          </details>
        </TabsContent>


        <TabsContent value="relationship" className="mt-5 animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Meeting notes, follow-ups, and relationship history.</p>
            <Button size="sm" onClick={() => setShowAddNote(true)}><Plus className="h-4 w-4 mr-1.5" /> New Entry</Button>
          </div>
          {notes.length === 0 ? (
            <div className="bg-card rounded-xl border-2 border-dashed shadow-sm p-10 text-center space-y-3">
              <p className="text-sm text-foreground font-medium">Start building the relationship history</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">Add a meeting note or follow-up to keep context about this partner organised and shared with the team.</p>
              <Button size="sm" onClick={() => setShowAddNote(true)}><Plus className="h-4 w-4 mr-1.5" /> Add first entry</Button>
            </div>
          ) : (
            <div className="relative space-y-4 before:content-[''] before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-border">
              {notes.map(n => (
                <RelationshipTimelineEntry
                  key={n.id}
                  note={n}
                  onDelete={() => deleteNote.mutate({ id: n.id, partner_id: partner.id })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients" className="mt-5 animate-fade-in space-y-3">
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

        <TabsContent value="leads" className="mt-5 animate-fade-in space-y-3">
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

        <TabsContent value="renewals" className="mt-5 animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{partnerRenewals.length} renewal{partnerRenewals.length === 1 ? "" : "s"} {expiredRenewalsCount > 0 && <span className="text-destructive font-medium">· {expiredRenewalsCount} expired</span>}</p>
            <Button size="sm" onClick={() => setShowAddRenewal(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Renewal</Button>
          </div>
          {partnerRenewals.length === 0 ? (
            <div className="bg-card rounded-xl border-2 border-dashed shadow-sm p-10 text-center space-y-3">
              <p className="text-sm text-foreground font-medium">No renewals tracked yet</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">Add upcoming license, SAT or contract renewals to monitor expirations and never miss a deadline.</p>
              <Button size="sm" onClick={() => setShowAddRenewal(true)}><Plus className="h-4 w-4 mr-1.5" /> Add first renewal</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {partnerRenewals.map((r: any) => {
                const days = r.renewal_date ? Math.ceil((new Date(r.renewal_date).getTime() - Date.now()) / 86400000) : null;
                const isExpired = days !== null && days < 0 && r.status !== "Completed";
                const isCompleted = r.status === "Completed";
                const accent = isCompleted ? "border-l-success bg-success/5" : isExpired ? "border-l-destructive bg-destructive/5" : "border-l-info bg-info/5";
                const statusBadge: any = isCompleted ? "success" : isExpired ? "destructive" : r.status === "In Progress" ? "warning" : "default";
                const cl = clients.find(c => c.id === r.client_id);
                return (
                  <div key={r.id} className={`bg-card rounded-xl border border-l-4 shadow-sm p-4 space-y-3 ${accent}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{r.renewal_type}</Badge>
                          <Badge variant={statusBadge}>{isExpired ? "Expired" : r.status}</Badge>
                        </div>
                        <p className="text-sm font-medium mt-1.5 truncate">{cl?.commercial_name || "Client"}</p>
                      </div>
                      <span className="text-base font-bold tabular-nums shrink-0">€{Number(r.estimated_value || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground tabular-nums">{r.renewal_date}</span>
                      {days !== null && !isCompleted && (
                        <span className={`tabular-nums font-medium ${days < 0 ? "text-destructive" : days <= 30 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Select value={r.status} onValueChange={(v) => updateRenewalStatus(r.id, v)}>
                        <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Upcoming">Upcoming</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                      {!isCompleted && (
                        <Button size="sm" variant="default" onClick={() => updateRenewalStatus(r.id, "Completed")}>Mark Completed</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="certifications" className="mt-5 animate-fade-in space-y-3">
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Onboarding Settings</h3>
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

      {/* Structured Relationship Entry Dialog (v2) */}
      <RelationshipEntryDialog open={showAddNote} onOpenChange={setShowAddNote} partnerId={partner.id} />

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

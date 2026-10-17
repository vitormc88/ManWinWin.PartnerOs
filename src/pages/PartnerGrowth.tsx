import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ArrowRight, MapPin, Clock3, LayoutGrid, List, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { usePartnerProspects, useProspectTasks, useCreateProspect, RECRUITMENT_STAGES, CLOSED_OUTCOMES, type PartnerProspect, type PartnerModel } from "@/hooks/usePartnerGrowth";
import { COUNTRY_NAME_BY_CODE } from "@/data/iso-countries";
import { CountryCodeCombobox } from "@/components/partners/CountryCodeCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const stageOptions = [...RECRUITMENT_STAGES, ...CLOSED_OUTCOMES];
const countryLabel = (code: string) => COUNTRY_NAME_BY_CODE[code] ?? code;
const modelOptions: PartnerModel[] = ["CMSC", "CMAR", "CMAI", "Strategic Alliance"];

export default function PartnerGrowth() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const access = useModuleAccess();
  const canEdit = access.canEdit("partner_growth");
  const { data: prospects = [], isLoading, isError } = usePartnerProspects();
  const { data: tasks = [] } = useProspectTasks();
  const create = useCreateProspect();
  const [view, setView] = useState<"pipeline" | "actions" | "directory">("pipeline");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [stage, setStage] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [model, setModel] = useState<PartnerModel | "">("");
  const countries = useMemo(() => [...new Set(prospects.map((p) => p.country))].sort((a, b) => countryLabel(a).localeCompare(countryLabel(b))), [prospects]);
  const filtered = useMemo(() => prospects.filter((p) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [p.company_name, countryLabel(p.country), p.country, p.proposed_partner_type ?? ""].some((v) => v.toLowerCase().includes(term));
    return matchesSearch && (country === "all" || p.country === country) && (stage === "all" || p.recruitment_stage === stage);
  }), [prospects, search, country, stage]);
  const openTasks = tasks.filter((t) => t.task_status !== "Completed");
  const actionRows = useMemo(() => openTasks.filter((t) => t.owner_user_id === user?.id && filtered.some((p) => p.id === t.related_entity_id))
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")), [openTasks, user?.id, filtered]);
  const byId = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);
  const open = (p: PartnerProspect) => navigate("/partner-growth/" + p.id);
  const createNew = async () => {
    if (name.trim().length < 2 || !newCountry) { toast.error("Company and country are required"); return; }
    const duplicate = prospects.some((p) => p.country === newCountry && p.company_name.trim().toLowerCase() === name.trim().toLowerCase());
    if (duplicate) { toast.error("This company already exists in that country"); return; }
    try {
      const p = await create.mutateAsync({ company_name: name, country: newCountry, proposed_partner_type: model || null });
      setShowNew(false); setName(""); setNewCountry(""); setModel(""); open(p);
    } catch (e: any) { toast.error(e?.message ?? "Could not create prospect"); }
  };
  const card = (p: PartnerProspect) => {
    const pending = openTasks.filter((t) => t.related_entity_id === p.id);
    return (
      <button key={p.id} type="button" onClick={() => open(p)}
        className="w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-snug">{p.company_name}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{countryLabel(p.country)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.proposed_partner_type && <Badge variant="secondary">{p.proposed_partner_type}</Badge>}
          {pending.length > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{pending.length} action{pending.length > 1 ? "s" : ""}</span>}
        </div>
      </button>
    );
  };
  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Partner Growth</h1>
          <p className="text-sm text-muted-foreground">Recruitment of future partners — separate from customer opportunities</p></div>
        {canEdit && <Button onClick={() => setShowNew(true)}><Plus className="mr-2 h-4 w-4" />New Prospect</Button>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { title: "In pipeline", value: prospects.filter((p) => RECRUITMENT_STAGES.includes(p.recruitment_stage as typeof RECRUITMENT_STAGES[number])).length },
          { title: "My actions", value: openTasks.filter((t) => t.owner_user_id === user?.id).length },
          { title: "Agreements", value: prospects.filter((p) => p.recruitment_stage === "Agreement Pending").length },
        ].map((m) => <Card key={m.title}><CardContent className="p-3 sm:p-4"><div className="text-2xl font-bold">{m.value}</div><p className="text-xs text-muted-foreground">{m.title}</p></CardContent></Card>)}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Recruitment views">
        {([{ id: "pipeline", label: "Pipeline", icon: LayoutGrid }, { id: "actions", label: "My Actions", icon: ClipboardList }, { id: "directory", label: "Directory", icon: List }] as const)
          .map(({ id, label, icon: Icon }) => <Button key={id} variant={view === id ? "default" : "outline"} size="sm" onClick={() => setView(id)}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_190px_220px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Search companies and countries" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or country..." /></div>
        <Select value={country} onValueChange={setCountry}><SelectTrigger aria-label="Filter by country"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All countries</SelectItem>
          {countries.map((c) => <SelectItem key={c} value={c}>{countryLabel(c)}</SelectItem>)}</SelectContent></Select>
        <Select value={stage} onValueChange={setStage}><SelectTrigger aria-label="Filter by stage"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>
          {stageOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading prospects…</p>
        : isError ? <p role="alert" className="text-destructive">Unable to load prospects. Please check your permissions and TEST connection.</p>
        : view === "pipeline" ? <div className="overflow-x-auto pb-3" aria-label="Recruitment pipeline">
          <div className="flex min-w-max items-start gap-3">
            {RECRUITMENT_STAGES.map((s) => <section key={s} className="w-56 shrink-0 space-y-3 rounded-xl bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{s}</h2>
                <Badge variant="outline">{filtered.filter((p) => p.recruitment_stage === s).length}</Badge></div>
              {filtered.filter((p) => p.recruitment_stage === s).map(card)}
            </section>)}
          </div><p className="mt-2 text-xs text-muted-foreground">Scroll horizontally to see all stages. Select any prospect to update its stage.</p></div>
        : view === "directory" ? <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} prospects</p>
          {filtered.map((p) => <button key={p.id} type="button" onClick={() => open(p)}
            className="flex w-full items-center justify-between rounded-xl border bg-card p-4 text-left hover:bg-muted/40">
            <div><p className="font-semibold">{p.company_name}</p><p className="text-sm text-muted-foreground">{countryLabel(p.country)} · {p.recruitment_stage}</p></div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" /></button>)}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No prospects match the current filters.</p>}
        </div> : <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{actionRows.length} assigned open tasks</p>
          {actionRows.map((t) => {
            const p = byId.get(t.related_entity_id ?? "");
            if (!p) return null;
            return <button key={t.id} onClick={() => open(p)} className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left hover:bg-muted/40">
              <div><p className="font-semibold">{t.title}</p><p className="text-sm text-muted-foreground">{p.company_name} · {countryLabel(p.country)}</p>
                <p className="text-xs text-muted-foreground">{t.due_date ? "Due " + new Date(t.due_date).toLocaleDateString() : "No due date"}</p></div><ArrowRight className="h-4 w-4 shrink-0" /></button>;
          })}
          {actionRows.length === 0 && <p className="text-sm text-muted-foreground">No assigned prospect tasks match the filters.</p>}
        </div>}
      <Dialog open={showNew} onOpenChange={setShowNew}><DialogContent>
        <DialogHeader><DialogTitle>New Partner Prospect</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="pg-company">Company *</Label><Input id="pg-company" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Country *</Label><CountryCodeCombobox value={newCountry} onChange={setNewCountry} /></div>
          <div className="space-y-1"><Label>Proposed model (optional)</Label><Select value={model || "undecided"} onValueChange={(v) => setModel(v === "undecided" ? "" : v as PartnerModel)}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="undecided">To be determined</SelectItem>
              {modelOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
          <p className="text-xs text-muted-foreground">The candidate starts in Identified. No partner account or login is created.</p>
          <Button disabled={create.isPending || name.trim().length < 2 || !newCountry} onClick={createNew} className="w-full">Create Prospect</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}

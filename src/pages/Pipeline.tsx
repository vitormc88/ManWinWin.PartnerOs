import { useState } from "react";
import { Link } from "react-router-dom";
import { useDeals } from "@/hooks/useDeals";
import { usePartners } from "@/hooks/usePartners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, Calendar, GripVertical, Search, TrendingUp, Target, AlertTriangle, Trophy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type DealStage = "Lead" | "Meeting" | "Demo" | "Follow-up" | "Negotiation" | "Won" | "Lost";

const pipelineStages: { key: DealStage; label: string; color: string }[] = [
  { key: "Lead", label: "Lead / Qualified", color: "bg-slate-100 dark:bg-slate-800" },
  { key: "Meeting", label: "Meeting", color: "bg-blue-50 dark:bg-blue-950" },
  { key: "Demo", label: "Demo / Presentation", color: "bg-indigo-50 dark:bg-indigo-950" },
  { key: "Follow-up", label: "Follow-up", color: "bg-amber-50 dark:bg-amber-950" },
  { key: "Negotiation", label: "Negotiation", color: "bg-orange-50 dark:bg-orange-950" },
  { key: "Won", label: "Won", color: "bg-emerald-50 dark:bg-emerald-950" },
  { key: "Lost", label: "Lost", color: "bg-red-50 dark:bg-red-950" },
];

const defaultDealForm = {
  company_name: "",
  partner_id: "",
  country: "",
  industry: "",
  stage: "Lead" as DealStage,
  expected_value: "",
  probability: "10",
  expected_close_date: "",
  assigned_salesperson: "",
  lead_source: "Partner",
  description: "",
  notes: "",
};

export default function Pipeline() {
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...defaultDealForm });
  const [creating, setCreating] = useState(false);
  const { data: deals = [], isLoading } = useDeals();
  const { data: partners = [] } = usePartners();
  const queryClient = useQueryClient();

  const partnerMap = new Map(partners.map(p => [p.id, p.company_name]));
  const partnerNames = [...new Set(deals.map(d => partnerMap.get(d.partner_id || "") || "Unknown"))].filter(Boolean);

  const filtered = deals.filter(d => {
    const pName = partnerMap.get(d.partner_id || "") || "";
    const matchSearch = d.company_name.toLowerCase().includes(search.toLowerCase()) || (d.assigned_salesperson || "").toLowerCase().includes(search.toLowerCase());
    const matchPartner = partnerFilter === "all" || pName === partnerFilter;
    return matchSearch && matchPartner;
  });

  const open = filtered.filter(d => d.status === "Open");
  const won = filtered.filter(d => d.status === "Won");
  const lost = filtered.filter(d => d.status === "Lost");
  const totalPipeline = open.reduce((s, d) => s + (d.expected_value || 0), 0);
  const weightedPipeline = open.reduce((s, d) => s + (d.expected_value || 0) * ((d.probability || 0) / 100), 0);
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const stuckDeals = open.filter(d => (d.aging_days || 0) > 45).length;

  const handleDrop = async (stage: DealStage, dealId: string) => {
    const newStatus = stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open";
    await supabase.from("deals").update({ stage, status: newStatus, stage_entered_at: new Date().toISOString() }).eq("id", dealId);
    queryClient.invalidateQueries({ queryKey: ["deals"] });
  };

  const handleCreate = async () => {
    if (!form.company_name) { toast.error("Company name is required"); return; }
    setCreating(true);
    try {
      const { error } = await supabase.from("deals").insert({
        company_name: form.company_name,
        partner_id: form.partner_id || null,
        country: form.country || null,
        industry: form.industry || null,
        stage: form.stage,
        expected_value: form.expected_value ? parseFloat(form.expected_value) : 0,
        probability: parseInt(form.probability) || 10,
        expected_close_date: form.expected_close_date || null,
        assigned_salesperson: form.assigned_salesperson || null,
        lead_source: form.lead_source || "Partner",
        description: form.description || null,
        notes: form.notes || null,
        status: form.stage === "Won" ? "Won" : form.stage === "Lost" ? "Lost" : "Open",
      });
      if (error) throw error;
      toast.success("Deal created successfully");
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setShowCreate(false);
      setForm({ ...defaultDealForm });
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("permission denied")) {
        toast.error("You do not have permission to create deals.");
      } else {
        toast.error(msg || "Failed to create deal");
      }
    } finally { setCreating(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div className="flex items-center justify-between animate-reveal-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">{open.length} open deals · €{(totalPipeline / 1000).toFixed(0)}k pipeline</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New Deal</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        {[
          { label: "Pipeline Value", value: `€${(totalPipeline / 1000).toFixed(0)}k`, icon: TrendingUp, accent: "text-primary" },
          { label: "Weighted Pipeline", value: `€${(weightedPipeline / 1000).toFixed(0)}k`, icon: Target, accent: "text-foreground" },
          { label: "Win Rate", value: `${winRate}%`, icon: Trophy, accent: "text-emerald-600" },
          { label: "Stuck Deals", value: String(stuckDeals), icon: AlertTriangle, accent: stuckDeals > 0 ? "text-amber-600" : "text-foreground" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
            </div>
            <div>
              <p className={`text-lg font-bold tabular-nums ${kpi.accent}`}>{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 animate-reveal-up" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="text" placeholder="Search deals..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground" />
        </div>
        <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} className="h-9 px-3 rounded-lg border bg-card text-sm text-muted-foreground">
          <option value="all">All Partners</option>
          {partnerNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 animate-reveal-up" style={{ animationDelay: "180ms" }}>
        {pipelineStages.filter(s => s.key !== "Won" && s.key !== "Lost").map(stage => {
          const stageDeals = filtered.filter(d => d.stage === stage.key);
          const stageValue = stageDeals.reduce((s, d) => s + (d.expected_value || 0), 0);
          return (
            <div key={stage.key} className="min-w-[280px] w-[280px] shrink-0"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData("dealId"); if (id) handleDrop(stage.key, id); }}>
              <div className={`rounded-xl ${stage.color} border p-3 min-h-[400px]`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{stage.label}</h3>
                    <Badge variant="outline" className="text-[10px] tabular-nums">{stageDeals.length}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums font-medium">€{(stageValue / 1000).toFixed(0)}k</span>
                </div>
                <div className="space-y-2">
                  {stageDeals.map(deal => (
                    <Link key={deal.id} to={`/deals/${deal.id}`} draggable
                      onDragStart={e => e.dataTransfer.setData("dealId", deal.id)}
                      className="block bg-card rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-foreground leading-tight">{deal.company_name}</p>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">{partnerMap.get(deal.partner_id || "") || "—"}</p>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-foreground tabular-nums">€{(deal.expected_value || 0).toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px]">{deal.probability}%</Badge>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{(deal.assigned_salesperson || "").split(" ")[0]}</span>
                        <div className="flex items-center gap-2">
                          {(deal.aging_days || 0) > 45 && <span className="text-amber-600 font-medium">{deal.aging_days}d</span>}
                          <span>{deal.country}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-reveal-up" style={{ animationDelay: "240ms" }}>
        {(["Won", "Lost"] as DealStage[]).map(stage => {
          const stageInfo = pipelineStages.find(s => s.key === stage)!;
          const stageDeals = filtered.filter(d => d.stage === stage);
          return (
            <div key={stage} className={`rounded-xl ${stageInfo.color} border p-4`}>
              <h3 className="text-sm font-semibold text-foreground mb-3">{stageInfo.label} ({stageDeals.length})</h3>
              <div className="space-y-2">
                {stageDeals.map(deal => (
                  <Link key={deal.id} to={`/deals/${deal.id}`} className="flex items-center justify-between bg-card rounded-lg border p-3 hover:shadow-sm transition-shadow">
                    <div>
                      <p className="text-sm font-medium text-foreground">{deal.company_name}</p>
                      <p className="text-[11px] text-muted-foreground">{partnerMap.get(deal.partner_id || "") || "—"} · {deal.assigned_salesperson}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">€{(deal.total_value || deal.expected_value || 0).toLocaleString()}</span>
                  </Link>
                ))}
                {stageDeals.length === 0 && <p className="text-xs text-muted-foreground">No {stage.toLowerCase()} deals</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Deal Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Deal</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div>
                <Label>Partner</Label>
                <Select value={form.partner_id || "none"} onValueChange={v => setForm(f => ({ ...f, partner_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Partner</SelectItem>
                    {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Country</Label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Expected Value (€)</Label><Input type="number" value={form.expected_value} onChange={e => setForm(f => ({ ...f, expected_value: e.target.value }))} /></div>
              <div><Label>Probability (%)</Label><Input type="number" value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value }))} /></div>
              <div><Label>Expected Close</Label><Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Assigned Salesperson</Label><Input value={form.assigned_salesperson} onChange={e => setForm(f => ({ ...f, assigned_salesperson: e.target.value }))} /></div>
              <div>
                <Label>Lead Source</Label>
                <Select value={form.lead_source} onValueChange={v => setForm(f => ({ ...f, lead_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Partner">Partner</SelectItem>
                    <SelectItem value="Inbound">Inbound</SelectItem>
                    <SelectItem value="Outbound">Outbound</SelectItem>
                    <SelectItem value="HQ">HQ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as DealStage }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelineStages.filter(s => s.key !== "Won" && s.key !== "Lost").map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create Deal"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

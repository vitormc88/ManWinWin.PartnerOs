import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTargetAccounts,
  useCreateTargetAccount,
  useDuplicateCheck,
  type TargetAccountRow,
} from "@/hooks/useTargetAccounts";
import {
  TARGET_ACCOUNT_STATUSES,
  priorityBand,
  researchCompleteness,
  normaliseDomain,
  normalizeTargetStatus,
  type PriorityBand,
} from "@/lib/prospecting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { Search, Plus, Target, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const statusColor = (s: string) => {
  switch (s) {
    case "Researching":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Ready for Outreach":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "Deprioritised":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "Converted":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const bandColor = (band: PriorityBand) =>
  band === "High"
    ? "bg-primary/10 text-primary"
    : band === "Medium"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-muted text-muted-foreground";

function completenessOf(a: TargetAccountRow) {
  return researchCompleteness({
    country: a.country,
    industry: a.industry,
    fit_indicators: a.fit_indicators,
    fit_score: a.fit_score,
    maintenance_hypothesis: a.maintenance_hypothesis,
    key_research_gap: a.key_research_gap,
    evidenceCount: a.evidence_count,
    signalCount: a.signal_count,
    peopleWithRoleCount: a.people_with_role_count,
  });
}

export default function Prospecting() {
  const navigate = useNavigate();
  const { profile, isHQ, isAdmin } = useAuth();
  const { data: accounts = [], isLoading } = useTargetAccounts();
  const createAccount = useCreateTargetAccount();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBand, setFilterBand] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ company_name: "", country: "", website: "", industry: "" });

  const duplicates = useDuplicateCheck({ company_name: form.company_name, website: form.website });

  const rows = useMemo(
    () =>
      accounts.filter((a) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          a.company_name.toLowerCase().includes(q) ||
          (a.website_domain || "").includes(q) ||
          (a.country || "").toLowerCase().includes(q);
        const matchesStatus = filterStatus === "all" || a.status === filterStatus;
        const matchesBand = filterBand === "all" || priorityBand(a.priority_total ?? 0) === filterBand;
        return matchesSearch && matchesStatus && matchesBand;
      }),
    [accounts, search, filterStatus, filterBand]
  );

  const kpis = useMemo(() => {
    const active = accounts.filter((a) => a.status !== "Converted" && a.status !== "Deprioritised");
    const ready = accounts.filter((a) => a.status === "Ready for Outreach").length;
    const high = active.filter((a) => priorityBand(a.priority_total ?? 0) === "High").length;
    const avg = accounts.length
      ? Math.round(accounts.reduce((s, a) => s + completenessOf(a), 0) / accounts.length)
      : 0;
    return { active: active.length, ready, high, avg };
  }, [accounts]);

  const submit = async () => {
    if (!form.company_name.trim() || !form.country.trim()) {
      toast.error("Company name and country are required.");
      return;
    }
    try {
      const created = await createAccount.mutateAsync({
        company_name: form.company_name.trim(),
        country: form.country.trim(),
        website: form.website.trim() || null,
        industry: form.industry || null,
        owner_user_id: profile?.id || null,
        created_by: profile?.id || null,
        partner_uuid: isHQ || isAdmin ? (profile?.partner_id ?? null) : (profile?.partner_id ?? null),
      });
      toast.success("Target Account created");
      setShowCreate(false);
      setForm({ company_name: "", country: "", website: "", industry: "" });
      navigate(`/prospecting/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the account");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospecting</h1>
          <p className="text-sm text-muted-foreground">
            Target Accounts you are researching — prioritising attention, not purchase probability.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Target Account
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active accounts", value: kpis.active },
          { label: "Ready for Outreach", value: kpis.ready },
          { label: "High priority", value: kpis.high },
          { label: "Avg. research completeness", value: `${kpis.avg}%` },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search company or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TARGET_ACCOUNT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterBand} onValueChange={setFilterBand}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="High">High (9–12)</SelectItem>
            <SelectItem value="Medium">Medium (6–8)</SelectItem>
            <SelectItem value="Low">Low (0–5)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading target accounts…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Target className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No target accounts yet. Start by researching one company.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Company</th>
                    <th className="p-3">Industry</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Fit / Signal</th>
                    <th className="p-3">Research</th>
                    <th className="p-3">Primary contact</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const total = a.priority_total ?? 0;
                    const band = priorityBand(total);
                    return (
                      <tr
                        key={a.id}
                        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                        onClick={() => navigate(`/prospecting/${a.id}`)}
                      >
                        <td className="p-3">
                          <p className="font-medium">{a.company_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.country}
                            {a.website_domain ? ` · ${a.website_domain}` : ""}
                          </p>
                        </td>
                        <td className="p-3 text-muted-foreground">{a.industry || "—"}</td>
                        <td className="p-3">
                          <Badge className={bandColor(band)} variant="secondary">
                            {total}/12 · {band}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {a.fit_score}/3 · {a.signal_score}/3
                        </td>
                        <td className="p-3 text-muted-foreground">{completenessOf(a)}%</td>
                        <td className="p-3 text-muted-foreground">{a.primary_contact_name || "—"}</td>
                        <td className="p-3">
                          <Badge className={statusColor(normalizeTargetStatus(a.status))} variant="secondary">
                            {a.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Target Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Company name *</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Company we want to research"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Country *</Label>
              <CountryCombobox
                value={form.country}
                onChange={(v) => setForm({ ...form, country: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://example.com"
              />
              {normaliseDomain(form.website) && (
                <p className="text-xs text-muted-foreground">
                  Domain: {normaliseDomain(form.website)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <SectorSelect value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />
            </div>

            {(duplicates.data?.length ?? 0) > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" /> Possible duplicates
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-900 dark:text-amber-200">
                  {duplicates.data!.slice(0, 5).map((d) => (
                    <li key={`${d.entity}-${d.id}`}>
                      {d.entity}: {d.name} (matched on {d.matchedOn})
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-900 dark:text-amber-200">
                  This is a warning only — subsidiaries and sites legitimately repeat. You can create anyway.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createAccount.isPending}>
              {createAccount.isPending ? "Creating…" : "Create anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

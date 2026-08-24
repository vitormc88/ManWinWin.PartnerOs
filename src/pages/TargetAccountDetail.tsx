import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAddEvidence,
  useAddPerson,
  useAddSignal,
  useConvertTargetAccountToLead,
  useDeleteChildRecord,
  useSetPrimaryContact,
  useTargetAccount,
  useTargetAccountEvidence,
  useTargetAccountPeople,
  useTargetAccountSignals,
  useUpdateTargetAccount,
} from "@/hooks/useTargetAccounts";
import {
  CONFIDENCE_LEVELS,
  CONVERSATION_ROLES,
  FIT_INDICATORS,
  SCORE_DIMENSIONS,
  SIGNAL_TYPES,
  UNKNOWN_TYPES,
  asKeyArray,
  canCreateLead,
  labelFor,
  missingResearchItems,
  normalizeTargetStatus,
  priorityBand,
  readinessWarnings,
  researchCompleteness,
  type TargetAccountStatus,
} from "@/lib/prospecting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { ArrowLeft, ExternalLink, Star, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { OutreachWorkspace } from "@/components/prospecting/OutreachWorkspace";
import { AcademyGuidance } from "@/components/common/AcademyGuidance";
import { useTargetAccountActivities } from "@/hooks/useTargetAccountActivities";
import { conversionReadiness } from "@/lib/outreach-activities";

const emptyEvidence = { fact: "", source: "", link: "", evidence_date: "" };
const emptySignal = { signal_type: "", description: "", signal_date: "", source: "" };
const emptyPerson = { full_name: "", job_title: "", conversation_role: "unknown", email: "", phone: "" };

export default function TargetAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const { data: account, isLoading } = useTargetAccount(id);
  const { data: evidence = [] } = useTargetAccountEvidence(id);
  const { data: signals = [] } = useTargetAccountSignals(id);
  const { data: people = [] } = useTargetAccountPeople(id);
  const { data: activities = [] } = useTargetAccountActivities(id);

  const update = useUpdateTargetAccount();
  const addEvidence = useAddEvidence();
  const addSignal = useAddSignal();
  const addPerson = useAddPerson();
  const setPrimary = useSetPrimaryContact();
  const removeChild = useDeleteChildRecord();
  const convert = useConvertTargetAccountToLead();

  const [evidenceForm, setEvidenceForm] = useState(emptyEvidence);
  const [signalForm, setSignalForm] = useState(emptySignal);
  const [personForm, setPersonForm] = useState(emptyPerson);

  const status = normalizeTargetStatus(account?.status);
  const readOnly = status === "Converted";

  const completeness = useMemo(
    () =>
      account
        ? researchCompleteness({
            country: account.country,
            industry: account.industry,
            fit_indicators: account.fit_indicators,
            fit_score: account.fit_score,
            maintenance_hypothesis: account.maintenance_hypothesis,
            key_research_gap: account.key_research_gap,
            evidenceCount: evidence.length,
            signalCount: signals.length,
            peopleWithRoleCount: people.filter((p) => p.conversation_role !== "unknown").length,
          })
        : 0,
    [account, evidence.length, signals.length, people]
  );

  const missing = account
    ? missingResearchItems({
        country: account.country,
        industry: account.industry,
        fit_indicators: account.fit_indicators,
        fit_score: account.fit_score,
        maintenance_hypothesis: account.maintenance_hypothesis,
        key_research_gap: account.key_research_gap,
        evidenceCount: evidence.length,
        signalCount: signals.length,
        peopleWithRoleCount: people.filter((p) => p.conversation_role !== "unknown").length,
      })
    : [];

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading target account…</p>;
  if (!account) return <p className="p-6 text-sm text-muted-foreground">Target account not found.</p>;

  const primaryContact = people.find((p) => p.is_primary_contact) || null;
  const total = account.priority_total ?? 0;
  const patch = (updates: Record<string, unknown>) => update.mutate({ id: account.id, ...updates });

  const toggleKey = (field: "fit_indicators" | "unknowns", key: string) => {
    const current = asKeyArray(account[field]);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    patch({ [field]: next });
  };

  const changeStatus = (next: TargetAccountStatus) => {
    if (next === "Ready for Outreach") {
      const warnings = readinessWarnings({
        fit_indicators: account.fit_indicators,
        maintenance_hypothesis: account.maintenance_hypothesis,
        evidenceCount: evidence.length,
        peopleWithRoleCount: people.filter((p) => p.conversation_role !== "unknown").length,
      });
      if (warnings.length) toast.warning(`Marked ready with gaps: ${warnings.join(", ")}`);
    }
    if (next === "Deprioritised") {
      const reason = window.prompt("Why are you deprioritising this account?") || "";
      patch({ status: next, deprioritised_reason: reason });
      return;
    }
    if (next === "Researching") {
      patch({ status: next, deprioritised_reason: null });
      return;
    }
    patch({ status: next });
  };

  const readiness = conversionReadiness({
    status,
    alreadyConverted: !!account.converted_lead_id,
    primaryContact,
    activities,
  });

  const createLead = async () => {
    if (!readiness.ready) {
      toast.error(readiness.blockers[0]);
      return;
    }
    try {
      const lead = await convert.mutateAsync({
        account,
        primaryContact: primaryContact!,
        evidence,
        signals,
      });
      toast.success("Lead created from this Target Account");
      navigate(`/incoming-leads/${lead.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the lead");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/prospecting")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Prospecting
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{account.company_name}</h1>
          <p className="text-sm text-muted-foreground">
            {account.country}
            {account.website_domain ? ` · ${account.website_domain}` : ""}
          </p>
        </div>
      </div>

      {readOnly && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          This account was converted. Research is kept read-only as the historical record.{" "}
          {account.converted_lead_id && (
            <Link className="text-primary underline" to={`/incoming-leads/${account.converted_lead_id}`}>
              Open the lead <ExternalLink className="inline h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {(status === "Ready for Outreach" || activities.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outreach & Engagement</CardTitle>
              </CardHeader>
              <CardContent>
                <OutreachWorkspace
                  accountId={account.id}
                  people={people}
                  readOnly={readOnly}
                  userId={profile?.id}
                />
              </CardContent>
            </Card>
          )}
          {/* 1 — Company */}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">1 · Company</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input
                  defaultValue={account.company_name}
                  disabled={readOnly}
                  onBlur={(e) => e.target.value !== account.company_name && patch({ company_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <CountryCombobox value={account.country} onChange={(v) => !readOnly && patch({ country: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  defaultValue={account.website || ""}
                  disabled={readOnly}
                  onBlur={(e) => e.target.value !== (account.website || "") && patch({ website: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <SectorSelect value={account.industry || ""} onChange={(v) => !readOnly && patch({ industry: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Maintenance environment</Label>
                <Input
                  defaultValue={account.maintenance_environment || ""}
                  disabled={readOnly}
                  placeholder="e.g. 3 plants, packaging lines"
                  onBlur={(e) => patch({ maintenance_environment: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Company size context (optional)</Label>
                <Input
                  defaultValue={account.size_context || ""}
                  disabled={readOnly}
                  placeholder="e.g. ~400 employees"
                  onBlur={(e) => patch({ size_context: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 2 — Why It Fits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2 · Why It Fits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {FIT_INDICATORS.map((f) => {
                  const checked = asKeyArray(account.fit_indicators).includes(f.key);
                  return (
                    <label key={f.key} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={readOnly}
                        onCheckedChange={() => toggleKey("fit_indicators", f.key)}
                      />
                      <span>{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 3 — Evidence & Hypothesis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3 · Evidence &amp; Hypothesis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Evidence — what we know
                </p>
                {evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence recorded yet.</p>}
                {evidence.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
                    <div>
                      <p>{e.fact}</p>
                      <p className="text-xs text-muted-foreground">
                        {[e.source, e.evidence_date].filter(Boolean).join(" · ") || "No source"}
                        {e.link && (
                          <>
                            {" "}
                            <a className="text-primary underline" href={e.link} target="_blank" rel="noreferrer">
                              link
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    {!readOnly && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          removeChild.mutate({ table: "target_account_evidence", id: e.id, accountId: account.id })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-4">
                    <Input
                      className="sm:col-span-2"
                      placeholder="Fact we verified"
                      value={evidenceForm.fact}
                      onChange={(ev) => setEvidenceForm({ ...evidenceForm, fact: ev.target.value })}
                    />
                    <Input
                      placeholder="Source"
                      value={evidenceForm.source}
                      onChange={(ev) => setEvidenceForm({ ...evidenceForm, source: ev.target.value })}
                    />
                    <Input
                      type="date"
                      value={evidenceForm.evidence_date}
                      onChange={(ev) => setEvidenceForm({ ...evidenceForm, evidence_date: ev.target.value })}
                    />
                    <Input
                      className="sm:col-span-3"
                      placeholder="Link (optional)"
                      value={evidenceForm.link}
                      onChange={(ev) => setEvidenceForm({ ...evidenceForm, link: ev.target.value })}
                    />
                    <Button
                      onClick={() => {
                        if (!evidenceForm.fact.trim()) return toast.error("Describe the fact first.");
                        addEvidence.mutate({
                          target_account_id: account.id,
                          fact: evidenceForm.fact.trim(),
                          source: evidenceForm.source || null,
                          link: evidenceForm.link || null,
                          evidence_date: evidenceForm.evidence_date || null,
                          created_by: profile?.id || null,
                        });
                        setEvidenceForm(emptyEvidence);
                      }}
                    >
                      Add evidence
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Label>Maintenance hypothesis — what we think is worth investigating (not a fact)</Label>
                <Textarea
                  defaultValue={account.maintenance_hypothesis || ""}
                  disabled={readOnly}
                  rows={3}
                  onBlur={(e) => patch({ maintenance_hypothesis: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 4 — Signals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4 · Signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                A signal is a reason to look closer — not a problem and not an opportunity.
              </p>
              {signals.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{labelFor(SIGNAL_TYPES, s.signal_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.description, s.source, s.signal_date].filter(Boolean).join(" · ") || "No detail"}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        removeChild.mutate({ table: "target_account_signals", id: s.id, accountId: account.id })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-4">
                  <Select
                    value={signalForm.signal_type}
                    onValueChange={(v) => setSignalForm({ ...signalForm, signal_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Signal type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIGNAL_TYPES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="sm:col-span-2"
                    placeholder="Description"
                    value={signalForm.description}
                    onChange={(e) => setSignalForm({ ...signalForm, description: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={signalForm.signal_date}
                    onChange={(e) => setSignalForm({ ...signalForm, signal_date: e.target.value })}
                  />
                  <Input
                    className="sm:col-span-3"
                    placeholder="Source (optional)"
                    value={signalForm.source}
                    onChange={(e) => setSignalForm({ ...signalForm, source: e.target.value })}
                  />
                  <Button
                    onClick={() => {
                      if (!signalForm.signal_type) return toast.error("Pick a signal type.");
                      addSignal.mutate({
                        target_account_id: account.id,
                        signal_type: signalForm.signal_type,
                        description: signalForm.description || null,
                        signal_date: signalForm.signal_date || null,
                        source: signalForm.source || null,
                        created_by: profile?.id || null,
                      });
                      setSignalForm(emptySignal);
                    }}
                  >
                    Add signal
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5 — Relevant People */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">5 · Relevant People</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {people.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {p.full_name}
                      {p.is_primary_contact && (
                        <Badge className="ml-2" variant="secondary">
                          Primary
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[p.job_title, labelFor(CONVERSATION_ROLES, p.conversation_role), p.email, p.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1">
                      {!p.is_primary_contact && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Set as primary prospecting contact"
                          onClick={() => setPrimary.mutate({ accountId: account.id, personId: p.id })}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          removeChild.mutate({ table: "target_account_people", id: p.id, accountId: account.id })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!readOnly && (
                <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-3">
                  <Input
                    placeholder="Name"
                    value={personForm.full_name}
                    onChange={(e) => setPersonForm({ ...personForm, full_name: e.target.value })}
                  />
                  <Input
                    placeholder="Job title"
                    value={personForm.job_title}
                    onChange={(e) => setPersonForm({ ...personForm, job_title: e.target.value })}
                  />
                  <Select
                    value={personForm.conversation_role}
                    onValueChange={(v) => setPersonForm({ ...personForm, conversation_role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Role in conversation" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONVERSATION_ROLES.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Email"
                    value={personForm.email}
                    onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })}
                  />
                  <Input
                    placeholder="Phone"
                    value={personForm.phone}
                    onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })}
                  />
                  <Button
                    onClick={() => {
                      if (!personForm.full_name.trim()) return toast.error("Name is required.");
                      addPerson.mutate({
                        target_account_id: account.id,
                        full_name: personForm.full_name.trim(),
                        job_title: personForm.job_title || null,
                        conversation_role: personForm.conversation_role,
                        email: personForm.email || null,
                        phone: personForm.phone || null,
                        created_by: profile?.id || null,
                      });
                      setPersonForm(emptyPerson);
                    }}
                  >
                    Add person
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 6 — What We Don't Know */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">6 · What We Don&apos;t Know</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {UNKNOWN_TYPES.map((u) => (
                  <label key={u.key} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={asKeyArray(account.unknowns).includes(u.key)}
                      disabled={readOnly}
                      onCheckedChange={() => toggleKey("unknowns", u.key)}
                    />
                    <span>{u.label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Key research gap</Label>
                <Input
                  defaultValue={account.key_research_gap || ""}
                  disabled={readOnly}
                  placeholder="The single most important thing we still need to find out"
                  onBlur={(e) => patch({ key_research_gap: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 7 — Prioritisation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">7 · Prioritisation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                This score prioritises research and prospecting effort. It is not purchase probability.
              </p>
              {SCORE_DIMENSIONS.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-xs text-muted-foreground">{d.hint}</p>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((n) => (
                      <Button
                        key={n}
                        size="sm"
                        variant={(account[d.key] ?? 0) === n ? "default" : "outline"}
                        disabled={readOnly}
                        onClick={() => patch({ [d.key]: n })}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Confidence</Label>
                <Select
                  value={account.confidence}
                  onValueChange={(v) => !readOnly && patch({ confidence: v })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIDENCE_LEVELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c[0].toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Priority</p>
                <p className="text-2xl font-semibold">
                  {total}/12 <span className="text-sm font-normal">· {priorityBand(total)}</span>
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Research completeness</p>
                <p className="text-2xl font-semibold">{completeness}%</p>
                {missing.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {missing.map((m) => (
                      <li key={m}>• {m}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</p>
                <p className="text-sm capitalize">{account.confidence}</p>
              </div>
              {account.key_research_gap && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Key research gap</p>
                  <p className="text-sm">{account.key_research_gap}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="secondary">{status}</Badge>
              {account.deprioritised_reason && (
                <p className="text-xs text-muted-foreground">Reason: {account.deprioritised_reason}</p>
              )}
              {status === "Researching" && (
                <Button className="w-full" onClick={() => changeStatus("Ready for Outreach")}>
                  Mark Ready for Outreach
                </Button>
              )}
              {status === "Ready for Outreach" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Outreach happens here. A Lead is created only once there is real two-way engagement.
                  </p>
                  <ul className="space-y-1.5">
                    {readiness.items.map((i) => (
                      <li key={i.label} className="flex items-start gap-2 text-xs">
                        {i.done ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className={i.done ? "text-muted-foreground" : ""}>
                          {i.label}
                          {!i.done && <span className="block text-muted-foreground">{i.hint}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    onClick={createLead}
                    disabled={convert.isPending || !readiness.ready}
                  >
                    Create Lead from this Account
                  </Button>

                  <Button className="w-full" variant="outline" onClick={() => changeStatus("Researching")}>
                    Back to Researching
                  </Button>
                </>
              )}
              {status !== "Converted" && status !== "Deprioritised" && (
                <Button className="w-full" variant="outline" onClick={() => changeStatus("Deprioritised")}>
                  Deprioritise
                </Button>
              )}
              {status === "Deprioritised" && (
                <Button className="w-full" onClick={() => changeStatus("Researching")}>
                  Reopen
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AcademyGuidance } from "@/components/common/AcademyGuidance";
import {
  ATTITUDES,
  BUYING_ROLES,
  DISCOVERY_SECTIONS,
  INFLUENCE_LEVELS,
  discoveryCompleteness,
  sectionCompleteness,
} from "@/lib/discovery";
import {
  useDiscoveryRecord,
  useDiscoveryStakeholders,
  useDeleteStakeholder,
  useSaveDiscovery,
  useSaveStakeholder,
  type DiscoveryParent,
} from "@/hooks/useDiscovery";

function labelOf(options: { key: string; label: string }[], key: string | null | undefined) {
  return options.find((o) => o.key === key)?.label ?? (key || "—");
}

export function DiscoveryWorkspace({ parent, readOnly }: { parent: DiscoveryParent; readOnly?: boolean }) {
  const { data: record, isLoading } = useDiscoveryRecord(parent);
  const save = useSaveDiscovery(parent);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setDraft(record ? { ...(record as unknown as Record<string, unknown>) } : {});
  }, [record?.id, record?.updated_at]);

  const merged = useMemo(() => ({ ...(record as unknown as Record<string, unknown>), ...draft }), [record, draft]);
  const sections = sectionCompleteness(merged);
  const overall = discoveryCompleteness(merged);

  const { data: stakeholders = [] } = useDiscoveryStakeholders(record?.id);
  const saveStakeholder = useSaveStakeholder();
  const removeStakeholder = useDeleteStakeholder();
  const [shOpen, setShOpen] = useState(false);
  const [sh, setSh] = useState({
    full_name: "",
    job_title: "",
    email: "",
    buying_role: "unknown",
    influence: "medium",
    attitude: "unknown",
    concerns: "",
    required_action: "",
  });

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  const persist = () => {
    const patch: Record<string, unknown> = {};
    DISCOVERY_SECTIONS.forEach((s) =>
      s.fields.forEach((f) => {
        if (f.key in draft) patch[f.key] = draft[f.key] === "" ? null : draft[f.key];
      })
    );
    save.mutate(
      { id: record?.id ?? null, patch: patch as never },
      {
        onSuccess: () => toast({ title: "Discovery saved" }),
        onError: (e: unknown) =>
          toast({ title: "Could not save discovery", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  const addStakeholder = () => {
    if (!record?.id || !sh.full_name.trim()) return;
    saveStakeholder.mutate(
      { discovery_id: record.id, ...sh, email: sh.email || null } as never,
      {
        onSuccess: () => {
          setShOpen(false);
          setSh({ full_name: "", job_title: "", email: "", buying_role: "unknown", influence: "medium", attitude: "unknown", concerns: "", required_action: "" });
        },
        onError: (e: unknown) =>
          toast({ title: "Could not save stakeholder", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading discovery…</p>;

  return (
    <div className="space-y-4">
      <AcademyGuidance
        moduleNumber={7}
        title="Discovery — Current, Problem, Impact, Future, Align"
        points={[
          "Discovery is one conversation structure, not a form: understand today before proposing tomorrow.",
          "Keep facts, hypotheses and unknowns visually separate — never present an assumption as a fact.",
          "Align means the customer confirmed your summary back to you.",
        ]}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Discovery completeness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={overall} className="h-2 flex-1" aria-label={`Discovery ${overall}% captured`} />
            <span className="text-sm font-medium">{overall}% captured</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <Badge key={s.key} variant={s.done === s.total ? "default" : "outline"}>
                {s.label} {s.done}/{s.total}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            This reports what is missing. It is not a sales score.
          </p>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible defaultValue="current" className="space-y-2">
        {DISCOVERY_SECTIONS.map((section) => {
          const meta = sections.find((s) => s.key === section.key)!;
          return (
            <AccordionItem key={section.key} value={section.key} className="rounded-lg border border-border px-3">
              <AccordionTrigger className="text-sm">
                <span className="flex flex-1 items-center gap-3 pr-3">
                  <span className="font-medium">{section.label}</span>
                  <Badge variant={meta.done === meta.total ? "default" : "outline"} className="ml-auto">
                    {meta.done}/{meta.total}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <p className="text-sm text-muted-foreground">{section.purpose}</p>
                {section.fields.map((f) => {
                  const value = (merged[f.key] as string | null) ?? "";
                  const id = `discovery-${f.key}`;
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={id}>
                        {f.label}
                        {f.core && <span className="ml-1 text-xs text-muted-foreground">(core)</span>}
                      </Label>
                      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                      {f.kind === "select" ? (
                        <Select
                          value={value || undefined}
                          onValueChange={(v) => set(f.key, v)}
                          disabled={readOnly}
                        >
                          <SelectTrigger id={id}><SelectValue placeholder="Not set" /></SelectTrigger>
                          <SelectContent>
                            {(f.options || []).map((o) => (
                              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : f.kind === "textarea" ? (
                        <Textarea id={id} value={value} disabled={readOnly} onChange={(e) => set(f.key, e.target.value)} />
                      ) : (
                        <Input
                          id={id}
                          type={f.kind === "date" ? "date" : "text"}
                          value={f.kind === "date" && value ? String(value).slice(0, 10) : value}
                          disabled={readOnly}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {!readOnly && (
        <Button onClick={persist} disabled={save.isPending}>
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Save discovery
        </Button>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            Stakeholders ({stakeholders.length})
          </CardTitle>
          {!readOnly && (
            <Button size="sm" variant="outline" disabled={!record?.id} onClick={() => setShOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!record?.id ? (
            <p className="text-sm text-muted-foreground">Save discovery first to add stakeholders.</p>
          ) : stakeholders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stakeholders recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {stakeholders.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      {s.full_name}
                      {s.job_title ? ` — ${s.job_title}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{labelOf(BUYING_ROLES, s.buying_role)}</Badge>
                      <Badge variant="secondary">Influence: {labelOf(INFLUENCE_LEVELS, s.influence)}</Badge>
                      <Badge variant="secondary">{labelOf(ATTITUDES, s.attitude)}</Badge>
                    </div>
                    {s.concerns && <p className="text-sm text-muted-foreground">Concerns: {s.concerns}</p>}
                    {s.required_action && (
                      <p className="text-sm text-muted-foreground">Required action: {s.required_action}</p>
                    )}
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove stakeholder"
                      onClick={() => removeStakeholder.mutate({ id: s.id, discoveryId: record.id })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={shOpen} onOpenChange={setShOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add stakeholder</DialogTitle>
            <DialogDescription>Who influences this decision, and how.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sh-name">Full name</Label>
              <Input id="sh-name" value={sh.full_name} onChange={(e) => setSh({ ...sh, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-title">Job title</Label>
                <Input id="sh-title" value={sh.job_title} onChange={(e) => setSh({ ...sh, job_title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-email">Email</Label>
                <Input id="sh-email" type="email" value={sh.email} onChange={(e) => setSh({ ...sh, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Buying role</Label>
                <Select value={sh.buying_role} onValueChange={(v) => setSh({ ...sh, buying_role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUYING_ROLES.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Influence</Label>
                <Select value={sh.influence} onValueChange={(v) => setSh({ ...sh, influence: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INFLUENCE_LEVELS.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Attitude</Label>
                <Select value={sh.attitude} onValueChange={(v) => setSh({ ...sh, attitude: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATTITUDES.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-concerns">Concerns</Label>
              <Textarea id="sh-concerns" value={sh.concerns} onChange={(e) => setSh({ ...sh, concerns: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-action">Required action</Label>
              <Textarea id="sh-action" value={sh.required_action} onChange={(e) => setSh({ ...sh, required_action: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShOpen(false)}>Cancel</Button>
            <Button onClick={addStakeholder} disabled={!sh.full_name.trim() || saveStakeholder.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

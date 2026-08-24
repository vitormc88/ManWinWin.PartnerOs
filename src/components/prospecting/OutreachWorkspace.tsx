import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Copy, Trash2, Lightbulb } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AcademyGuidance } from "@/components/common/AcademyGuidance";
import {
  OUTREACH_CHANNELS,
  OUTREACH_OUTCOMES,
  engagementChip,
  outreachLabel,
  outreachPlays,
  recommendedNextAction,
  type OutreachActivityLike,
} from "@/lib/outreach-activities";
import type { TargetAccountPerson } from "@/hooks/useTargetAccounts";
import {
  useDeleteTargetAccountActivity,
  useLogTargetAccountActivity,
  useTargetAccountActivities,
} from "@/hooks/useTargetAccountActivities";
import { cn } from "@/lib/utils";

const toneClass: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  destructive: "bg-destructive/10 text-destructive",
};

export function OutreachWorkspace({
  accountId,
  people,
  readOnly,
  userId,
}: {
  accountId: string;
  people: TargetAccountPerson[];
  readOnly?: boolean;
  userId?: string | null;
}) {
  const { data: activities = [] } = useTargetAccountActivities(accountId);
  const log = useLogTargetAccountActivity();
  const remove = useDeleteTargetAccountActivity();

  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("email");
  const [outcome, setOutcome] = useState("attempted_no_response");
  const [personId, setPersonId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 16));

  const list = activities as OutreachActivityLike[];
  const chip = engagementChip(list);
  const next = recommendedNextAction(list);
  const plays = outreachPlays(list);

  const submit = () => {
    log.mutate(
      {
        target_account_id: accountId,
        channel,
        outcome,
        person_id: personId === "none" ? null : personId,
        notes: notes.trim() || null,
        performed_at: new Date(performedAt).toISOString(),
        performed_by: userId ?? null,
      },
      {
        onSuccess: () => {
          toast({ title: "Outreach logged" });
          setOpen(false);
          setNotes("");
        },
        onError: (e: unknown) =>
          toast({ title: "Could not log outreach", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  const personName = (id: string | null | undefined) =>
    people.find((p) => p.id === id)?.full_name ?? null;

  return (
    <div className="space-y-4">
      <AcademyGuidance
        moduleNumber={5}
        title="Outreach & Engagement"
        points={[
          "The Target Account stays the parent record during outreach — a Lead only exists after real engagement.",
          "Log every attempt with its outcome; the engagement state is derived from what you record.",
          "Change channel before repeating the same one, and always aim at a concrete next step.",
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Engagement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Badge className={cn("border-0", toneClass[chip.tone])}>{chip.label}</Badge>
            <p className="text-sm text-muted-foreground">{chip.detail}</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recommended next action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-medium">{next.action}</p>
            <p className="text-sm text-muted-foreground">
              {next.when} · {next.rationale}
            </p>
          </CardContent>
        </Card>
      </div>

      {plays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
              Suggested plays
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plays.map((p) => (
              <div key={p.key} className="rounded-md border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.title}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(p.body);
                      toast({ title: "Template copied" });
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Copy
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{p.body}</pre>
                <p className="mt-2 text-xs text-muted-foreground">
                  Placeholders in brackets must be filled from real research — never invent customer facts.
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Outreach timeline ({activities.length})</CardTitle>
          {!readOnly && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Log outreach
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No outreach recorded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{outreachLabel(OUTREACH_CHANNELS, a.channel)}</Badge>
                      <Badge variant="secondary">{outreachLabel(OUTREACH_OUTCOMES, a.outcome)}</Badge>
                      {personName(a.person_id) && (
                        <span className="text-sm text-muted-foreground">{personName(a.person_id)}</span>
                      )}
                    </div>
                    {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.performed_at).toLocaleString()}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete activity"
                      onClick={() => remove.mutate({ id: a.id, accountId })}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log outreach</DialogTitle>
            <DialogDescription>
              Record what actually happened. The engagement state and conversion gate are derived from this.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTREACH_CHANNELS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Outcome</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTREACH_OUTCOMES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outreach-when">Performed at</Label>
              <Input
                id="outreach-when"
                type="datetime-local"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outreach-notes">Notes</Label>
              <Textarea
                id="outreach-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was said or observed — facts only."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={log.isPending}>Log outreach</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

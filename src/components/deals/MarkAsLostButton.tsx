import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { logSystemActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";

const LOSS_CATEGORIES = [
  "Pricing",
  "Product Gap",
  "Technical Constraint",
  "Competitor",
  "Relationship / Sales Process",
  "Strategic Timing",
  "No Decision",
  "Other",
];

const REASON_GROUPS: { group: string; reasons: string[] }[] = [
  { group: "Commercial", reasons: ["Price too high", "No available budget", "ROI unclear", "Procurement restrictions"] },
  { group: "Product", reasons: ["Missing functionality", "Competitor had stronger features", "Ease of use / UX", "Weak mobile experience", "Reporting limitations", "Weak integrations", "API limitations", "Customization limitations"] },
  { group: "Technical", reasons: ["IT/security concerns", "Hosting requirements mismatch", "Integration complexity", "ERP incompatibility", "Data migration concerns"] },
  { group: "Relationship / Sales", reasons: ["Slow follow-up", "Lost momentum", "Weak customer engagement", "Internal politics", "Decision maker disengaged", "Poor qualification", "No urgency"] },
  { group: "Strategic / Timing", reasons: ["Project postponed", "Using internal system", "Company restructuring", "No internal resources", "No decision taken"] },
  { group: "Other", reasons: ["Other"] },
];

const COMPETITORS = [
  "IBM Maximo", "SAP PM", "Infor EAM", "IFS Ultimo", "Fiix", "UpKeep",
  "MaintainX", "Limble", "Fracttal", "Engeman", "MPsoftware", "Other",
];

interface Props {
  deal: any;
}

export function MarkAsLostButton({ deal }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [category, setCategory] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [hasCompetitor, setHasCompetitor] = useState(false);
  const [competitor, setCompetitor] = useState("");
  const [competitorOther, setCompetitorOther] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setCategory(""); setReasons([]); setHasCompetitor(false);
    setCompetitor(""); setCompetitorOther(""); setNotes("");
  };

  const toggleReason = (r: string) => {
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const submit = async () => {
    if (!category) { toast.error("Select a main loss category"); return; }
    if (hasCompetitor && !competitor) { toast.error("Select competitor"); return; }
    if (hasCompetitor && competitor === "Other" && !competitorOther.trim()) {
      toast.error("Enter competitor name"); return;
    }

    setWorking(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;

      // 1. Update deal
      const { error: dealErr } = await supabase
        .from("deals")
        .update({
          stage: "Lost",
          status: "Lost",
          probability: 0,
          stage_entered_at: new Date().toISOString(),
        })
        .eq("id", deal.id);
      if (dealErr) throw dealErr;

      // 2. Upsert loss detail
      const { data: detail, error: detErr } = await supabase
        .from("opportunity_loss_details")
        .upsert({
          deal_id: deal.id,
          loss_category: category,
          competitor_name: hasCompetitor ? competitor : null,
          competitor_other: hasCompetitor && competitor === "Other" ? competitorOther.trim() : null,
          notes: notes || null,
          lost_at: new Date().toISOString(),
          lost_by: userId,
        }, { onConflict: "deal_id" })
        .select()
        .single();
      if (detErr) throw detErr;

      // 3. Replace reasons
      await supabase.from("opportunity_loss_reasons").delete().eq("loss_detail_id", detail.id);
      if (reasons.length) {
        const rows = reasons.map(r => ({ loss_detail_id: detail.id, reason: r }));
        const { error: rErr } = await supabase.from("opportunity_loss_reasons").insert(rows);
        if (rErr) throw rErr;
      }

      await logSystemActivity(
        deal.id,
        "Lead marked as Lost",
        `Category: ${category}${hasCompetitor ? ` · Competitor: ${competitor === "Other" ? competitorOther : competitor}` : ""}`
      );

      toast.success("Opportunity marked as Lost");
      qc.invalidateQueries({ queryKey: ["deal", deal.id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal_activities", deal.id] });
      qc.invalidateQueries({ queryKey: ["loss_details", deal.id] });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark as Lost");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-orange-300 text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950"
      >
        <XCircle className="h-3.5 w-3.5 mr-1.5" />
        Lost
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Classify Lost Opportunity</DialogTitle>
            <DialogDescription>
              Capture structured commercial intelligence. This data feeds win/loss analytics and helps refine pricing, product, and sales strategy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Section A */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Main Loss Category <span className="text-destructive">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select primary classification" /></SelectTrigger>
                <SelectContent>
                  {LOSS_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Section B */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Detailed Loss Reasons
              </Label>
              <div className="space-y-3">
                {REASON_GROUPS.map(({ group, reasons: rs }) => (
                  <div key={group}>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rs.map(r => {
                        const active = reasons.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => toggleReason(r)}
                            className={cn(
                              "text-xs px-2.5 py-1 rounded-full border transition-colors",
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-foreground border-input hover:bg-secondary"
                            )}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section C */}
            <div className="space-y-3 rounded-lg border bg-secondary/30 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="competitor-toggle" className="text-sm font-medium">Lost to competitor</Label>
                <Switch id="competitor-toggle" checked={hasCompetitor} onCheckedChange={setHasCompetitor} />
              </div>
              {hasCompetitor && (
                <div className="space-y-2">
                  <Select value={competitor} onValueChange={setCompetitor}>
                    <SelectTrigger><SelectValue placeholder="Select competitor" /></SelectTrigger>
                    <SelectContent>
                      {COMPETITORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {competitor === "Other" && (
                    <Input
                      placeholder="Competitor name"
                      value={competitorOther}
                      onChange={e => setCompetitorOther(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Section D */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Additional Context
              </Label>
              <Textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="What happened? What was the deciding factor? Any strategic insights?"
              />
            </div>

            {reasons.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {reasons.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={working}>Cancel</Button>
            <Button onClick={submit} disabled={working}>
              {working ? "Saving…" : "Mark as Lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

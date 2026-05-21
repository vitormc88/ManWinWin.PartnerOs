import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MailPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { OUTREACH_PLAYS, type PlayKey, type PlayContext } from "@/lib/outreach";
import { microDiscoverySuggestions } from "@/lib/outreach";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  to?: string | null;
  contactName?: string | null;
  companyName?: string | null;
  /** Full lead record to drive contextual play templates (sector, current_process, main_challenge…). */
  lead?: Record<string, any> | null;
  /** Pre-select a contextual play (set by Outreach Intelligence). */
  initialPlay?: PlayKey;
}

export function SendEmailDialog({
  open, onOpenChange, to, contactName, companyName, lead, initialPlay,
}: Props) {
  const [play, setPlay] = useState<PlayKey>(initialPlay || "intro");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open && initialPlay) setPlay(initialPlay);
  }, [open, initialPlay]);

  useEffect(() => {
    if (!open) return;
    const tpl = OUTREACH_PLAYS.find((p) => p.key === play);
    if (!tpl) return;
    const ctx: PlayContext = {
      contactName: contactName || lead?.contact_name || null,
      companyName: companyName || lead?.company_name || null,
      sector: lead?.sector || null,
      currentProcess: lead?.current_process || null,
      mainChallenge: lead?.main_challenge || null,
      microDiscoveryQuestion: lead ? microDiscoverySuggestions(lead, 1)[0] || null : null,
    };
    setSubject(tpl.subject(ctx));
    setBody(tpl.body(ctx));
  }, [play, open, contactName, companyName, lead]);

  const mailtoHref = () => {
    const parts: string[] = [];
    if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
    if (body) parts.push(`body=${encodeURIComponent(body)}`);
    const qs = parts.length ? `?${parts.join("&")}` : "";
    return `mailto:${encodeURIComponent(to || "").replace(/%40/g, "@")}${qs}`;
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    toast.success("Email copied to clipboard");
  };

  const currentPlay = OUTREACH_PLAYS.find((p) => p.key === play);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription className="text-xs">
            Plays are contextual starting points — edit before sending. Don't forget to log the activity afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Outreach play</Label>
              <Select value={play} onValueChange={(v) => setPlay(v as PlayKey)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTREACH_PLAYS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentPlay && (
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  {currentPlay.whenToUse}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input className="mt-1" value={to || ""} readOnly />
            </div>
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Body</Label>
            <Textarea className="mt-1 font-mono text-xs" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={copyAll}><Copy className="h-3.5 w-3.5" /> Copy</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button asChild onClick={() => onOpenChange(false)} disabled={!to}>
            <a href={mailtoHref()}><MailPlus className="h-3.5 w-3.5" /> Open in email</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radio, PhoneCall, MailPlus, Linkedin, Hourglass, AlertTriangle,
  Send, MessageCircleQuestion, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  momentumSignal, nextOutreach, microDiscoverySuggestions,
  recommendedPlays, OUTREACH_PLAYS, momentumRecoveryHints, type PlayKey,
} from "@/lib/outreach";
import type { AttemptLike } from "@/lib/qualification";

interface Props {
  lead: Record<string, any>;
  attempts: AttemptLike[];
  onSendEmail: (playKey?: PlayKey) => void;
  onLogActivity: () => void;
  onCreateTask?: () => void;
}


const channelIcon = {
  call: PhoneCall,
  email: MailPlus,
  linkedin: Linkedin,
  wait: Hourglass,
  decide: AlertTriangle,
} as const;

const channelLabel = {
  call: "Call",
  email: "Email",
  linkedin: "LinkedIn",
  wait: "Wait",
  decide: "Decide",
} as const;

const momentumTone = {
  positive: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
} as const;

export function OutreachIntelligence({ lead, attempts, onSendEmail, onLogActivity, onCreateTask }: Props) {
  const momentum = momentumSignal(attempts, lead.last_contact_at);
  const next = nextOutreach(attempts, lead.last_contact_at);
  const micro = microDiscoverySuggestions(lead, 3);
  const plays = recommendedPlays(lead, attempts);
  const recovery = momentumRecoveryHints(attempts);
  const ChannelIcon = channelIcon[next.channel];


  return (
    <Card className="border-primary/15 bg-card/60">
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary font-semibold">
            <Radio className="h-3 w-3" /> Outreach Intelligence
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px] h-5 px-1.5 border gap-1", momentumTone[momentum.tone])}
            title={momentum.detail}
          >
            {momentum.label}
          </Badge>
          <span className="text-[11px] text-muted-foreground truncate">{momentum.detail}</span>
        </div>

        {/* Recommended next step */}
        <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/30 px-2.5 py-1.5">
          <ChannelIcon className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Next:</span>
          <span className="text-xs font-medium">{channelLabel[next.channel]}</span>
          <span className="text-[11px] text-muted-foreground">· {next.when}</span>
          <span className="h-3 w-px bg-border" />
          <span className="text-xs text-foreground truncate flex-1 min-w-[140px]" title={next.rationale}>
            {next.framing}
          </span>
          <span className="text-[10px] text-muted-foreground italic hidden md:inline">
            {next.rationale}
          </span>
        </div>

        {/* Plays + micro-discovery — two columns on wide, stacked on narrow */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {/* Recommended plays */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
              <Send className="h-3 w-3" /> Suggested plays
            </div>
            <div className="flex flex-wrap gap-1">
              {plays.map((k) => {
                const play = OUTREACH_PLAYS.find((p) => p.key === k);
                if (!play) return null;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onSendEmail(k)}
                    title={play.whenToUse}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-border bg-background hover:bg-accent hover:text-accent-foreground transition"
                  >
                    {play.label}
                    <ArrowRight className="h-2.5 w-2.5 opacity-60" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Micro-discovery */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
              <MessageCircleQuestion className="h-3 w-3" /> Slide into outreach
            </div>
            {micro.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                Core discovery covered — focus on next step.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {micro.map((q, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground leading-snug">
                    “{q}”
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Momentum recovery hints — surface only when cadence is weakening */}
        {recovery.length > 0 && (
          <div className="rounded-md border border-dashed bg-muted/20 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Momentum recovery
            </div>
            <div className="flex flex-wrap gap-1">
              {recovery.map((h, i) => (
                <span
                  key={i}
                  className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions row */}
        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onSendEmail(plays[0])}
            disabled={!lead.email}
          >
            <MailPlus className="h-3 w-3" /> Use top play
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onLogActivity}>
            <PhoneCall className="h-3 w-3" /> Log result
          </Button>
          {onCreateTask && recovery.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCreateTask}>
              <ArrowRight className="h-3 w-3" /> Plan retry task
            </Button>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

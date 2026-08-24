/**
 * OUTREACH ON THE TARGET ACCOUNT (Academy Module 5).
 *
 * The Target Account stays the parent record during outreach. A Lead is only
 * created by an explicit action, and only after MEANINGFUL ENGAGEMENT.
 *
 * Pure, deterministic, no network. Never fabricates customer facts.
 */

export type VocabEntry = { key: string; label: string };

export const OUTREACH_CHANNELS: VocabEntry[] = [
  { key: "email", label: "Email" },
  { key: "call", label: "Phone / Call" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "meeting", label: "Meeting" },
  { key: "referral", label: "Referral" },
  { key: "other", label: "Other" },
];

export const OUTREACH_OUTCOMES: VocabEntry[] = [
  { key: "attempted_no_response", label: "Attempted / no response" },
  { key: "replied", label: "Replied / two-way engagement" },
  { key: "meeting_scheduled", label: "Meeting scheduled" },
  { key: "referral_inbound", label: "Referral / inbound request" },
  { key: "agreed_next_step", label: "Concrete next step agreed" },
  { key: "wrong_contact", label: "Wrong contact" },
  { key: "bounced", label: "Bounced / invalid" },
  { key: "do_not_contact", label: "Do not contact" },
  { key: "other", label: "Other" },
];

export function outreachLabel(vocab: VocabEntry[], key: string | null | undefined): string {
  return vocab.find((v) => v.key === key)?.label ?? (key || "—");
}

export interface OutreachActivityLike {
  id?: string;
  channel?: string | null;
  outcome?: string | null;
  notes?: string | null;
  performed_at: string;
  person_id?: string | null;
}

/** Outcomes that prove real two-way engagement. */
export const ENGAGEMENT_OUTCOMES = [
  "replied",
  "meeting_scheduled",
  "referral_inbound",
  "agreed_next_step",
] as const;

export function isEngagementOutcome(outcome: string | null | undefined): boolean {
  return !!outcome && (ENGAGEMENT_OUTCOMES as readonly string[]).includes(outcome);
}

function sortedDesc(activities: OutreachActivityLike[]): OutreachActivityLike[] {
  return [...activities].sort(
    (a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
  );
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/* --------------------------------------------------------- engagement chip */

export type EngagementLabel =
  | "No outreach yet"
  | "Attempted"
  | "In Conversation"
  | "Discovery Scheduled"
  | "Silent"
  | "Do Not Contact";

export interface EngagementChip {
  label: EngagementLabel;
  tone: "neutral" | "primary" | "success" | "warning" | "destructive";
  detail: string;
}

/** Derived only from recorded activity. Never inferred from intent or timing fields. */
export function engagementChip(activities: OutreachActivityLike[]): EngagementChip {
  const list = sortedDesc(activities);
  if (list.length === 0) {
    return { label: "No outreach yet", tone: "neutral", detail: "No outreach has been recorded." };
  }
  if (list.some((a) => a.outcome === "do_not_contact")) {
    return { label: "Do Not Contact", tone: "destructive", detail: "A do-not-contact outcome was recorded." };
  }
  if (list.some((a) => a.outcome === "meeting_scheduled")) {
    return { label: "Discovery Scheduled", tone: "success", detail: "A meeting has been scheduled." };
  }
  if (list.some((a) => isEngagementOutcome(a.outcome))) {
    const d = daysSince(list.find((a) => isEngagementOutcome(a.outcome))!.performed_at);
    if (d !== null && d > 21) {
      return { label: "Silent", tone: "warning", detail: `Last two-way exchange was ${d} days ago.` };
    }
    return { label: "In Conversation", tone: "success", detail: "Two-way engagement recorded." };
  }
  const d = daysSince(list[0].performed_at);
  if (d !== null && d > 21) {
    return { label: "Silent", tone: "warning", detail: `Last attempt was ${d} days ago with no response.` };
  }
  return { label: "Attempted", tone: "primary", detail: `${list.length} attempt(s), no response yet.` };
}

/* ----------------------------------------------------- recommended action */

export interface RecommendedAction {
  action: string;
  when: string;
  rationale: string;
}

/** Cadence suggestion derived only from what has actually been recorded. */
export function recommendedNextAction(activities: OutreachActivityLike[]): RecommendedAction {
  const list = sortedDesc(activities);
  if (list.some((a) => a.outcome === "do_not_contact")) {
    return {
      action: "Stop outreach and mark the account Deprioritised",
      when: "Now",
      rationale: "A do-not-contact outcome was recorded.",
    };
  }
  if (list.length === 0) {
    return {
      action: "Make a first touch with the primary contact",
      when: "Today",
      rationale: "No outreach recorded yet.",
    };
  }
  const last = list[0];
  const d = daysSince(last.performed_at) ?? 0;

  if (last.outcome === "meeting_scheduled") {
    return {
      action: "Prepare discovery and confirm the meeting",
      when: "Before the meeting",
      rationale: "A meeting is already scheduled — protect it.",
    };
  }
  if (isEngagementOutcome(last.outcome)) {
    return {
      action: "Reply and propose a concrete next step (discovery slot)",
      when: "Within 24h",
      rationale: "The contact engaged — convert the exchange into a next step.",
    };
  }
  if (last.outcome === "wrong_contact" || last.outcome === "bounced") {
    return {
      action: "Find another person with a conversation role",
      when: "Next working day",
      rationale: "The recorded contact route is not usable.",
    };
  }
  const failed = list.filter((a) => a.outcome === "attempted_no_response").length;
  if (failed >= 4) {
    return {
      action: "Decide: re-angle the approach or deprioritise",
      when: "Now",
      rationale: `${failed} attempts recorded with no response.`,
    };
  }
  if (failed >= 2) {
    const lastChannel = last.channel;
    const alt = lastChannel === "call" ? "email" : lastChannel === "email" ? "LinkedIn" : "a call";
    return {
      action: `Change channel — try ${alt}`,
      when: d >= 2 ? "Today" : "In 1–2 days",
      rationale: "Repeating the same channel is not landing.",
    };
  }
  return {
    action: "Follow up on the previous attempt",
    when: d >= 3 ? "Today" : "In 2–3 days",
    rationale: "One attempt rarely reaches a maintenance owner.",
  };
}

/* ----------------------------------------------------------------- plays */

export interface OutreachPlay {
  key: string;
  title: string;
  channel: string;
  body: string;
}

/**
 * Reusable framings. Placeholders are explicit — nothing about the customer is
 * invented; the user fills the brackets from real research.
 */
export function outreachPlays(activities: OutreachActivityLike[]): OutreachPlay[] {
  const chip = engagementChip(activities);
  const first: OutreachPlay = {
    key: "first_touch",
    title: "First touch — operational curiosity",
    channel: "email",
    body:
      "Hi [name],\n\nI work with maintenance teams in [industry]. I'm not sure it applies to you, so I'd rather ask than assume: how is maintenance planned and recorded at [company] today?\n\nIf it's mostly spreadsheets or a legacy tool, that's usually where the friction shows up.\n\n[your name]",
  };
  const followUp: OutreachPlay = {
    key: "follow_up",
    title: "Short follow-up — one question only",
    channel: "email",
    body:
      "Hi [name],\n\nFollowing my note — one question: who owns maintenance planning at [company] today? If it isn't you, a pointer is enough.\n\n[your name]",
  };
  const channelSwitch: OutreachPlay = {
    key: "channel_switch",
    title: "Channel switch — soft LinkedIn note",
    channel: "linkedin",
    body:
      "Hi [name] — I follow maintenance operations in [industry]. Curious how [company] handles planned vs reactive work today. Happy to share what comparable teams do, no pitch.",
  };
  const nextStep: OutreachPlay = {
    key: "next_step",
    title: "Turn a reply into an agreed next step",
    channel: "email",
    body:
      "Thanks [name] — helpful.\n\nProposal: a 30-minute call to map how maintenance runs today and where the pain concentrates. Does [option A] or [option B] work?\n\n[your name]",
  };
  const breakUp: OutreachPlay = {
    key: "break_up",
    title: "Close the loop cleanly",
    channel: "email",
    body:
      "Hi [name],\n\nI'll stop here so I don't clutter your inbox. If maintenance planning becomes a topic at [company], reply to this email and I'll pick it up.\n\n[your name]",
  };

  switch (chip.label) {
    case "No outreach yet":
      return [first];
    case "Attempted":
      return [followUp, channelSwitch];
    case "In Conversation":
    case "Discovery Scheduled":
      return [nextStep];
    case "Silent":
      return [channelSwitch, breakUp];
    case "Do Not Contact":
      return [];
  }
}

/* ------------------------------------------------- meaningful engagement */

export interface EngagementProof {
  ok: boolean;
  activity?: OutreachActivityLike;
}

/** At least one recorded activity that proves real engagement. */
export function meaningfulEngagement(activities: OutreachActivityLike[]): EngagementProof {
  const found = sortedDesc(activities).find((a) => isEngagementOutcome(a.outcome));
  return found ? { ok: true, activity: found } : { ok: false };
}

export interface ConversionChecklistItem {
  label: string;
  done: boolean;
  hint: string;
}

export interface ConversionReadiness {
  ready: boolean;
  items: ConversionChecklistItem[];
  blockers: string[];
}

/**
 * The full Target Account -> Lead readiness gate. Every condition must hold;
 * this gate is genuinely blocking because it protects entity semantics.
 */
export function conversionReadiness(input: {
  status: string;
  alreadyConverted?: boolean;
  primaryContact?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  activities: OutreachActivityLike[];
}): ConversionReadiness {
  const c = input.primaryContact;
  const hasChannel = !!c && (!!c.email?.trim() || !!c.phone?.trim());
  const engagement = meaningfulEngagement(input.activities);

  const items: ConversionChecklistItem[] = [
    {
      label: "Status is Ready for Outreach",
      done: input.status === "Ready for Outreach",
      hint: "Move the account to Ready for Outreach once the research is good enough.",
    },
    {
      label: "Primary contact with a usable channel",
      done: !!c && !!c.full_name?.trim() && hasChannel,
      hint: "Set a primary contact with at least an email or a phone number.",
    },
    {
      label: "Meaningful engagement recorded",
      done: engagement.ok,
      hint: "Log a reply, a scheduled meeting, a referral/inbound request, or an agreed next step.",
    },
    {
      label: "Not converted yet",
      done: !input.alreadyConverted,
      hint: "This account has already been converted into a Lead.",
    },
  ];

  const blockers = items.filter((i) => !i.done).map((i) => i.hint);
  return { ready: blockers.length === 0, items, blockers };
}

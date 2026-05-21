/* =====================================================================
 * OUTREACH INTELLIGENCE — lightweight operational copilot.
 *
 * Distinct from qualification.ts (which coaches DISCOVERY content).
 * This module focuses on OUTREACH EXECUTION:
 *   - what channel to use next
 *   - when to try again
 *   - which contextual "play" to send
 *   - which micro-discovery question to slide into outreach
 *   - momentum signal (operational, not a score)
 *
 * Pure deterministic rules. No AI. No auto-actions. No marketing automation.
 * The user always decides; this module only RECOMMENDS.
 * ===================================================================== */

import type { AttemptLike, TaskLike } from "./qualification";
import { attemptCounts } from "./qualification";

/* ---------- Momentum signal (operational, not a score) ---------- */

export type MomentumSignal = {
  label:
    | "No outreach yet"
    | "Conversation active"
    | "Strong engagement"
    | "Good response cadence"
    | "Awaiting reply"
    | "Momentum slowing"
    | "Follow-up overdue"
    | "Several unanswered attempts"
    | "Silent — re-engagement needed";
  tone: "neutral" | "positive" | "warning" | "destructive";
  detail: string;
};

function hoursSince(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
}

export function momentumSignal(
  attempts: AttemptLike[],
  lastContactAt?: string | null,
): MomentumSignal {
  const c = attemptCounts(attempts);
  const hSinceLast = hoursSince(lastContactAt);
  const reached = c.replied > 0;

  if (c.total === 0) {
    return {
      label: "No outreach yet",
      tone: "neutral",
      detail: "First touch will set the cadence.",
    };
  }
  if (reached && hSinceLast !== null && hSinceLast < 48) {
    return {
      label: "Conversation active",
      tone: "positive",
      detail: "Reply within the last 2 days — keep momentum.",
    };
  }
  if (reached && c.replied >= 2) {
    return {
      label: "Strong engagement",
      tone: "positive",
      detail: "Multiple two-way exchanges — push for a next step.",
    };
  }
  if (reached) {
    return {
      label: "Good response cadence",
      tone: "positive",
      detail: "Reached at least once — protect the rhythm.",
    };
  }
  if (c.failed >= 5) {
    return {
      label: "Silent — re-engagement needed",
      tone: "destructive",
      detail: "Five+ unanswered attempts. Decide nurture vs disqualify.",
    };
  }
  if (c.failed >= 3) {
    return {
      label: "Several unanswered attempts",
      tone: "warning",
      detail: "Vary channel and timing — avoid spamming the same one.",
    };
  }
  if (hSinceLast !== null && hSinceLast >= 96) {
    return {
      label: "Follow-up overdue",
      tone: "warning",
      detail: `${hSinceLast}h since last outreach — re-engage lightly.`,
    };
  }
  if (hSinceLast !== null && hSinceLast >= 48) {
    return {
      label: "Momentum slowing",
      tone: "warning",
      detail: `${hSinceLast}h of silence — a short nudge helps.`,
    };
  }
  return {
    label: "Awaiting reply",
    tone: "neutral",
    detail: "Recent attempt logged — give it a short window.",
  };
}

/* ---------- Recommended next outreach step ---------- */

export type NextOutreach = {
  channel: "call" | "email" | "linkedin" | "wait" | "decide";
  when: string; // human-readable timing hint
  framing: string; // short suggestion of message angle
  rationale: string; // one short line, operationally credible
};

export function nextOutreach(
  attempts: AttemptLike[],
  lastContactAt?: string | null,
): NextOutreach {
  const c = attemptCounts(attempts);
  const last = attempts[0]; // sorted desc
  const reached = c.replied > 0;
  const hSinceLast = hoursSince(lastContactAt);

  if (c.total === 0) {
    return {
      channel: "call",
      when: "Today, business hours",
      framing: "Short intro — ask how maintenance is handled today",
      rationale: "First touch — a quick call validates the contact fast.",
    };
  }
  if (reached) {
    return {
      channel: "email",
      when: "Within 24h of last reply",
      framing: "Recap + propose a 30-min discovery slot",
      rationale: "Keep momentum after a positive response.",
    };
  }
  if (c.failed >= 5) {
    return {
      channel: "decide",
      when: "Now",
      framing: "Break-up email then move to nurture or disqualify",
      rationale: "Repeated silence — protect the pipeline, decide outcome.",
    };
  }
  if (c.failed >= 3) {
    // alternate channel
    const lastCh = last?.channel;
    if (lastCh === "call") {
      return {
        channel: "email",
        when: "Tomorrow morning",
        framing: "Value-oriented note referencing their sector",
        rationale: "Calls aren't landing — switch to async with a clear angle.",
      };
    }
    if (lastCh === "email") {
      return {
        channel: "linkedin",
        when: "Within 1–2 days",
        framing: "Short connect note — operational curiosity, no pitch",
        rationale: "Emails not landing — try a softer channel.",
      };
    }
    return {
      channel: "call",
      when: "Different time window",
      framing: "Try afternoon if mornings failed (or vice-versa)",
      rationale: "Vary timing — same channel, different window.",
    };
  }
  if (c.total === 1) {
    return {
      channel: last?.channel === "call" ? "email" : "call",
      when: "In 1–2 days",
      framing: "Short follow-up referencing the prior attempt",
      rationale: "Second touch — change channel to widen reach.",
    };
  }
  if (hSinceLast !== null && hSinceLast >= 96) {
    return {
      channel: "email",
      when: "Today",
      framing: "Lightweight re-engagement — one operational question",
      rationale: "Silence is growing — a soft nudge keeps the door open.",
    };
  }
  return {
    channel: "wait",
    when: "24–48h",
    framing: "Let the previous touch breathe",
    rationale: "Avoid stacking attempts too tightly.",
  };
}

/* ---------- Micro-discovery suggestions ---------- */
/* Async discovery questions to weave into outreach — not full call scripts. */

const MICRO_DISCOVERY_LIBRARY: { key: string; question: string; when: (l: Record<string, any>) => boolean }[] = [
  {
    key: "current_process",
    question: "How is maintenance handled today — any system in place?",
    when: (l) => !l.current_process,
  },
  {
    key: "cmms",
    question: "Are you already using a CMMS, or mostly spreadsheets / paper?",
    when: (l) => !l.existing_system,
  },
  {
    key: "team_size",
    question: "Roughly how big is the maintenance team?",
    when: (l) => !l.maintenance_team_size,
  },
  {
    key: "centralized",
    question: "Is maintenance centralized or per site?",
    when: (l) => !l.asset_range && !l.maintenance_team_size,
  },
  {
    key: "trigger",
    question: "What pushed this topic forward internally now?",
    when: (l) => !l.timing_notes,
  },
  {
    key: "pain",
    question: "Where do you feel the operational pain the most?",
    when: (l) => !l.fit_pain_identified,
  },
  {
    key: "decision",
    question: "Besides you, who would weigh in on a tool like this?",
    when: (l) => !l.fit_decision_maker_identified,
  },
  {
    key: "visibility",
    question: "How visible are maintenance KPIs to management today?",
    when: (l) => !l.data_visibility,
  },
];

export function microDiscoverySuggestions(lead: Record<string, any>, limit = 3): string[] {
  return MICRO_DISCOVERY_LIBRARY.filter((q) => q.when(lead))
    .slice(0, limit)
    .map((q) => q.question);
}

/* ---------- Outreach Plays (contextual templates) ---------- */

export type PlayKey =
  | "intro"
  | "call_followup"
  | "value_followup"
  | "discovery_invite"
  | "soft_nurture"
  | "breakup"
  | "wrong_contact"
  | "reengagement";

export type OutreachPlay = {
  key: PlayKey;
  label: string;
  channel: "email" | "linkedin" | "call";
  whenToUse: string;
  subject: (ctx: PlayContext) => string;
  body: (ctx: PlayContext) => string;
};

export type PlayContext = {
  contactName?: string | null;
  companyName?: string | null;
  sector?: string | null;
  currentProcess?: string | null;
  mainChallenge?: string | null;
  microDiscoveryQuestion?: string | null;
};

const greet = (n?: string | null) => `Hi ${n?.split(" ")[0] || "there"},`;

const sectorRef = (sector?: string | null) =>
  sector ? ` in ${sector.toLowerCase()}` : "";

const processRef = (p?: string | null) => {
  if (!p) return "your current setup";
  if (p === "Excel" || p === "Paper") return `managing maintenance in ${p}`;
  if (p === "ERP") return "running maintenance inside an ERP";
  if (p === "Existing CMMS" || p === "Other CMMS") return "your current CMMS";
  if (p === "None") return "the lack of a structured maintenance system";
  return p;
};

export const OUTREACH_PLAYS: OutreachPlay[] = [
  {
    key: "intro",
    label: "Intro / first touch",
    channel: "email",
    whenToUse: "No prior outreach yet.",
    subject: (c) =>
      c.companyName
        ? `Quick question on maintenance at ${c.companyName}`
        : "Quick question on maintenance operations",
    body: (c) =>
      `${greet(c.contactName)}\n\nReaching out briefly — we work with teams${sectorRef(c.sector)} on making maintenance operations more structured and visible.\n\n${
        c.microDiscoveryQuestion || "How is maintenance handled today?"
      }\n\nIf the topic is relevant, 15 minutes is usually enough to know whether ManWinWin is a fit.\n\nBest,`,
  },
  {
    key: "call_followup",
    label: "After unanswered call",
    channel: "email",
    whenToUse: "Right after a call that didn't connect.",
    subject: () => "Following up after my earlier call",
    body: (c) =>
      `${greet(c.contactName)}\n\nTried reaching you earlier — sending a short note in case email is easier.\n\n${
        c.microDiscoveryQuestion || "Curious how maintenance is structured on your side today."
      }\n\nHappy to share a couple of relevant examples if useful.\n\nBest,`,
  },
  {
    key: "value_followup",
    label: "Value-oriented follow-up",
    channel: "email",
    whenToUse: "2–3 attempts, still no reply — change the angle.",
    subject: (c) =>
      c.mainChallenge
        ? `On ${String(c.mainChallenge).toLowerCase()}`
        : "On maintenance visibility",
    body: (c) =>
      `${greet(c.contactName)}\n\nNoticed I haven't caught you yet. Teams${sectorRef(c.sector)} dealing with ${
        c.mainChallenge ? String(c.mainChallenge).toLowerCase() : processRef(c.currentProcess)
      } usually look at three things first: preventive workflows, KPI visibility and technician mobility.\n\n${
        c.microDiscoveryQuestion || "Would any of those be a current priority?"
      }\n\nBest,`,
  },
  {
    key: "discovery_invite",
    label: "Discovery invite",
    channel: "email",
    whenToUse: "Contact replied — propose a structured slot.",
    subject: () => "Maintenance process — 30-min discussion?",
    body: (c) =>
      `${greet(c.contactName)}\n\nFollowing our exchange, I'd like to schedule a short discovery to map ${
        c.companyName ? `${c.companyName}'s` : "your"
      } current process, main pain points and decision flow. 30 minutes is enough.\n\nWould any of these slots work?\n - \n - \n\nBest,`,
  },
  {
    key: "soft_nurture",
    label: "Soft nurture / no pressure",
    channel: "email",
    whenToUse: "Topic interesting but not active right now.",
    subject: () => "Parking this for a better moment",
    body: (c) =>
      `${greet(c.contactName)}\n\nSounds like this isn't the right window. I'll park it on my side and circle back in a couple of months.\n\nIf anything shifts internally on maintenance operations, feel free to ping me directly.\n\nBest,`,
  },
  {
    key: "breakup",
    label: "Break-up / low-pressure close",
    channel: "email",
    whenToUse: "Repeated silence — give a graceful exit.",
    subject: () => "Closing the loop for now",
    body: (c) =>
      `${greet(c.contactName)}\n\nHaven't heard back, so I'll stop reaching out for now. No issue at all — timing matters.\n\nIf maintenance operations become a priority later, my door stays open.\n\nBest,`,
  },
  {
    key: "wrong_contact",
    label: "Referral / wrong contact",
    channel: "email",
    whenToUse: "Right company, likely wrong person.",
    subject: () => "Quick redirect?",
    body: (c) =>
      `${greet(c.contactName)}\n\nQuick one — I may have reached the wrong person. Who would typically own maintenance operations${
        c.companyName ? ` at ${c.companyName}` : ""
      }? Happy to take it from there directly.\n\nThanks,`,
  },
  {
    key: "reengagement",
    label: "Re-engagement after silence",
    channel: "email",
    whenToUse: "Picking the conversation back up later.",
    subject: () => "Picking this back up",
    body: (c) =>
      `${greet(c.contactName)}\n\nWanted to circle back — a few teams${sectorRef(c.sector)} we work with have shared interesting takeaways recently on ${
        processRef(c.currentProcess)
      }.\n\n${c.microDiscoveryQuestion || "Worth a 15-min exchange?"}\n\nBest,`,
  },
];

/* ---------- Recommend plays for the current operational state ---------- */

export function recommendedPlays(
  lead: Record<string, any>,
  attempts: AttemptLike[],
): PlayKey[] {
  const c = attemptCounts(attempts);
  const last = attempts[0];
  const reached = c.replied > 0;

  if (c.total === 0) return ["intro", "discovery_invite"];
  if (reached) return ["discovery_invite", "value_followup"];
  if (c.failed >= 5) return ["breakup", "soft_nurture", "reengagement"];
  if (c.failed >= 3) return ["value_followup", "wrong_contact", "soft_nurture"];
  if (last?.channel === "call") return ["call_followup", "value_followup"];
  return ["value_followup", "call_followup", "wrong_contact"];
}

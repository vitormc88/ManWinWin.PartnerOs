export type DealStage =
  | "Open Lead"
  | "Qualified"
  | "Demo"
  | "Proposal Sent"
  | "Advance 1"
  | "Meeting 2"
  | "Advance 2"
  | "Price Negotiation"
  | "Won"
  | "Lost";

export const PIPELINE_STAGES: { key: DealStage; label: string; color: string; probability: number }[] = [
  { key: "Open Lead", label: "Open Lead", color: "bg-slate-100 dark:bg-slate-800", probability: 5 },
  { key: "Qualified", label: "Qualified / Call Done", color: "bg-sky-50 dark:bg-sky-950", probability: 20 },
  { key: "Demo", label: "Demo", color: "bg-blue-50 dark:bg-blue-950", probability: 40 },
  { key: "Proposal Sent", label: "Proposal Sent", color: "bg-indigo-50 dark:bg-indigo-950", probability: 60 },
  { key: "Advance 1", label: "Advance 1", color: "bg-violet-50 dark:bg-violet-950", probability: 70 },
  { key: "Meeting 2", label: "Meeting 2 / Clarifications", color: "bg-amber-50 dark:bg-amber-950", probability: 75 },
  { key: "Advance 2", label: "Advance 2", color: "bg-orange-50 dark:bg-orange-950", probability: 80 },
  { key: "Price Negotiation", label: "Price Negotiation", color: "bg-rose-50 dark:bg-rose-950", probability: 90 },
  { key: "Won", label: "Won", color: "bg-emerald-50 dark:bg-emerald-950", probability: 100 },
  { key: "Lost", label: "Lost", color: "bg-red-50 dark:bg-red-950", probability: 0 },
];

export const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => s.key !== "Won" && s.key !== "Lost");

export function getStageProbability(stage: string): number {
  return PIPELINE_STAGES.find(s => s.key === stage)?.probability ?? 0;
}

/** Stuck = no stage change for 30+ days */
export const STUCK_THRESHOLD_DAYS = 30;

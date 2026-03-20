import { partners } from "./mock-data";

// ─── Onboarding ───
export type OnboardingStage =
  | "Interested"
  | "Qualified"
  | "Agreement Signed"
  | "Onboarding Started"
  | "Training in Progress"
  | "Certified"
  | "First Deal Registered"
  | "First Deal Won"
  | "Active Partner";

export const onboardingStages: OnboardingStage[] = [
  "Interested",
  "Qualified",
  "Agreement Signed",
  "Onboarding Started",
  "Training in Progress",
  "Certified",
  "First Deal Registered",
  "First Deal Won",
  "Active Partner",
];

export interface ChecklistItem {
  id: string;
  category: "Commercial" | "Technical" | "Sales Activation" | "Legal";
  taskName: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface PartnerOnboarding {
  id: string;
  partnerId: string;
  partnerName: string;
  stage: OnboardingStage;
  progressPct: number;
  assignedManager: string;
  startedAt: string;
  checklist: ChecklistItem[];
}

const defaultChecklist = (completed: number[]): ChecklistItem[] => {
  const items: Omit<ChecklistItem, "id" | "isCompleted" | "completedAt">[] = [
    { category: "Commercial", taskName: "Product training" },
    { category: "Commercial", taskName: "Pitch training" },
    { category: "Commercial", taskName: "Pricing understanding" },
    { category: "Technical", taskName: "Platform training" },
    { category: "Technical", taskName: "Demo environment setup" },
    { category: "Technical", taskName: "Implementation basics" },
    { category: "Sales Activation", taskName: "First leads identified" },
    { category: "Sales Activation", taskName: "First deal registered" },
    { category: "Sales Activation", taskName: "First demo completed" },
    { category: "Legal", taskName: "NDA signed" },
    { category: "Legal", taskName: "Partner agreement signed" },
  ];
  return items.map((item, i) => ({
    ...item,
    id: `chk-${i}`,
    isCompleted: completed.includes(i),
    completedAt: completed.includes(i) ? "2026-03-10" : undefined,
  }));
};

export const mockOnboarding: PartnerOnboarding[] = [
  {
    id: "ob-1",
    partnerId: "4",
    partnerName: "Gulf Tech Services LLC",
    stage: "Onboarding Started",
    progressPct: 36,
    assignedManager: "Sofia Lindgren",
    startedAt: "2025-11-20",
    checklist: defaultChecklist([0, 1, 9, 10]),
  },
  {
    id: "ob-2",
    partnerId: "6",
    partnerName: "Afrique Maintenance SARL",
    stage: "Training in Progress",
    progressPct: 55,
    assignedManager: "Sofia Lindgren",
    startedAt: "2024-02-14",
    checklist: defaultChecklist([0, 1, 2, 3, 9, 10]),
  },
  {
    id: "ob-3",
    partnerId: "3",
    partnerName: "LATAM Industrial Group",
    stage: "First Deal Registered",
    progressPct: 82,
    assignedManager: "Carlos Mendes",
    startedAt: "2023-01-10",
    checklist: defaultChecklist([0, 1, 2, 3, 4, 5, 6, 9, 10]),
  },
  {
    id: "ob-4",
    partnerId: "1",
    partnerName: "Iberian Solutions Lda",
    stage: "Active Partner",
    progressPct: 100,
    assignedManager: "Carlos Mendes",
    startedAt: "2021-03-15",
    checklist: defaultChecklist([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  },
];

// ─── Certifications ───
export interface Certification {
  id: string;
  partnerId: string;
  partnerName: string;
  userName: string;
  userEmail: string;
  level: 1 | 2 | 3;
  levelName: string;
  certName: string;
  status: "In Progress" | "Completed" | "Expired";
  score?: number;
  awardedAt?: string;
  expiresAt?: string;
}

export const certLevelNames: Record<number, string> = {
  1: "Sales Certified",
  2: "Technical Certified",
  3: "Advanced / Strategic",
};

export const mockCertifications: Certification[] = [
  { id: "cert-1", partnerId: "1", partnerName: "Iberian Solutions Lda", userName: "João Ferreira", userEmail: "joao@iberian.pt", level: 3, levelName: "Advanced / Strategic", certName: "Advanced Implementation", status: "Completed", score: 94, awardedAt: "2025-09-12", expiresAt: "2027-09-12" },
  { id: "cert-2", partnerId: "1", partnerName: "Iberian Solutions Lda", userName: "Ana Costa", userEmail: "ana@iberian.pt", level: 2, levelName: "Technical Certified", certName: "Technical Configuration", status: "Completed", score: 88, awardedAt: "2025-06-22", expiresAt: "2027-06-22" },
  { id: "cert-3", partnerId: "2", partnerName: "Nordic Maintenance AB", userName: "Erik Johansson", userEmail: "erik@nordicm.se", level: 1, levelName: "Sales Certified", certName: "Sales Fundamentals", status: "Completed", score: 76, awardedAt: "2025-11-05", expiresAt: "2027-11-05" },
  { id: "cert-4", partnerId: "3", partnerName: "LATAM Industrial Group", userName: "Ricardo Silva", userEmail: "ricardo@latamig.com.br", level: 1, levelName: "Sales Certified", certName: "Sales Fundamentals", status: "In Progress", score: undefined },
  { id: "cert-5", partnerId: "8", partnerName: "Asia Pacific CMMS Pte", userName: "Wei Lin Tan", userEmail: "weilin@apcmms.sg", level: 2, levelName: "Technical Certified", certName: "Technical Configuration", status: "Completed", score: 91, awardedAt: "2025-08-18", expiresAt: "2027-08-18" },
  { id: "cert-6", partnerId: "8", partnerName: "Asia Pacific CMMS Pte", userName: "Priya Nair", userEmail: "priya@apcmms.sg", level: 1, levelName: "Sales Certified", certName: "Sales Fundamentals", status: "Completed", score: 82, awardedAt: "2025-10-02", expiresAt: "2027-10-02" },
  { id: "cert-7", partnerId: "6", partnerName: "Afrique Maintenance SARL", userName: "Youssef Benhaddou", userEmail: "youssef@afriquem.ma", level: 1, levelName: "Sales Certified", certName: "Sales Fundamentals", status: "In Progress" },
  { id: "cert-8", partnerId: "5", partnerName: "Midwest Facilities Corp", userName: "Sarah Mitchell", userEmail: "sarah@midwestfc.com", level: 1, levelName: "Sales Certified", certName: "Sales Fundamentals", status: "Expired", score: 65, awardedAt: "2023-04-10", expiresAt: "2025-04-10" },
];

// ─── Tiers ───
export interface PartnerTier {
  partnerId: string;
  partnerName: string;
  country: string;
  currentTier: number;
  tierName: string;
  suggestedTier: number;
  annualRevenue: number;
  totalDeals: number;
  winRate: number;
  certifiedUsers: number;
  hqValidated: boolean;
}

export const tierNames: Record<number, string> = {
  1: "Registered Partner",
  2: "Accredited Reseller",
  3: "Accredited Implementer",
  4: "Strategic Partner",
};

export const tierCriteria: Record<number, { revenue: number; deals: number; certUsers: number; winRate: number }> = {
  1: { revenue: 0, deals: 0, certUsers: 0, winRate: 0 },
  2: { revenue: 25000, deals: 3, certUsers: 1, winRate: 20 },
  3: { revenue: 75000, deals: 8, certUsers: 2, winRate: 35 },
  4: { revenue: 150000, deals: 15, certUsers: 3, winRate: 50 },
};

function suggestTier(rev: number, deals: number, certUsers: number, winRate: number): number {
  if (rev >= tierCriteria[4].revenue && deals >= tierCriteria[4].deals && certUsers >= tierCriteria[4].certUsers) return 4;
  if (rev >= tierCriteria[3].revenue && deals >= tierCriteria[3].deals && certUsers >= tierCriteria[3].certUsers) return 3;
  if (rev >= tierCriteria[2].revenue && deals >= tierCriteria[2].deals) return 2;
  return 1;
}

export const mockTiers: PartnerTier[] = partners.map((p) => {
  const deals = Math.round(p.clients * 1.2);
  const winRate = p.clients > 0 ? Math.round((p.clients / (p.clients + 3)) * 100) : 0;
  const certs = p.id === "1" ? 2 : p.id === "8" ? 2 : p.id === "2" ? 1 : p.id === "6" ? 0 : 0;
  const currentTier = p.level === "Implementer" ? 3 : p.level === "Reseller" ? 2 : 1;
  const suggested = suggestTier(p.revenue, deals, certs, winRate);
  return {
    partnerId: p.id,
    partnerName: p.company,
    country: p.country,
    currentTier,
    tierName: tierNames[currentTier],
    suggestedTier: suggested,
    annualRevenue: p.revenue,
    totalDeals: deals,
    winRate,
    certifiedUsers: certs,
    hqValidated: currentTier === suggested,
  };
});

// ─── Health Scores ───
export interface PartnerHealthScore {
  partnerId: string;
  partnerName: string;
  country: string;
  overallScore: number;
  revenueScore: number;
  activityScore: number;
  pipelineScore: number;
  conversionScore: number;
  renewalScore: number;
  certificationScore: number;
  trend: "improving" | "stable" | "declining";
  riskLevel: "green" | "yellow" | "red";
}

export const mockHealthScores: PartnerHealthScore[] = partners.map((p) => {
  const revScore = Math.min(100, Math.round((p.revenue / 200000) * 100));
  const actScore = p.engagementScore;
  const pipScore = Math.min(100, Math.round((p.pipeline / 150000) * 100));
  const convScore = p.clients > 0 ? Math.min(100, Math.round((p.clients / 20) * 100)) : 0;
  const renScore = p.status === "Active" ? 70 + Math.round(Math.random() * 30) : 20;
  const certScore = p.id === "1" ? 95 : p.id === "8" ? 90 : p.id === "2" ? 60 : p.id === "3" ? 40 : 10;

  const overall = Math.round(
    revScore * 0.3 + actScore * 0.2 + pipScore * 0.15 + convScore * 0.15 + renScore * 0.1 + certScore * 0.1
  );

  const trend: "improving" | "stable" | "declining" =
    p.engagementScore > 70 ? "improving" : p.engagementScore > 40 ? "stable" : "declining";
  const riskLevel: "green" | "yellow" | "red" =
    overall >= 60 ? "green" : overall >= 35 ? "yellow" : "red";

  return {
    partnerId: p.id,
    partnerName: p.company,
    country: p.country,
    overallScore: overall,
    revenueScore: revScore,
    activityScore: actScore,
    pipelineScore: pipScore,
    conversionScore: convScore,
    renewalScore: renScore,
    certificationScore: certScore,
    trend,
    riskLevel,
  };
});

// ─── Gamification ───
export interface Badge {
  id: string;
  partnerId: string;
  name: string;
  icon: string;
  description: string;
  awardedAt: string;
}

export const mockBadges: Badge[] = [
  { id: "b1", partnerId: "1", name: "First Deal Closed", icon: "🎯", description: "Closed first deal successfully", awardedAt: "2021-06-20" },
  { id: "b2", partnerId: "1", name: "100K Revenue", icon: "💎", description: "Crossed €100K lifetime revenue", awardedAt: "2023-02-14" },
  { id: "b3", partnerId: "1", name: "Top Performer Q4", icon: "🏆", description: "Highest revenue in Q4 2025", awardedAt: "2026-01-05" },
  { id: "b4", partnerId: "8", name: "First Deal Closed", icon: "🎯", description: "Closed first deal successfully", awardedAt: "2023-09-18" },
  { id: "b5", partnerId: "8", name: "100K Revenue", icon: "💎", description: "Crossed €100K lifetime revenue", awardedAt: "2025-03-10" },
  { id: "b6", partnerId: "8", name: "Fastest Growing", icon: "🚀", description: "Highest growth rate this year", awardedAt: "2026-01-05" },
  { id: "b7", partnerId: "2", name: "First Deal Closed", icon: "🎯", description: "Closed first deal successfully", awardedAt: "2022-11-30" },
  { id: "b8", partnerId: "3", name: "First Deal Closed", icon: "🎯", description: "Closed first deal successfully", awardedAt: "2023-08-05" },
  { id: "b9", partnerId: "6", name: "Rising Star", icon: "⭐", description: "Promising growth trajectory", awardedAt: "2025-12-18" },
];

export interface Mission {
  id: string;
  partnerId: string;
  partnerName: string;
  name: string;
  description: string;
  targetValue: number;
  currentValue: number;
  missionType: "monthly" | "quarterly";
  status: "Active" | "Completed" | "Failed";
  endsAt: string;
}

export const mockMissions: Mission[] = [
  { id: "m1", partnerId: "1", partnerName: "Iberian Solutions Lda", name: "Register 5 Deals", description: "Register 5 new deals this quarter", targetValue: 5, currentValue: 3, missionType: "quarterly", status: "Active", endsAt: "2026-03-31" },
  { id: "m2", partnerId: "1", partnerName: "Iberian Solutions Lda", name: "Close 3 Deals", description: "Close 3 deals this quarter", targetValue: 3, currentValue: 2, missionType: "quarterly", status: "Active", endsAt: "2026-03-31" },
  { id: "m3", partnerId: "2", partnerName: "Nordic Maintenance AB", name: "Complete Certification", description: "Get at least one team member Level 2 certified", targetValue: 1, currentValue: 0, missionType: "quarterly", status: "Active", endsAt: "2026-03-31" },
  { id: "m4", partnerId: "8", partnerName: "Asia Pacific CMMS Pte", name: "Register 5 Deals", description: "Register 5 new deals this quarter", targetValue: 5, currentValue: 5, missionType: "quarterly", status: "Completed", endsAt: "2026-03-31" },
  { id: "m5", partnerId: "3", partnerName: "LATAM Industrial Group", name: "First Demo", description: "Complete first product demo to a prospect", targetValue: 1, currentValue: 1, missionType: "monthly", status: "Completed", endsAt: "2026-03-31" },
  { id: "m6", partnerId: "6", partnerName: "Afrique Maintenance SARL", name: "Register 3 Deals", description: "Register 3 new deals this quarter", targetValue: 3, currentValue: 1, missionType: "quarterly", status: "Active", endsAt: "2026-03-31" },
];

// ─── Leaderboard helpers ───
export function getLeaderboard(metric: "revenue" | "deals" | "pipeline" | "activity") {
  return [...partners]
    .map((p) => ({
      id: p.id,
      name: p.company,
      country: p.country,
      value:
        metric === "revenue" ? p.revenue
        : metric === "deals" ? Math.round(p.clients * 1.2)
        : metric === "pipeline" ? p.pipeline
        : p.engagementScore,
    }))
    .sort((a, b) => b.value - a.value);
}

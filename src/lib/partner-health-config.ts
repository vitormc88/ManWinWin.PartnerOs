// Centralized configuration for the Partner Health Engine (v2.1).
// Values mirror the calibrated SQL in the latest `partner_metrics` view migration.
// A future Settings UI can read/write these without touching the scoring logic.
// IMPORTANT: changing values here does NOT change the SQL view. Keep both in sync
// when calibrating, or migrate the view to read from a config table.

export type HealthDimension = "relationship" | "momentum" | "engagement";
export type FactorImpact = "low" | "medium" | "high";
export type FactorType = "positive" | "negative";
export type PartnerMaturity = "new" | "onboarding" | "active" | "mature" | "dormant";

export interface HealthFactor {
  type: FactorType;
  dimension: HealthDimension;
  impact: FactorImpact;
  label: string;
}

export interface PartnerHealthConfig {
  weights: Record<HealthDimension, number>;
  thresholds: {
    healthy: number;      // >= healthy → Healthy band
    moderate: number;     // >= moderate → Moderate band
  };
  meetingOverdueDays: {
    mild: number;         // 1..mild = small penalty
    medium: number;       // mild+1..medium = medium penalty
                          // > medium = strong penalty
  };
  maturity: {
    matureMinClients: number;
    matureMinRenewals: number;
    dormantInactivityDays: number;
  };
  // Maturity-aware momentum caps (applied AFTER raw scoring).
  momentumCaps: Record<PartnerMaturity, { min: number; max: number }>;
  // Friendly labels (UI-ready).
  maturityLabels: Record<PartnerMaturity, string>;
  dimensionLabels: Record<HealthDimension, string>;
}

export const PARTNER_HEALTH_CONFIG: PartnerHealthConfig = {
  weights: {
    relationship: 0.40,
    momentum:     0.35,
    engagement:   0.25,
  },
  thresholds: {
    healthy: 80,
    moderate: 40,
  },
  meetingOverdueDays: {
    mild: 30,
    medium: 60,
  },
  maturity: {
    matureMinClients: 1,
    matureMinRenewals: 1,
    dormantInactivityDays: 180,
  },
  momentumCaps: {
    new:        { min: 25, max: 45 },
    onboarding: { min: 30, max: 55 },
    active:     { min: 0,  max: 100 },
    mature:     { min: 0,  max: 100 },
    dormant:    { min: 0,  max: 40 },
  },
  maturityLabels: {
    new:        "New partner",
    onboarding: "Onboarding",
    active:     "Active",
    mature:     "Mature",
    dormant:    "Dormant",
  },
  dimensionLabels: {
    relationship: "Relationship Health",
    momentum:     "Business Momentum",
    engagement:   "Operational Engagement",
  },
};

export function healthBand(score: number): "healthy" | "moderate" | "at_risk" {
  if (score >= PARTNER_HEALTH_CONFIG.thresholds.healthy) return "healthy";
  if (score >= PARTNER_HEALTH_CONFIG.thresholds.moderate) return "moderate";
  return "at_risk";
}

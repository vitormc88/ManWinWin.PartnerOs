/**
 * ManWinWin license evolution rules (Sprint I.7).
 *
 * Controls which commercial actions and license upgrade targets are valid
 * for an existing customer, based on the current license family/variant.
 * These rules are UI-only — they do not affect pricing, calculations or
 * proposal generation logic.
 */

export type LicenseFamily = "Professional" | "Business" | null;
export type LicenseId =
  | "professional_1"
  | "professional_2"
  | "professional_3"
  | "business_useit"
  | "business_keepit";

export interface LicenseOption {
  id: LicenseId;
  family: "Professional" | "Business";
  variant: "I" | "II" | "III" | "UseIT" | "KeepIT";
  label: string;
  plan?: 1 | 2 | 3;
}

export const LICENSE_ORDER: LicenseOption[] = [
  { id: "professional_1",  family: "Professional", variant: "I",   label: "Professional I",   plan: 1 },
  { id: "professional_2",  family: "Professional", variant: "II",  label: "Professional II",  plan: 2 },
  { id: "professional_3",  family: "Professional", variant: "III", label: "Professional III", plan: 3 },
  { id: "business_useit",  family: "Business",     variant: "UseIT",  label: "Business UseIT"  },
  { id: "business_keepit", family: "Business",     variant: "KeepIT", label: "Business KeepIT" },
];

export function resolveLicenseId(
  family: LicenseFamily,
  variant: string | null | undefined,
): LicenseId | null {
  if (!family) return null;
  const v = (variant || "").toString().toUpperCase();
  if (family === "Professional") {
    if (v === "I" || v === "1") return "professional_1";
    if (v === "II" || v === "2") return "professional_2";
    if (v === "III" || v === "3") return "professional_3";
  }
  if (family === "Business") {
    if (/USEIT/.test(v)) return "business_useit";
    if (/KEEPIT/.test(v)) return "business_keepit";
  }
  return null;
}

/**
 * Valid upgrade targets. A customer can jump forward but never downgrade.
 * Business UseIT and Business KeepIT are mutually exclusive; from either
 * Business tier there are no valid license upgrades.
 */
export function validUpgradeTargets(current: LicenseId | null): LicenseOption[] {
  if (!current) return LICENSE_ORDER.slice(); // unknown → offer all
  const idx = LICENSE_ORDER.findIndex((l) => l.id === current);
  if (idx < 0) return [];
  const curr = LICENSE_ORDER[idx];
  if (curr.family === "Business") return []; // no upgrade path across Business models
  return LICENSE_ORDER.slice(idx + 1);
}

export function canUpgradeLicense(current: LicenseId | null): boolean {
  return validUpgradeTargets(current).length > 0;
}

/**
 * Commercial actions available in the New Proposal dropdown.
 * Business customers cannot upgrade license; Professional customers do not
 * see Change Hosting (SaaS/On-Premise switch is a Business-model concern).
 */
export type CommercialActionId =
  | "upgrade_license"
  | "add_modules"
  | "add_plugins"
  | "add_users"
  | "change_hosting"
  | "renew_agreement"
  | "other";

export function availableCommercialActions(current: LicenseId | null): CommercialActionId[] {
  const curr = current ? LICENSE_ORDER.find((l) => l.id === current) : null;
  if (!curr) {
    // Unknown license → show the full set so the AM can still act.
    return [
      "upgrade_license",
      "add_modules",
      "add_plugins",
      "add_users",
      "renew_agreement",
      "other",
    ];
  }
  if (curr.family === "Business") {
    return [
      "add_modules",
      "add_plugins",
      "add_users",
      "change_hosting",
      "renew_agreement",
      "other",
    ];
  }
  // Professional: Requests is a standalone add-on; Stock/Purchase remain
  // bundled by level and the addition editor directs those to an upgrade.
  return [
    "upgrade_license",
    "add_modules",
    "add_plugins",
    "add_users",
    "renew_agreement",
    "other",
  ];
}

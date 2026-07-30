/**
 * Canonical ManWinWin licensing vocabulary.
 *
 * Single source of truth for product family / variant, license model,
 * deployment (hosting) type and version across the client workspace.
 *
 * Design rules:
 * - Reads are backwards compatible: legacy / imported values are normalized when
 *   they can be recognised, and otherwise kept visible and editable as "Legacy".
 * - Writes should always use canonical values (see `isCanonicalProduct`).
 * - Nothing is ever silently discarded: a license with an unknown product is
 *   still a valid license.
 */

export type LicenseFamily = "Business" | "Professional";
export type DeploymentType = "SaaS" | "On-Premise";

export const DEFAULT_LICENSE_VERSION = "7.2.6.0";

export const LICENSE_FAMILIES: { value: LicenseFamily; label: string }[] = [
  { value: "Business", label: "Business" },
  { value: "Professional", label: "Professional" },
];

export const VARIANT_OPTIONS: Record<LicenseFamily, { value: string; label: string }[]> = {
  Business: [
    { value: "Business UseIT", label: "UseIT" },
    { value: "Business KeepIT", label: "KeepIT" },
  ],
  Professional: [
    { value: "Professional 1", label: "Professional 1" },
    { value: "Professional 2", label: "Professional 2" },
    { value: "Professional 3", label: "Professional 3" },
  ],
};

export const CANONICAL_PRODUCTS: string[] = [
  ...VARIANT_OPTIONS.Business.map((o) => o.value),
  ...VARIANT_OPTIONS.Professional.map((o) => o.value),
];

/** Commercial license model, derived from the product variant. */
export const LICENSE_MODELS = [
  { value: "USE-IT", label: "USE-IT" },
  { value: "KEEP-IT", label: "KEEP-IT" },
  { value: "PROFESSIONAL", label: "PROFESSIONAL" },
] as const;

export const DEPLOYMENT_OPTIONS: { value: DeploymentType; label: string; hint: string }[] = [
  { value: "SaaS", label: "SaaS", hint: "Hosted on ManWinWin servers" },
  { value: "On-Premise", label: "On-Premise", hint: "Installed on customer infrastructure" },
];

const key = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Historical / imported product labels mapped to the canonical vocabulary. */
const PRODUCT_ALIASES: Record<string, string> = {
  businesskeepit: "Business KeepIT",
  keepit: "Business KeepIT",
  manwinwinbusinesskeepit: "Business KeepIT",
  mwwbusinesskeepit: "Business KeepIT",
  businessuseit: "Business UseIT",
  useit: "Business UseIT",
  manwinwinbusinessuseit: "Business UseIT",
  mwwbusinessuseit: "Business UseIT",
  professional1: "Professional 1",
  professionali: "Professional 1",
  prof1: "Professional 1",
  professional2: "Professional 2",
  professionalii: "Professional 2",
  prof2: "Professional 2",
  professional3: "Professional 3",
  professionaliii: "Professional 3",
  prof3: "Professional 3",
};

/** Historical / imported deployment labels mapped to the canonical vocabulary. */
const DEPLOYMENT_ALIASES: Record<string, DeploymentType> = {
  saas: "SaaS",
  saasdireto: "SaaS",
  saasdirect: "SaaS",
  cloud: "SaaS",
  hosted: "SaaS",
  hosting: "SaaS",
  mwwservers: "SaaS",
  onpremise: "On-Premise",
  onpremises: "On-Premise",
  onprem: "On-Premise",
  local: "On-Premise",
  localserver: "On-Premise",
  clientserver: "On-Premise",
  instalacaolocal: "On-Premise",
};

export interface NormalizedProduct {
  /** Raw stored value, unchanged. */
  raw: string;
  /** Canonical product value when recognised, otherwise the raw value. */
  value: string;
  family: LicenseFamily | "";
  variant: string;
  /** Short human label ("KeepIT", "Professional 2", or the raw legacy value). */
  label: string;
  /** Full label including family ("Business KeepIT"). */
  fullLabel: string;
  /** True when the stored value is not a canonical product. */
  isLegacy: boolean;
  /** True when the stored value could not be mapped at all. */
  isUnmapped: boolean;
}

export function normalizeLicenseProduct(product: string | null | undefined): NormalizedProduct {
  const raw = (product || "").trim();
  if (!raw) {
    return { raw: "", value: "", family: "", variant: "", label: "", fullLabel: "", isLegacy: false, isUnmapped: true };
  }

  const canonical = CANONICAL_PRODUCTS.find((p) => key(p) === key(raw)) || PRODUCT_ALIASES[key(raw)];

  if (canonical) {
    const family: LicenseFamily = canonical.startsWith("Business") ? "Business" : "Professional";
    const label =
      VARIANT_OPTIONS[family].find((o) => o.value === canonical)?.label || canonical;
    return {
      raw,
      value: canonical,
      family,
      variant: canonical,
      label,
      fullLabel: canonical,
      isLegacy: canonical !== raw,
      isUnmapped: false,
    };
  }

  // Unknown value — keep it fully visible and editable.
  return {
    raw,
    value: raw,
    family: "",
    variant: raw,
    label: raw,
    fullLabel: raw,
    isLegacy: true,
    isUnmapped: true,
  };
}

export function isCanonicalProduct(product: string | null | undefined): boolean {
  return !!product && CANONICAL_PRODUCTS.includes(product.trim());
}

/** Backwards-compatible alias kept for existing call sites. */
export function getVariantLabel(variant: string | null | undefined): string {
  return normalizeLicenseProduct(variant).label;
}

export interface NormalizedDeployment {
  raw: string;
  value: DeploymentType | "";
  label: string;
  isLegacy: boolean;
  isUnmapped: boolean;
}

export function normalizeDeployment(...candidates: (string | null | undefined)[]): NormalizedDeployment {
  const raw = (candidates.find((c) => c && c.trim()) || "").trim();
  if (!raw) return { raw: "", value: "", label: "—", isLegacy: false, isUnmapped: true };
  const mapped = DEPLOYMENT_ALIASES[key(raw)];
  if (mapped) {
    return { raw, value: mapped, label: mapped, isLegacy: mapped !== raw, isUnmapped: false };
  }
  return { raw, value: "", label: raw, isLegacy: true, isUnmapped: true };
}

/** Canonical license model for a product variant (falls back to the stored value). */
export function normalizeLicenseModel(
  product: string | null | undefined,
  storedModel?: string | null
): string {
  const { value } = normalizeLicenseProduct(product);
  if (value === "Business KeepIT") return "KEEP-IT";
  if (value === "Business UseIT") return "USE-IT";
  if (value.startsWith("Professional")) return "PROFESSIONAL";
  return (storedModel || "").trim();
}

/** Version is free text (LIC "Versão Nº" is unreliable) — only trimmed/normalized. */
export function normalizeVersion(version: string | null | undefined): string {
  return (version || "").trim();
}

export interface LicenseVocabularyView {
  product: NormalizedProduct;
  deployment: NormalizedDeployment;
  licenseModel: string;
  version: string;
  needsReview: boolean;
}

/**
 * One-call read helper for any license-like row.
 * `deployment_type` wins over the legacy `database_type` column.
 */
export function readLicenseVocabulary(
  lic:
    | {
        product?: string | null;
        deployment_type?: string | null;
        database_type?: string | null;
        license_model?: string | null;
        version?: string | null;
      }
    | null
    | undefined,
  fallbackDeployment?: string | null
): LicenseVocabularyView {
  const product = normalizeLicenseProduct(lic?.product);
  const deployment = normalizeDeployment(lic?.deployment_type, lic?.database_type, fallbackDeployment);
  return {
    product,
    deployment,
    licenseModel: normalizeLicenseModel(lic?.product, lic?.license_model),
    version: normalizeVersion(lic?.version),
    needsReview: product.isUnmapped || deployment.isUnmapped,
  };
}

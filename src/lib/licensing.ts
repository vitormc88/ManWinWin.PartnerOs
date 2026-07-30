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
 * - `deployment_type` (hosting: SaaS / On-Premise) and `database_type`
 *   (engine: Microsoft SQL Server, PostgreSQL, ...) are DIFFERENT concepts and
 *   are never copied into each other.
 */

export type LicenseFamily = "Business" | "Professional";
export type DeploymentType = "SaaS" | "On-Premise";

/**
 * Suggested current version. DISPLAY / PLACEHOLDER ONLY — never persisted
 * automatically when the user leaves the version field empty.
 */
export const SUGGESTED_LICENSE_VERSION = "7.2.6.0";

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
  manwinwinkeepit: "Business KeepIT",
  mwwbusinesskeepit: "Business KeepIT",
  businessuseit: "Business UseIT",
  useit: "Business UseIT",
  manwinwinbusinessuseit: "Business UseIT",
  manwinwinuseit: "Business UseIT",
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

/**
 * Generic product labels that carry no variant information on their own.
 * They must NOT be guessed — resolution requires `license_model` / `edition`.
 */
const GENERIC_PRODUCTS = new Set(["manwinwin", "mww", "manwinwinweb", "manwinwinsoftware"]);

/** Canonical license models keyed by their normalized form. */
const LICENSE_MODEL_ALIASES: Record<string, string> = {
  keepit: "KEEP-IT",
  keep: "KEEP-IT",
  useit: "USE-IT",
  use: "USE-IT",
  professional: "PROFESSIONAL",
  prof: "PROFESSIONAL",
};

/** license_model -> canonical product, used only for generic product labels. */
const MODEL_TO_PRODUCT: Record<string, string> = {
  "KEEP-IT": "Business KeepIT",
  "USE-IT": "Business UseIT",
};

/**
 * Historical / imported DEPLOYMENT (hosting) labels mapped to the canonical
 * vocabulary. Database engines are deliberately absent — see
 * `DATABASE_ENGINE_HINTS`.
 */
const DEPLOYMENT_ALIASES: Record<string, DeploymentType> = {
  saas: "SaaS",
  saasdireto: "SaaS",
  saasdirecto: "SaaS",
  saasdirect: "SaaS",
  cloud: "SaaS",
  cloudsaas: "SaaS",
  saascloud: "SaaS",
  cloudhosted: "SaaS",
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

/**
 * Tokens that identify a value as a DATABASE ENGINE, never a deployment.
 * Used to reject `database_type` legacy fallbacks such as "Microsoft SQL Server".
 */
const DATABASE_ENGINE_HINTS = [
  "sqlserver",
  "mssql",
  "microsoftsql",
  "postgres",
  "postgresql",
  "oracle",
  "mysql",
  "mariadb",
  "sqlite",
  "db2",
  "firebird",
  "sqlexpress",
  "access",
];

/** True when a value looks like a database engine rather than a hosting model. */
export function looksLikeDatabaseEngine(value: string | null | undefined): boolean {
  const k = key(value || "");
  if (!k) return false;
  return DATABASE_ENGINE_HINTS.some((hint) => k.includes(hint));
}

/** True when a value is recognisable as a deployment/hosting label. */
export function looksLikeDeployment(value: string | null | undefined): boolean {
  const k = key(value || "");
  if (!k) return false;
  if (looksLikeDatabaseEngine(value)) return false;
  return !!DEPLOYMENT_ALIASES[k];
}

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

const emptyProduct: NormalizedProduct = {
  raw: "",
  value: "",
  family: "",
  variant: "",
  label: "",
  fullLabel: "",
  isLegacy: false,
  isUnmapped: true,
};

function canonicalProduct(raw: string): string | undefined {
  return CANONICAL_PRODUCTS.find((p) => key(p) === key(raw)) || PRODUCT_ALIASES[key(raw)];
}

function buildCanonical(raw: string, canonical: string): NormalizedProduct {
  const family: LicenseFamily = canonical.startsWith("Business") ? "Business" : "Professional";
  const label = VARIANT_OPTIONS[family].find((o) => o.value === canonical)?.label || canonical;
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

/** Canonicalises a stored license_model string ("KEEP-IT", "USE-IT", ...). */
export function canonicalLicenseModel(model: string | null | undefined): string {
  const raw = (model || "").trim();
  if (!raw) return "";
  return LICENSE_MODEL_ALIASES[key(raw)] || raw;
}

export interface ProductContext {
  /** Stored commercial model, e.g. "KEEP-IT". */
  licenseModel?: string | null;
  /** Stored edition / variant column, e.g. "KeepIT" or "Professional 2". */
  edition?: string | null;
}

/**
 * Normalizes the product using the combined license fields.
 *
 * A generic `product` such as "ManWinWin" is only resolved when the license
 * model (or edition) disambiguates it. Unknown combinations stay visible as
 * Legacy / Unmapped and are never guessed.
 */
export function normalizeLicenseProduct(
  product: string | null | undefined,
  context: ProductContext = {}
): NormalizedProduct {
  const raw = (product || "").trim();
  const editionRaw = (context.edition || "").trim();
  const model = canonicalLicenseModel(context.licenseModel);

  // 1. Direct canonical / alias match on the product column.
  const direct = raw ? canonicalProduct(raw) : undefined;
  if (direct) return buildCanonical(raw, direct);

  const isGeneric = !raw || GENERIC_PRODUCTS.has(key(raw));

  if (isGeneric) {
    // 2. Generic product: resolve via edition, then via license model.
    const fromEdition = editionRaw ? canonicalProduct(editionRaw) : undefined;
    if (fromEdition) return { ...buildCanonical(raw || editionRaw, fromEdition), raw };

    const fromModel = MODEL_TO_PRODUCT[model];
    if (fromModel) return { ...buildCanonical(raw, fromModel), raw };
  }

  if (!raw) return emptyProduct;

  // 3. Unknown value — keep it fully visible and editable, never guessed.
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

/**
 * Normalizes hosting/deployment from the given candidates, in priority order.
 *
 * Candidates that look like a database engine (e.g. "Microsoft SQL Server")
 * are ignored entirely: they are never a deployment.
 */
export function normalizeDeployment(...candidates: (string | null | undefined)[]): NormalizedDeployment {
  const usable = candidates
    .map((c) => (c || "").trim())
    .filter((c) => c.length > 0 && !looksLikeDatabaseEngine(c));

  const raw = usable[0] || "";
  if (!raw) return { raw: "", value: "", label: "—", isLegacy: false, isUnmapped: true };

  const mapped = DEPLOYMENT_ALIASES[key(raw)];
  if (mapped) {
    return { raw, value: mapped, label: mapped, isLegacy: mapped !== raw, isUnmapped: false };
  }
  return { raw, value: "", label: raw, isLegacy: true, isUnmapped: true };
}

/**
 * Deployment read helper for license rows: `deployment_type` is authoritative,
 * `database_type` is only consulted when it actually holds a hosting label.
 */
export function readDeployment(
  lic: { deployment_type?: string | null; database_type?: string | null } | null | undefined,
  fallbackDeployment?: string | null
): NormalizedDeployment {
  const legacyColumn = looksLikeDeployment(lic?.database_type) ? lic?.database_type : null;
  return normalizeDeployment(lic?.deployment_type, legacyColumn, fallbackDeployment);
}

/** Canonical license model for a license (derives from the product when possible). */
export function normalizeLicenseModel(
  product: string | null | undefined,
  storedModel?: string | null,
  context: ProductContext = {}
): string {
  const stored = canonicalLicenseModel(storedModel);
  const { value } = normalizeLicenseProduct(product, { ...context, licenseModel: storedModel });
  if (value === "Business KeepIT") return "KEEP-IT";
  if (value === "Business UseIT") return "USE-IT";
  if (value.startsWith("Professional")) return "PROFESSIONAL";
  return stored;
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
  /** Raw database engine value, kept untouched and never used as deployment. */
  databaseEngine: string;
  needsReview: boolean;
}

/**
 * One-call read helper for any license-like row.
 * `deployment_type` is the only authoritative hosting column.
 */
export function readLicenseVocabulary(
  lic:
    | {
        product?: string | null;
        edition?: string | null;
        deployment_type?: string | null;
        database_type?: string | null;
        license_model?: string | null;
        version?: string | null;
      }
    | null
    | undefined,
  fallbackDeployment?: string | null
): LicenseVocabularyView {
  const product = normalizeLicenseProduct(lic?.product, {
    licenseModel: lic?.license_model,
    edition: lic?.edition,
  });
  const deployment = readDeployment(lic, fallbackDeployment);
  return {
    product,
    deployment,
    licenseModel: normalizeLicenseModel(lic?.product, lic?.license_model, { edition: lic?.edition }),
    version: normalizeVersion(lic?.version),
    databaseEngine: (lic?.database_type || "").trim(),
    needsReview: product.isUnmapped || deployment.isUnmapped,
  };
}

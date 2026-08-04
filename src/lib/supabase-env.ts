/**
 * Environment separation guard for the Supabase client.
 *
 * PROD  -> project ref qownzparzsaeoyccgwuj  (host partneros.manwinwin.com)
 * TEST  -> project ref avxxzmoayxzrykwqzoqn  (Lovable preview / localhost)
 *
 * Never logs or embeds keys in error messages.
 */

export const PROD_PROJECT_REF = "qownzparzsaeoyccgwuj";
export const TEST_PROJECT_REF = "avxxzmoayxzrykwqzoqn";

export const PROD_HOSTS = ["partneros.manwinwin.com"];

export type ResolvedEnvironment = "production" | "test";

export interface SupabaseEnvInput {
  url?: string | null;
  publishableKey?: string | null;
  hostname?: string | null;
}

export interface ResolvedSupabaseEnv {
  environment: ResolvedEnvironment;
  projectRef: string;
  url: string;
  publishableKey: string;
}

export class SupabaseEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseEnvironmentError";
  }
}

/** Classify a hostname as production or test/preview. */
export function classifyHost(hostname?: string | null): ResolvedEnvironment {
  const host = (hostname ?? "").trim().toLowerCase();
  return PROD_HOSTS.includes(host) ? "production" : "test";
}

/** Extract the Supabase project ref from a project URL. */
export function extractProjectRefFromUrl(url?: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const match = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(parsed.hostname.toLowerCase());
  return match ? match[1] : null;
}

/**
 * Extract the project ref from a legacy Supabase JWT publishable/anon key.
 * Returns null for non-JWT keys (e.g. new `sb_publishable_...` format).
 */
export function extractProjectRefFromKey(key?: string | null): string | null {
  const value = (key ?? "").trim();
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
    const json = JSON.parse(decoded) as { ref?: unknown };
    return typeof json.ref === "string" && json.ref ? json.ref : null;
  } catch {
    return null;
  }
}

/**
 * Resolve and validate the Supabase environment. Fails closed: any mismatch,
 * malformed or missing value throws before a client can be created.
 */
export function resolveSupabaseEnv(input: SupabaseEnvInput): ResolvedSupabaseEnv {
  const environment = classifyHost(input.hostname);
  const expectedRef = environment === "production" ? PROD_PROJECT_REF : TEST_PROJECT_REF;
  const label = environment === "production" ? "production (partneros.manwinwin.com)" : "preview/development";

  const url = (input.url ?? "").trim();
  const publishableKey = (input.publishableKey ?? "").trim();

  if (!url) {
    throw new SupabaseEnvironmentError(
      `Supabase configuration error: VITE_SUPABASE_URL is missing for the ${label} environment.`,
    );
  }
  if (!publishableKey) {
    throw new SupabaseEnvironmentError(
      `Supabase configuration error: VITE_SUPABASE_PUBLISHABLE_KEY is missing for the ${label} environment.`,
    );
  }

  const urlRef = extractProjectRefFromUrl(url);
  if (!urlRef) {
    throw new SupabaseEnvironmentError(
      `Supabase configuration error: VITE_SUPABASE_URL is not a valid Supabase project URL for the ${label} environment.`,
    );
  }

  if (urlRef !== expectedRef) {
    throw new SupabaseEnvironmentError(
      `Supabase configuration error: the ${label} environment must use project ref ${expectedRef}, ` +
        `but VITE_SUPABASE_URL points to ${urlRef}. Refusing to start with a mismatched backend.`,
    );
  }

  const keyRef = extractProjectRefFromKey(publishableKey);
  if (keyRef && keyRef !== urlRef) {
    throw new SupabaseEnvironmentError(
      `Supabase configuration error: VITE_SUPABASE_PUBLISHABLE_KEY belongs to project ref ${keyRef}, ` +
        `which does not match VITE_SUPABASE_URL project ref ${urlRef}.`,
    );
  }

  return { environment, projectRef: urlRef, url, publishableKey };
}

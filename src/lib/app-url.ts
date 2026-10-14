import { extractProjectRefFromUrl, PROD_PROJECT_REF, TEST_PROJECT_REF } from "./supabase-env";

export const PUBLISHED_APP_URL = "https://partneros-manwinwin.lovable.app";
export const PUBLISHED_RESET_PASSWORD_URL = `${PUBLISHED_APP_URL}/reset-password`;

// Derive email destinations from the configured backend, never from an
// untrusted preview hostname or a hard-coded TEST URL on a PROD frontend.
export function resolvePublishedAppUrl(supabaseUrl: string): string {
  const ref = extractProjectRefFromUrl(supabaseUrl);
  if (ref === PROD_PROJECT_REF) return "https://partneros.manwinwin.com";
  if (ref === TEST_PROJECT_REF) return PUBLISHED_APP_URL;
  throw new Error("Unknown Supabase environment; refusing authentication redirect");
}

export function getPublishedAppUrl(): string {
  return resolvePublishedAppUrl(import.meta.env.VITE_SUPABASE_URL);
}
export function getAppUrl(): string { return getPublishedAppUrl(); }
export function getAppRedirectUrl(path: string = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${getPublishedAppUrl()}${suffix}`;
}
export function getPublishedResetPasswordUrl(): string { return getAppRedirectUrl("/reset-password"); }

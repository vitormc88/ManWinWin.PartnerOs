/**
 * Canonical production URL for the PartnerOS app.
 *
 * IMPORTANT: All authentication redirects (signup confirmation, password reset,
 * invitations) MUST point to the published application URL — NEVER to the
 * Lovable preview/editor URL (`id-preview--*.lovable.app`) or workspace.
 *
 * If `window.location.origin` is the preview/editor host, we fall back to the
 * production URL so emails sent during development still link users to the
 * real app.
 */
const PRODUCTION_URL = "https://partner-nexus-hub-90.lovable.app";

function isPreviewOrEditorHost(origin: string): boolean {
  if (!origin) return true;
  // Lovable preview deployments (e.g. id-preview--<project>.lovable.app)
  if (/id-preview--/.test(origin)) return true;
  // Lovable editor / workspace
  if (/lovable\.dev$/.test(origin)) return true;
  // Local dev
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin)) return true;
  return false;
}

export function getAppUrl(): string {
  if (typeof window === "undefined") return PRODUCTION_URL;
  const origin = window.location.origin;
  return isPreviewOrEditorHost(origin) ? PRODUCTION_URL : origin;
}

export function getAppRedirectUrl(path: string = "/"): string {
  const base = getAppUrl().replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

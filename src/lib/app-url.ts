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
export const PUBLISHED_APP_URL = "https://partneros-manwinwin.lovable.app";
export const PUBLISHED_RESET_PASSWORD_URL = `${PUBLISHED_APP_URL}/reset-password`;

function isPreviewOrEditorHost(origin: string): boolean {
  if (!origin) return true;

  try {
    const hostname = new URL(origin).hostname;
    const publishedHostname = new URL(PUBLISHED_APP_URL).hostname;

    if (hostname === publishedHostname) return false;

    if (hostname.includes("id-preview--")) return true;
    if (hostname.endsWith(".lovableproject.com")) return true;
    if (hostname === "lovable.dev" || hostname.endsWith(".lovable.dev")) return true;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;

    return false;
  } catch {
    return true;
  }
}

export function getAppUrl(): string {
  if (typeof window === "undefined") return PUBLISHED_APP_URL;
  const origin = window.location.origin;
  return isPreviewOrEditorHost(origin) ? PUBLISHED_APP_URL : origin;
}

export function getAppRedirectUrl(path: string = "/"): string {
  const base = getAppUrl().replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function getPublishedAppUrl(): string {
  return PUBLISHED_APP_URL;
}

export function getPublishedResetPasswordUrl(): string {
  return PUBLISHED_RESET_PASSWORD_URL;
}

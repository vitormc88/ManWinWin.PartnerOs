/**
 * Partner Academy certificates — pure domain helpers.
 *
 * `academy_certifications` is the single authoritative certificate record.
 * Legacy `partner_certifications` rows are a separate, clearly-labelled source
 * and are never merged into (or written from) Academy data.
 */

export type CertificateStatus = "valid" | "revoked" | "expired" | string;

export interface AcademyCertificate {
  id: string;
  certificate_reference: string;
  user_id: string;
  learner_name: string;
  /** HQ/admin management surface only — never present on learner payloads. */
  learner_email?: string | null;
  partner_id: string | null;
  partner_name: string | null;
  module_id: string;
  module_title: string;
  module_slug: string;
  module_version: number | null;
  score: number;
  scenario_score: number;
  issued_at: string;
  status: CertificateStatus;
  attempt_id: string | null;
}

/** Minimized public payload returned by `academy_verify_certificate`. */
export interface CertificateVerification {
  found: boolean;
  certificate_reference?: string;
  learner_name?: string;
  module_title?: string;
  module_version?: number | null;
  issued_at?: string;
  status?: CertificateStatus;
  valid?: boolean;
}

/** Fields the public verification payload is allowed to carry. */
export const PUBLIC_VERIFICATION_FIELDS = [
  "found",
  "certificate_reference",
  "learner_name",
  "module_title",
  "module_version",
  "issued_at",
  "status",
  "valid",
] as const;

/** Guard used by tests and by the UI before rendering a verification result. */
export function isMinimalVerificationPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const allowed = new Set<string>(PUBLIC_VERIFICATION_FIELDS as readonly string[]);
  return Object.keys(payload as Record<string, unknown>).every((k) => allowed.has(k));
}

export function isCertificateValid(status: CertificateStatus | undefined | null): boolean {
  return status === "valid";
}

export function certificateStatusLabel(status: CertificateStatus | undefined | null): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
    default:
      return "Unknown";
  }
}

export function formatCertificateDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

/** Absolute, shareable verification URL for a certificate reference. */
export function verificationUrl(reference: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/verify/${encodeURIComponent(reference.trim())}`;
}

export function moduleVersionLabel(version: number | null | undefined): string {
  return version == null ? "—" : `v${version}`;
}

/** Certificates for the users of one partner (association derived at read time). */
export function certificatesForPartner(
  certificates: AcademyCertificate[],
  partnerId: string | null | undefined
): AcademyCertificate[] {
  if (!partnerId) return [];
  return certificates.filter((c) => c.partner_id === partnerId);
}

/** HQ learners have no partner — they must still see their own certificates. */
export function partnerLabel(certificate: AcademyCertificate): string {
  return certificate.partner_name ?? (certificate.partner_id ? "Partner" : "ManWinWin HQ");
}

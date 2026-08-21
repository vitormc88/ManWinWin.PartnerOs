/**
 * Certificate document — pure view-model helpers.
 *
 * The printable certificate is a *presentation* of the existing
 * `academy_certifications` record. It never fetches, derives or stores
 * certificate data of its own: issuance, scoring, pass rules and references
 * remain owned by the Academy certification engine.
 */

import {
  formatCertificateDate,
  moduleVersionLabel,
  partnerLabel,
  verificationUrl,
  type AcademyCertificate,
} from "@/lib/academy-certificates";

export const CERTIFICATE_EYEBROW = "MANWINWIN PARTNER ACADEMY";
export const CERTIFICATE_TITLE = "CERTIFICATE OF COMPLETION";
export const CERTIFICATE_TAGLINE = "One Network. Shared Success.";
export const CERTIFICATE_ISSUER = "ManWinWin Partner Academy";
export const CERTIFICATE_STATEMENT =
  "has successfully completed the Module Certification and demonstrated understanding of the principles and capabilities covered in";

export interface CertificateDocumentModel {
  eyebrow: string;
  title: string;
  statement: string;
  tagline: string;
  issuer: string;
  learnerName: string;
  moduleTitle: string;
  moduleVersion: string;
  /** "Module 5 — Qualification · v1" */
  moduleLine: string;
  issuedOn: string;
  organisation: string;
  weightedScore: string;
  /** Null when the module has no scenario component (or it was not scored). */
  scenarioScore: string | null;
  reference: string;
  verificationUrl: string;
}

/** Scenario scores only appear when the module actually scored one. */
export function shouldShowScenarioScore(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Non-lossy percentage rendering: keep the meaningful decimals of the stored
 * score (98.5 -> "98.5%") while integers stay clean (100 -> "100%").
 * Never rounds away a real fractional score.
 */
export function formatCertificatePercent(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const trimmed = Number(n.toFixed(2));
  return `${Number.isInteger(trimmed) ? trimmed : trimmed}%`;
}


export function buildCertificateDocument(
  certificate: AcademyCertificate,
  origin?: string
): CertificateDocumentModel {
  const version = moduleVersionLabel(certificate.module_version);
  return {
    eyebrow: CERTIFICATE_EYEBROW,
    title: CERTIFICATE_TITLE,
    statement: CERTIFICATE_STATEMENT,
    tagline: CERTIFICATE_TAGLINE,
    issuer: CERTIFICATE_ISSUER,
    learnerName: certificate.learner_name,
    moduleTitle: certificate.module_title,
    moduleVersion: version,
    moduleLine: version === "—" ? certificate.module_title : `${certificate.module_title} · ${version}`,
    issuedOn: formatCertificateDate(certificate.issued_at),
    organisation: partnerLabel(certificate),
    weightedScore: `${Math.round(Number(certificate.score))}%`,
    scenarioScore: shouldShowScenarioScore(certificate.scenario_score)
      ? `${Math.round(Number(certificate.scenario_score))}%`
      : null,
    reference: certificate.certificate_reference,
    verificationUrl: verificationUrl(certificate.certificate_reference, origin),
  };
}

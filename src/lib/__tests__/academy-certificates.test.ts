import { describe, it, expect } from "vitest";
import {
  PUBLIC_VERIFICATION_FIELDS,
  certificateStatusLabel,
  certificatesForPartner,
  isCertificateValid,
  isMinimalVerificationPayload,
  moduleVersionLabel,
  partnerLabel,
  verificationUrl,
  type AcademyCertificate,
} from "@/lib/academy-certificates";

const base: AcademyCertificate = {
  id: "c1",
  certificate_reference: "PA-Q-0001",
  user_id: "u1",
  learner_name: "Ana Silva",
  partner_id: "p1",
  partner_name: "Partner One",
  module_id: "m5",
  module_title: "Module 5 — Qualification",
  module_slug: "module-5-qualification",
  module_version: 1,
  score: 88,
  scenario_score: 70,
  issued_at: "2026-08-20T10:00:00Z",
  status: "valid",
  attempt_id: "a1",
};

describe("academy certificates", () => {
  it("scopes certificates to the partner derived from the learner profile", () => {
    const hqLearner: AcademyCertificate = {
      ...base,
      id: "c2",
      user_id: "u2",
      partner_id: null,
      partner_name: null,
      certificate_reference: "PA-Q-0002",
    };
    const list = [base, hqLearner];
    expect(certificatesForPartner(list, "p1").map((c) => c.id)).toEqual(["c1"]);
    expect(certificatesForPartner(list, null)).toEqual([]);
    // HQ learner without a partner still owns a certificate and is labelled.
    expect(partnerLabel(hqLearner)).toBe("ManWinWin HQ");
    expect(partnerLabel(base)).toBe("Partner One");
  });

  it("never treats non-valid statuses as valid", () => {
    expect(isCertificateValid("valid")).toBe(true);
    expect(isCertificateValid("revoked")).toBe(false);
    expect(isCertificateValid(undefined)).toBe(false);
    expect(certificateStatusLabel("revoked")).toBe("Revoked");
    expect(certificateStatusLabel("nonsense")).toBe("Unknown");
  });

  it("accepts only the minimized public verification payload", () => {
    const safe = {
      found: true,
      certificate_reference: "PA-Q-0001",
      learner_name: "Ana Silva",
      module_title: "Module 5",
      module_version: 1,
      issued_at: "2026-08-20T10:00:00Z",
      status: "valid",
      valid: true,
    };
    expect(isMinimalVerificationPayload(safe)).toBe(true);
    expect(isMinimalVerificationPayload({ ...safe, learner_email: "a@b.c" })).toBe(false);
    expect(isMinimalVerificationPayload({ ...safe, user_id: "u1" })).toBe(false);
    expect(isMinimalVerificationPayload({ ...safe, attempt_id: "a1" })).toBe(false);
    expect(PUBLIC_VERIFICATION_FIELDS).not.toContain("learner_email" as never);
  });

  it("builds a shareable verification URL", () => {
    expect(verificationUrl("PA-Q-0001", "https://x.test")).toBe("https://x.test/verify/PA-Q-0001");
    expect(moduleVersionLabel(2)).toBe("v2");
    expect(moduleVersionLabel(null)).toBe("—");
  });
});

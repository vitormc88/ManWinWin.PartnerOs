import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CertificateDocument } from "@/components/academy/CertificateDocument";
import {
  CERTIFICATE_EYEBROW,
  CERTIFICATE_TAGLINE,
  CERTIFICATE_TITLE,
  buildCertificateDocument,
  formatCertificatePercent,
  shouldShowScenarioScore,
} from "@/lib/certificate-document";
import type { AcademyCertificate } from "@/lib/academy-certificates";

const cert: AcademyCertificate = {
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

describe("certificate document model", () => {
  it("builds the institutional copy from the existing certificate record", () => {
    const doc = buildCertificateDocument(cert, "https://x.test");
    expect(doc.eyebrow).toBe(CERTIFICATE_EYEBROW);
    expect(doc.title).toBe(CERTIFICATE_TITLE);
    expect(doc.tagline).toBe(CERTIFICATE_TAGLINE);
    expect(doc.moduleLine).toBe("Module 5 — Qualification · v1");
    expect(doc.weightedScore).toBe("88%");
    expect(doc.scenarioScore).toBe("70%");
    expect(doc.organisation).toBe("Partner One");
    expect(doc.verificationUrl).toBe("https://x.test/verify/PA-Q-0001");
  });

  it("handles a missing partner and an absent scenario score", () => {
    const doc = buildCertificateDocument(
      { ...cert, partner_id: null, partner_name: null, scenario_score: 0 },
      "https://x.test"
    );
    expect(doc.organisation).toBe("ManWinWin HQ");
    expect(doc.scenarioScore).toBeNull();
    expect(shouldShowScenarioScore(null)).toBe(false);
    expect(shouldShowScenarioScore(61)).toBe(true);
  });

  it("omits the version marker when the module has no version", () => {
    expect(buildCertificateDocument({ ...cert, module_version: null }).moduleLine).toBe(
      "Module 5 — Qualification"
    );
  });
});

describe("<CertificateDocument />", () => {
  it("renders semantic certificate text and no application chrome", async () => {
    render(<CertificateDocument certificate={cert} origin="https://x.test" />);

    expect(screen.getByText(CERTIFICATE_EYEBROW)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: CERTIFICATE_TITLE })).toBeInTheDocument();
    expect(screen.getByText("This certifies that")).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Module 5 — Qualification · v1")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("ManWinWin Partner Academy")).toBeInTheDocument();
    expect(screen.getByText(CERTIFICATE_TAGLINE)).toBeInTheDocument();
    expect(screen.getByText("PA-Q-0001")).toBeInTheDocument();

    // No status chips, buttons or navigation belong on the printed artefact.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Valid")).toBeNull();

    // QR resolves to the existing verification URL for this reference.
    await waitFor(() =>
      expect(
        document.querySelector('[data-qr-target="https://x.test/verify/PA-Q-0001"]')
      ).not.toBeNull()
    );
  });

  it("hides the scenario score row when there is none", () => {
    render(<CertificateDocument certificate={{ ...cert, scenario_score: 0 }} origin="https://x.test" />);
    expect(screen.queryByText("Scenario analysis")).toBeNull();
  });
});

describe("non-lossy percentage formatting", () => {
  it("keeps meaningful decimals and trims noise", () => {
    expect(formatCertificatePercent(98.5)).toBe("98.5%");
    expect(formatCertificatePercent(100)).toBe("100%");
    expect(formatCertificatePercent(92)).toBe("92%");
    expect(formatCertificatePercent("98.50")).toBe("98.5%");
    expect(formatCertificatePercent(66.666)).toBe("66.67%");
    expect(formatCertificatePercent(null)).toBe("—");
    expect(formatCertificatePercent(undefined)).toBe("—");
  });

  it("renders the exact decimal weighted score on the certificate", async () => {
    const doc = buildCertificateDocument({ ...cert, score: 98.5, scenario_score: 87.5 }, "https://x.test");
    expect(doc.weightedScore).toBe("98.5%");
    expect(doc.scenarioScore).toBe("87.5%");

    render(<CertificateDocument model={doc} />);
    await waitFor(() => expect(screen.getByText("98.5%")).toBeInTheDocument());
    expect(screen.getByText("87.5%")).toBeInTheDocument();
  });
});

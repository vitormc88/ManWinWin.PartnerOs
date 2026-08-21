import manwinwinLogo from "@/assets/manwinwin-logo.png";
import { CertificateQr } from "@/components/academy/CertificateQr";
import { buildCertificateDocument } from "@/lib/certificate-document";
import type { AcademyCertificate } from "@/lib/academy-certificates";
import { cn } from "@/lib/utils";

/**
 * The printed artefact: A4 landscape, exactly one page, semantic text.
 * Deliberately carries no application chrome, badges or status chips —
 * validity lives on the verification page.
 */
export function CertificateDocument({
  certificate,
  origin,
  className,
}: {
  certificate: AcademyCertificate;
  origin?: string;
  className?: string;
}) {
  const doc = buildCertificateDocument(certificate, origin);

  return (
    <article className={cn("certificate-canvas", className)} data-testid="certificate-document">
      <div className="certificate-frame">
        <header className="certificate-header">
          <img src={manwinwinLogo} alt="ManWinWin" className="certificate-logo" />
          <p className="certificate-eyebrow">{doc.eyebrow}</p>
        </header>

        <div className="certificate-body">
          <h1 className="certificate-title">{doc.title}</h1>
          <span className="certificate-rule" aria-hidden="true" />

          <p className="certificate-lead">This certifies that</p>
          <p className="certificate-learner">{doc.learnerName}</p>
          <p className="certificate-statement">{doc.statement}</p>
          <p className="certificate-module">{doc.moduleLine}</p>

          <dl className="certificate-meta">
            <div>
              <dt>Issued</dt>
              <dd>{doc.issuedOn}</dd>
            </div>
            <div>
              <dt>Organisation</dt>
              <dd>{doc.organisation}</dd>
            </div>
            <div>
              <dt>Weighted score</dt>
              <dd>{doc.weightedScore}</dd>
            </div>
            {doc.scenarioScore && (
              <div>
                <dt>Scenario analysis</dt>
                <dd>{doc.scenarioScore}</dd>
              </div>
            )}
          </dl>
        </div>

        <footer className="certificate-footer">
          <div className="certificate-issuer">
            <span className="certificate-signline" aria-hidden="true" />
            <p className="certificate-issuer-name">{doc.issuer}</p>
            <p className="certificate-tagline">{doc.tagline}</p>
          </div>

          <div className="certificate-verify">
            <CertificateQr value={doc.verificationUrl} className="certificate-qr" />
            <div className="certificate-verify-text">
              <p className="certificate-reference">{doc.reference}</p>
              <p className="certificate-verify-url">{doc.verificationUrl}</p>
            </div>
          </div>
        </footer>
      </div>
    </article>
  );
}

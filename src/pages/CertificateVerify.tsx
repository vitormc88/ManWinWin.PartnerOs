import { Link, useParams } from "react-router-dom";
import { Award, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/BrandMark";
import { useMyCertificates, useVerifyCertificate } from "@/hooks/useAcademyCertificates";
import {
  certificateStatusLabel,
  formatCertificateDate,
  isCertificateValid,
  moduleVersionLabel,
  partnerLabel,
} from "@/lib/academy-certificates";
import { formatCertificatePercent, shouldShowScenarioScore } from "@/lib/certificate-document";

/**
 * Certificate verification — the authenticity page.
 *
 * The public payload is deliberately minimized (reference, learner display
 * name, module, version, issue date, status). Partner and scores are shown
 * only when the visitor is the certificate owner, i.e. from data they are
 * already authorized to read; no public surface is widened here.
 */
export default function CertificateVerify() {
  const { reference } = useParams();
  const { data, isLoading, isError } = useVerifyCertificate(reference);
  const { data: myCertificates = [] } = useMyCertificates();

  const found = data?.found === true;
  const valid = data?.valid === true;
  const status = data?.status;

  const owned = myCertificates.find(
    (c) => c.certificate_reference.toLowerCase() === (reference ?? "").toLowerCase()
  );

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2 justify-center">
          <BrandMark className="h-7 w-7" />
          <span className="text-sm font-semibold text-foreground">PartnerOS Academy</span>
        </div>

        <section className="bg-card rounded-xl border shadow-sm p-8 text-center space-y-5">
          <h1 className="text-xl font-bold text-foreground tracking-tight">Certificate verification</h1>

          {isLoading && <p className="text-sm text-muted-foreground">Checking reference…</p>}

          {(isError || (!isLoading && !found)) && (
            <div className="space-y-2">
              <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-foreground">No certificate matches this reference.</p>
              <p className="text-xs text-muted-foreground break-all">{reference}</p>
            </div>
          )}

          {found && (
            <>
              <Award className="h-9 w-9 mx-auto text-primary" />

              <div className="flex items-center justify-center gap-2">
                {valid ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ShieldX className="h-4 w-4 text-destructive" />
                )}
                <Badge variant={isCertificateValid(status) ? "success" : "destructive"}>
                  {certificateStatusLabel(status)}
                </Badge>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <Field label="Learner" value={data?.learner_name ?? "—"} />
                <Field label="Partner" value={owned ? partnerLabel(owned) : "Not publicly disclosed"} />
                <Field
                  label="Module"
                  value={`${data?.module_title ?? "—"} · ${moduleVersionLabel(data?.module_version ?? null)}`}
                />
                <Field label="Issue date" value={formatCertificateDate(data?.issued_at)} />
                <Field
                  label="Weighted score"
                  value={owned ? formatCertificatePercent(owned.score) : "Not publicly disclosed"}
                />
                {owned && shouldShowScenarioScore(owned.scenario_score) && (
                  <Field label="Scenario analysis" value={formatCertificatePercent(owned.scenario_score)} />
                )}
                <Field label="Certificate reference" value={data?.certificate_reference ?? "—"} />
              </dl>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button size="sm" asChild>
                  <Link to={`/certifications/${encodeURIComponent(data?.certificate_reference ?? "")}`}>
                    View certificate
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/">Go to PartnerOS</Link>
                </Button>
              </div>

              {!owned && (
                <p className="text-xs text-muted-foreground">
                  Scores and partner attribution are only shown to the certificate holder. Signing in to
                  PartnerOS as the holder reveals them here and opens the certificate document.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}

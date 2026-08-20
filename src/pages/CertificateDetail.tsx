import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Award, Copy, Printer, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AcademyState } from "@/components/academy/AcademyState";
import { useMyCertificates } from "@/hooks/useAcademyCertificates";
import {
  certificateStatusLabel,
  formatCertificateDate,
  isCertificateValid,
  moduleVersionLabel,
  partnerLabel,
  verificationUrl,
} from "@/lib/academy-certificates";

/** Printable certificate for a certificate the signed-in learner owns. */
export default function CertificateDetail() {
  const { reference } = useParams();
  const { data: certificates = [], isLoading, isError, error, refetch } = useMyCertificates();

  if (isError)
    return <AcademyState kind="error" title="Could not load your certificate" error={error} onRetry={() => refetch()} />;
  if (isLoading) return <AcademyState kind="loading" title="Loading certificate…" />;

  const cert = certificates.find(
    (c) => c.certificate_reference.toLowerCase() === (reference ?? "").toLowerCase()
  );

  if (!cert)
    return (
      <AcademyState
        kind="empty"
        title="Certificate not available"
        description="This certificate does not exist or is not yours. Use the public verification link to check a reference."
      />
    );

  const url = verificationUrl(cert.certificate_reference);
  const valid = isCertificateValid(cert.status);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Verification link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link to="/certifications"><ArrowLeft className="h-4 w-4 mr-1" />All certificates</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-1" />Copy verification link
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="print-certificate bg-card rounded-xl border shadow-sm p-8 sm:p-12 text-center space-y-6">
        <div className="space-y-1">
          <Award className="h-10 w-10 mx-auto text-primary" />
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            PartnerOS by ManWinWin
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Certificate of Completion
          </h1>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">This certifies that</p>
          <p className="text-2xl font-semibold text-foreground">{cert.learner_name}</p>
          <p className="text-sm text-muted-foreground">has successfully completed</p>
          <p className="text-lg font-semibold text-foreground">
            {cert.module_title} · {moduleVersionLabel(cert.module_version)}
          </p>
          <p className="text-xs text-muted-foreground">
            Passing requires a weighted score of at least 80% and a Scenario Analysis score of at least 60%.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
          <Tile label="Weighted score" value={`${cert.score}%`} />
          <Tile label="Scenario Analysis" value={`${cert.scenario_score}%`} />
          <Tile label="Issued" value={formatCertificateDate(cert.issued_at)} />
          <Tile label="Organisation" value={partnerLabel(cert)} />
        </div>

        <div className="pt-4 border-t space-y-2">
          <div className="flex items-center justify-center gap-2">
            {valid ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <ShieldX className="h-4 w-4 text-destructive" />
            )}
            <Badge variant={valid ? "success" : "destructive"}>{certificateStatusLabel(cert.status)}</Badge>
          </div>
          <p className="text-sm font-medium text-foreground tabular-nums">{cert.certificate_reference}</p>
          <p className="text-xs text-muted-foreground break-all">Verify at {url}</p>
        </div>
      </article>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

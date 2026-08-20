import { Link, useParams } from "react-router-dom";
import { Award, Printer, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/BrandMark";
import { useVerifyCertificate } from "@/hooks/useAcademyCertificates";
import {
  certificateStatusLabel,
  formatCertificateDate,
  moduleVersionLabel,
} from "@/lib/academy-certificates";

/**
 * Public certificate verification. Renders only the minimized payload the
 * server exposes: reference, learner display name, module, version, issue date
 * and validity. Never email, user id, attempt or answer data.
 */
export default function CertificateVerify() {
  const { reference } = useParams();
  const { data, isLoading, isError } = useVerifyCertificate(reference);

  const found = data?.found === true;
  const valid = data?.valid === true;

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2 justify-center print:hidden">
          <BrandMark className="h-7 w-7" />
          <span className="text-sm font-semibold text-foreground">PartnerOS Academy</span>
        </div>

        <section className="print-certificate bg-card rounded-xl border shadow-sm p-8 text-center space-y-5">
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
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Issued to</p>
                <p className="text-lg font-semibold text-foreground">{data?.learner_name}</p>
                <p className="text-sm text-foreground">
                  {data?.module_title} · {moduleVersionLabel(data?.module_version ?? null)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued {formatCertificateDate(data?.issued_at)}
                </p>
              </div>

              <div className="flex items-center justify-center gap-2">
                {valid ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ShieldX className="h-4 w-4 text-destructive" />
                )}
                <Badge variant={valid ? "success" : "destructive"}>
                  {certificateStatusLabel(data?.status)}
                </Badge>
              </div>

              <p className="text-sm font-medium text-foreground tabular-nums">
                {data?.certificate_reference}
              </p>
            </>
          )}

          <div className="print:hidden flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />Print / Save as PDF
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Go to PartnerOS</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

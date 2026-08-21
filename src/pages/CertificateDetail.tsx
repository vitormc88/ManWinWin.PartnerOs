import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AcademyState } from "@/components/academy/AcademyState";
import { CertificateDocument } from "@/components/academy/CertificateDocument";
import { useMyCertificates } from "@/hooks/useAcademyCertificates";
import { verificationUrl } from "@/lib/academy-certificates";

/**
 * The certificate document for a certificate the signed-in learner owns.
 * Everything outside `<CertificateDocument>` is application chrome and is
 * removed from the printed page.
 */
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Verification link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <div className="certificate-print-root max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link to="/certifications"><ArrowLeft className="h-4 w-4 mr-1" />All certificates</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/verify/${encodeURIComponent(cert.certificate_reference)}`}>
              <ShieldCheck className="h-4 w-4 mr-1" />Verification page
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-1" />Copy verification link
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="shadow-lg print:shadow-none">
        <CertificateDocument certificate={cert} />
      </div>

      <p className="text-xs text-muted-foreground print:hidden">
        Prints as a single A4 landscape page. The QR code and reference resolve to the certificate's
        verification page.
      </p>
    </div>
  );
}

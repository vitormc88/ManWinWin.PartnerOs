import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CertificateDocument } from "@/components/academy/CertificateDocument";
import { useMyCertificates, useManagedCertificates } from "@/hooks/useAcademyCertificates";
import type { AcademyCertificate } from "@/lib/academy-certificates";

/**
 * TEST/PREVIEW design review route for the certificate document.
 * Uses a real certificate when the environment has one; otherwise renders a
 * representative record so the layout can be approved before production.
 */
const SAMPLE: AcademyCertificate = {
  id: "preview",
  certificate_reference: "PA-QUA-2026-0001",
  user_id: "preview-user",
  learner_name: "Margarida Pereira",
  partner_id: "preview-partner",
  partner_name: "Nordic Maintenance Partners",
  module_id: "preview-module",
  module_title: "Module 5 — Qualification",
  module_slug: "module-5-qualification",
  module_version: 1,
  score: 92,
  scenario_score: 84,
  issued_at: "2026-08-21T09:00:00Z",
  status: "valid",
  attempt_id: null,
};

export default function CertificatePreview() {
  const mine = useMyCertificates();
  const managed = useManagedCertificates();
  const real = mine.data?.[0] ?? managed.data?.[0] ?? null;
  const certificate = real ?? SAMPLE;

  return (
    <div className="certificate-print-root max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Certificate preview</h1>
          <p className="text-xs text-muted-foreground">
            {real
              ? `Rendering real certificate ${real.certificate_reference}.`
              : "No certificate exists in this environment yet — rendering a representative record."}
          </p>
        </div>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" />Print / Save as PDF
        </Button>
      </div>

      <div className="shadow-lg print:shadow-none">
        <CertificateDocument certificate={certificate} />
      </div>
    </div>
  );
}

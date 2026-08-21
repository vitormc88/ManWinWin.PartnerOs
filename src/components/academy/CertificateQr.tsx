import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Small QR pointing at the certificate's existing verification URL.
 * Rendered as an <img> data URL so it survives Print / Save as PDF.
 */
export function CertificateQr({ value, className }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      margin: 0,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#1B2A3AFF", light: "#FFFFFF00" },
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc(null);
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (!src) return <span className={className} aria-hidden="true" data-qr-placeholder="true" />;

  return (
    <img
      src={src}
      className={className}
      alt={`QR code linking to the verification page for this certificate`}
      data-qr-target={value}
    />
  );
}

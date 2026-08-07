import symbol from "@/assets/partneros-symbol.png";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={symbol}
      alt="PartnerOS"
      width={512}
      height={512}
      loading="eager"
      decoding="async"
      className={cn("object-contain shrink-0", className)}
    />
  );
}

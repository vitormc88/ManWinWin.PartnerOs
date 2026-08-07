import symbol from "@/assets/partneros-symbol.png";
import symbolTransparent from "@/assets/partneros-symbol-transparent.png";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  transparent = false,
}: {
  className?: string;
  transparent?: boolean;
}) {
  return (
    <img
      src={transparent ? symbolTransparent : symbol}
      alt="PartnerOS"
      width={512}
      height={512}
      loading="eager"
      decoding="async"
      className={cn("object-contain shrink-0", className)}
    />
  );
}


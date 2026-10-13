import symbol from "@/assets/partneros-symbol.png";
import symbolTransparent from "@/assets/partneros-symbol-transparent.png";
import symbolReverse from "@/assets/partneros-symbol-reverse.svg";
import { cn } from "@/lib/utils";
import { BrandLoadingMark } from "./BrandLoadingMark";

export function BrandMark({
  className,
  transparent = false,
  reverse = false,
  animated = false,
}: {
  className?: string;
  /** Transparent-background raster variant (light backgrounds). */
  transparent?: boolean;
  /** PartnerOS Reverse Mark — same geometry, recolored for dark backgrounds. */
  reverse?: boolean;
  /** Orbit motion for actual loading states only; navigation remains static. */
  animated?: boolean;
}) {
  if (animated) return <BrandLoadingMark className={className} reverse={reverse} />;
  const src = reverse ? symbolReverse : transparent ? symbolTransparent : symbol;
  return (
    <img
      src={src}
      alt="PartnerOS"
      width={512}
      height={512}
      loading="eager"
      decoding="async"
      className={cn("object-contain shrink-0", className)}
    />
  );
}

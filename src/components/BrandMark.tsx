import symbolReverse from "@/assets/partneros-symbol-reverse.svg";
import { cn } from "@/lib/utils";
import { BrandLoadingMark } from "./BrandLoadingMark";

export function BrandMark({
  className,
  reverse = false,
  animated = false,
}: {
  className?: string;
  /** Compatibility option; the normal vector mark is always transparent. */
  transparent?: boolean;
  /** PartnerOS Reverse Mark — same geometry, recolored for dark backgrounds. */
  reverse?: boolean;
  /** Orbit motion for actual loading states only; navigation remains static. */
  animated?: boolean;
}) {
  if (animated) return <BrandLoadingMark className={className} reverse={reverse} />;
  const src = reverse ? symbolReverse : "/partneros-mark.svg";
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


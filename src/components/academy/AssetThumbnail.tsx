import { ImageOff } from "lucide-react";
import { useAssetUrl } from "@/hooks/useAcademyAssets";
import { isInlineImageAsset, assetTypeLabel, type AcademyAsset } from "@/lib/academy-assets";

/** Small lazy-loaded preview used by the library grid/list and the picker. */
export function AssetThumbnail({
  asset,
  className = "h-24 w-full",
}: {
  asset: AcademyAsset;
  className?: string;
}) {
  const url = useAssetUrl(asset);
  const isImage = isInlineImageAsset(asset);

  if (!isImage || !url) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-1 rounded-md bg-muted text-muted-foreground`}
      >
        <ImageOff className="h-4 w-4" />
        <span className="text-[10px]">{assetTypeLabel(asset.asset_type)}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={asset.alt_text || asset.title}
      loading="lazy"
      decoding="async"
      className={`${className} rounded-md object-contain bg-muted`}
    />
  );
}

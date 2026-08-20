import { AlertTriangle, ExternalLink, FileText, Film, ImageOff, Layers } from "lucide-react";
import { useAssetUrl, useAssetsByKey } from "@/hooks/useAcademyAssets";
import {
  ASSET_ALIGN_CLASS,
  ASSET_WIDTH_CLASS,
  assetTypeLabel,
  isInlineImageAsset,
  type AcademyAsset,
  type AssetReference,
} from "@/lib/academy-assets";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders a `:::asset` reference. Content stores only the asset key, so
 * replacing the asset updates every mission that embeds it — no markdown edits.
 */
export function AcademyAssetView({ reference }: { reference: AssetReference }) {
  const { byKey, isLoading } = useAssetsByKey();
  const asset = byKey[reference.id];

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (!asset || asset.status === "archived") {
    return (
      <div className="rounded-xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Asset <code className="font-mono">{reference.id}</code>{" "}
          {asset ? "is archived and no longer displayed." : "is not available in the Asset Library."}
        </span>
      </div>
    );
  }

  return <AssetFigure asset={asset} reference={reference} />;
}

function AssetFigure({ asset, reference }: { asset: AcademyAsset; reference: AssetReference }) {
  const url = useAssetUrl(asset);
  const caption = reference.caption ?? asset.caption ?? null;
  const wrapper = `${ASSET_WIDTH_CLASS[reference.width]} ${ASSET_ALIGN_CLASS[reference.align]}`;
  // Above-the-fold visuals (module heroes) may opt out of lazy loading.
  const eager = (reference.params.loading ?? "").toLowerCase() === "eager";

  return (
    <figure className={`my-6 max-w-full ${wrapper}`}>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {isInlineImageAsset(asset) ? (
          url ? (
            <img
              src={url}
              alt={asset.alt_text || asset.title}
              role="img"
              loading={eager ? "eager" : "lazy"}
              decoding={eager ? "sync" : "async"}
              className="w-full h-auto max-w-full object-contain bg-background"
            />

          ) : (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <ImageOff className="h-4 w-4" />
              Preview unavailable
            </div>
          )
        ) : (
          <NonImageAsset asset={asset} url={url} />
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-muted-foreground text-center">{caption}</figcaption>
      )}
    </figure>
  );
}

/**
 * Placeholder viewer for the future-ready asset kinds (video, PDF, embeds).
 * The markdown syntax stays identical when richer viewers land here.
 */
function NonImageAsset({ asset, url }: { asset: AcademyAsset; url: string | null }) {
  const Icon = asset.asset_type === "video" ? Film : asset.asset_type === "pdf" ? FileText : Layers;
  return (
    <div className="flex items-start gap-3 p-4">
      <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{asset.title}</p>
        <p className="text-xs text-muted-foreground">{assetTypeLabel(asset.asset_type)}</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open asset
          </a>
        ) : (
          <p className="text-xs text-muted-foreground italic">Not available yet</p>
        )}
      </div>
    </div>
  );
}

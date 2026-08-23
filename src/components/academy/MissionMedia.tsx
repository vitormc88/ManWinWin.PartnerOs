import { useRef } from "react";
import { ImageOff } from "lucide-react";
import { useAcademyMediaAsset } from "@/hooks/useAcademyAssets";
import { mediaDurationBucket, mediaPositionBucket } from "@/lib/academy-events";
import { cn } from "@/lib/utils";

export type MissionMediaKind = "video" | "audio" | "image";

export interface MissionMediaProps {
  kind: MissionMediaKind;
  /** Optional Asset Library key; when absent/unpublished the placeholder shows. */
  assetKey?: string | null;
  posterAssetKey?: string | null;
  captionsAssetKey?: string | null;
  /** Authored transcript, rendered under the player when present. */
  transcript?: string | null;
  /** Accessible name (alt text / aria-label fallback). */
  label: string;
  caption?: string | null;
  className?: string;
  /** Rendered while nothing is resolvable — keeps the approved placeholder UI. */
  placeholder: React.ReactNode;
  onStarted?: (info: { assetKey: string; durationBucket: string }) => void;
  onCompleted?: (info: { assetKey: string; positionBucket: string }) => void;
}

/**
 * Renders a Mission Player media slot from the existing Asset Library.
 *
 * Never autoplays, always exposes native controls, wires captions and poster
 * metadata when those assets exist, and degrades to the caller's placeholder
 * whenever the asset is missing, still draft, or cannot be resolved.
 */
export function MissionMedia({
  kind,
  assetKey,
  posterAssetKey,
  captionsAssetKey,
  transcript,
  label,
  caption,
  className,
  placeholder,
  onStarted,
  onCompleted,
}: MissionMediaProps) {
  const media = useAcademyMediaAsset(assetKey);
  const poster = useAcademyMediaAsset(posterAssetKey);
  const captions = useAcademyMediaAsset(captionsAssetKey);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  if (!media.ready || !media.url) {
    return <>{placeholder}</>;
  }

  const key = assetKey as string;

  const handlePlay = (el: HTMLMediaElement) => {
    if (startedRef.current) return;
    startedRef.current = true;
    onStarted?.({ assetKey: key, durationBucket: mediaDurationBucket(el.duration) });
  };

  const handleEnded = (el: HTMLMediaElement) => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleted?.({
      assetKey: key,
      positionBucket: mediaPositionBucket(el.duration, el.duration),
    });
  };

  const figure = (children: React.ReactNode) => (
    <figure className={cn("space-y-2", className)}>
      {children}
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
      {transcript && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="text-xs font-medium text-foreground cursor-pointer">Transcript</summary>
          <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{transcript}</p>
        </details>
      )}
    </figure>
  );

  if (kind === "image") {
    return figure(
      media.url ? (
        <img
          src={media.url}
          alt={media.asset?.alt_text || label}
          loading="lazy"
          decoding="async"
          className="w-full h-auto rounded-xl border bg-background object-contain"
        />
      ) : (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          Preview unavailable
        </div>
      )
    );
  }

  if (kind === "audio") {
    return figure(
      <audio
        controls
        preload="metadata"
        src={media.url}
        aria-label={label}
        className="w-full"
        onPlay={(e) => handlePlay(e.currentTarget)}
        onEnded={(e) => handleEnded(e.currentTarget)}
      >
        {captions.ready && captions.url && (
          <track kind="captions" src={captions.url} srcLang="en" label="English captions" default />
        )}
      </audio>
    );
  }

  return figure(
    <video
      controls
      preload="metadata"
      playsInline
      src={media.url}
      poster={poster.ready ? poster.url ?? undefined : undefined}
      aria-label={label}
      className="w-full rounded-xl border bg-black aspect-video"
      onPlay={(e) => handlePlay(e.currentTarget)}
      onEnded={(e) => handleEnded(e.currentTarget)}
    >
      {captions.ready && captions.url && (
        <track kind="captions" src={captions.url} srcLang="en" label="English captions" default />
      )}
    </video>
  );
}

export default MissionMedia;

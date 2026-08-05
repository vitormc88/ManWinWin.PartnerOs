import { useState } from "react";
import { Download, ExternalLink, FileText, FileSpreadsheet, FileType, ListChecks, Play, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signFileUrl } from "@/lib/storage-url";
import {
  ACADEMY_STORAGE_BUCKET,
  isSafeExternalUrl,
  resourceTypeLabel,
  type AcademyResource,
} from "@/lib/academy";

const ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  checklist: ListChecks,
  word: FileType,
  powerpoint: FileSpreadsheet,
  template: FileSpreadsheet,
  video: Play,
  link: Link2,
};

export function ResourceList({ resources }: { resources: AcademyResource[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const visible = resources.filter((r) => r.status === "published");
  if (visible.length === 0) return null;

  /**
   * Attachments live in the private `training-assets` bucket, so a stored
   * object path is only ever opened through a short-lived signed URL.
   */
  const openAttachment = async (resource: AcademyResource) => {
    const path = resource.file_path ?? "";
    setPending(resource.id);
    try {
      const url = await signFileUrl(ACADEMY_STORAGE_BUCKET, path);
      if (!url) {
        toast.error("This file is unavailable. Ask an Academy admin to re-upload it.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Resources</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((r) => {
          const type = (r.resource_type ?? "").toLowerCase();
          const Icon = ICONS[type] ?? FileText;
          const externalUrl = isSafeExternalUrl(r.external_url) ? r.external_url! : null;
          const hasFile = !!r.file_path;
          const isVideo = type === "video";
          const busy = pending === r.id;
          return (
            <div key={r.id} className="rounded-lg border p-3 flex gap-3">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <Badge variant="outline" className="text-[10px]">{resourceTypeLabel(r.resource_type)}</Badge>
                  {r.version && <Badge variant="outline" className="text-[10px]">v{r.version}</Badge>}
                </div>
                {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                {isVideo && !externalUrl ? (
                  <p className="text-xs text-muted-foreground italic">Video playback coming soon</p>
                ) : externalUrl ? (
                  <Button variant="outline" size="sm" className="h-7 mt-1" asChild>
                    <a href={externalUrl} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open
                    </a>
                  </Button>
                ) : hasFile ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 mt-1"
                    disabled={busy}
                    onClick={() => openAttachment(r)}
                  >
                    {busy ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Preparing…</>
                    ) : r.is_downloadable ? (
                      <><Download className="h-3.5 w-3.5 mr-1.5" />Download</>
                    ) : (
                      <><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open</>
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not available yet</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

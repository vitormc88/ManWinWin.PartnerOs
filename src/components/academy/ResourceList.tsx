import { Download, ExternalLink, FileText, FileSpreadsheet, FileType, ListChecks, Play, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resourceTypeLabel, type AcademyResource } from "@/lib/academy";

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
  const visible = resources.filter((r) => r.status === "published");
  if (visible.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Resources</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((r) => {
          const type = (r.resource_type ?? "").toLowerCase();
          const Icon = ICONS[type] ?? FileText;
          const href = r.external_url || r.file_path || null;
          const isVideo = type === "video";
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
                {isVideo ? (
                  <p className="text-xs text-muted-foreground italic">Video playback coming soon</p>
                ) : href ? (
                  <Button variant="outline" size="sm" className="h-7 mt-1" asChild>
                    <a href={href} target="_blank" rel="noreferrer noopener">
                      {r.is_downloadable ? (
                        <><Download className="h-3.5 w-3.5 mr-1.5" />Download</>
                      ) : (
                        <><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open</>
                      )}
                    </a>
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

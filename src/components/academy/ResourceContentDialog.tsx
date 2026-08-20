import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MissionContent } from "@/components/academy/MissionContent";
import type { AcademyResource } from "@/lib/academy";

/**
 * Reader for content-only resources (no stored file, no external URL).
 * Printing uses the browser dialog, so "Save as PDF" works everywhere without
 * inventing a file that does not exist.
 */
export function ResourceContentDialog({
  resource,
  open,
  onOpenChange,
}: {
  resource: AcademyResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!resource) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto print-document">
        <DialogHeader>
          <DialogTitle>{resource.title}</DialogTitle>
        </DialogHeader>
        {resource.description && (
          <p className="text-sm text-muted-foreground">{resource.description}</p>
        )}
        <div className="print:hidden flex justify-end">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print / Save as PDF
          </Button>
        </div>
        <div className="academy-prose">
          <MissionContent markdown={resource.content ?? ""} readOnlyChecklist hideLeadingH1 />
        </div>

      </DialogContent>
    </Dialog>
  );
}

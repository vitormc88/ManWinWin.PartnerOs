import { type RenewalStatus, getRenewalLabel } from "@/data/clients-mock-data";
import { cn } from "@/lib/utils";

const statusStyles: Record<RenewalStatus, string> = {
  green: "bg-success/10 text-success border-success/20",
  yellow: "bg-warning/15 text-warning-foreground border-warning/30",
  orange: "bg-warning/20 text-warning-foreground border-warning/40",
  red: "bg-destructive/10 text-destructive border-destructive/20",
  grey: "bg-muted text-muted-foreground border-border",
};

const dotStyles: Record<RenewalStatus, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  orange: "bg-warning",
  red: "bg-destructive",
  grey: "bg-muted-foreground/50",
};

export function RenewalBadge({ status }: { status: RenewalStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[status])} />
      {getRenewalLabel(status)}
    </span>
  );
}

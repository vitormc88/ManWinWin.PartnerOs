import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  className?: string;
  delay?: number;
}

export function KPICard({ title, value, change, changeType = "neutral", icon: Icon, className, delay = 0 }: KPICardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl p-5 shadow-md border animate-reveal-up",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
        </div>
        <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
      </div>
      {change && (
        <p className={cn(
          "text-xs font-medium mt-3",
          changeType === "positive" && "text-success",
          changeType === "negative" && "text-destructive",
          changeType === "neutral" && "text-muted-foreground",
        )}>
          {change}
        </p>
      )}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";

const ROLE_COLORS: Record<string, string> = {
  hq_admin: "bg-primary/10 text-primary border-primary/20",
  hq_standard: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  partner_manager: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  partner_admin: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  partner_sales: "bg-green-500/10 text-green-600 border-green-500/20",
  partner_restricted: "bg-muted text-muted-foreground border-border",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="outline" className={ROLE_COLORS[role] || "bg-muted text-muted-foreground"}>
      {role.replace(/_/g, " ")}
    </Badge>
  );
}

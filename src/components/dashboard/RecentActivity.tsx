import { announcements } from "@/data/mock-data";
import { Badge } from "@/components/ui/badge";

const typeVariant = {
  Product: "default" as const,
  Event: "info" as const,
  Resource: "ghost" as const,
};

export function RecentActivity() {
  return (
    <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-4">
      <div className="p-5 border-b">
        <h3 className="font-semibold text-foreground">Recent Announcements</h3>
      </div>
      <div className="divide-y">
        {announcements.map((a) => (
          <div key={a.id} className="px-5 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.date}</p>
            </div>
            <Badge variant={typeVariant[a.type]}>{a.type}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

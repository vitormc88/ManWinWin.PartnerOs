import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Megaphone, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const categoryVariant: Record<string, "default" | "secondary" | "outline"> = {
  Product: "default",
  Commercial: "secondary",
  Event: "secondary",
  Resource: "outline",
  Operational: "outline",
  Training: "secondary",
};

export function RecentActivity() {
  const { data: announcements = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["announcements", "dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, summary, category, pinned, published_at")
        .eq("status", "published")
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-4">
      <div className="p-5 border-b flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Recent Announcements</h3>
        <Link to="/announcements" className="text-xs text-primary hover:underline">View all →</Link>
      </div>
      <div className="divide-y">
        {isError ? (<p role="alert" className="p-5">Announcements unavailable. <button className="underline text-primary" onClick={() => { void refetch(); }}>Retry</button></p>) : isLoading ? (<p className="p-5" aria-busy="true">Loading announcements…</p>) : announcements.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Megaphone className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No announcements yet</p>
          </div>
        ) : (
          announcements.map((a: any) => (
            <Link to="/announcements" key={a.id} className="block px-5 py-3 hover:bg-secondary/40 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {a.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                    <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                  </div>
                  {a.summary && <p className="text-xs text-muted-foreground truncate mt-0.5">{a.summary}</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {a.published_at ? new Date(a.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                  </p>
                </div>
                {a.category && (
                  <Badge variant={categoryVariant[a.category] ?? "secondary"} className="shrink-0">{a.category}</Badge>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

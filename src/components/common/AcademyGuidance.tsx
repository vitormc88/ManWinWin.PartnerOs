import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Contextual, collapsible link from a workflow screen to the Academy module
 * that teaches it. Read-only — never alters Academy records. Resolves the real
 * module slug at runtime so the link stays valid across environments.
 */
export function AcademyGuidance({
  moduleNumber,
  title,
  points,
  className,
}: {
  moduleNumber: number;
  title: string;
  points: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const { data: slug } = useQuery({
    queryKey: ["academy_module_slug", moduleNumber],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("academy_modules")
        .select("slug")
        .ilike("slug", `module-${moduleNumber}-%`)
        .limit(1)
        .maybeSingle();
      return data?.slug ?? null;
    },
  });

  const href = slug ? `/academy/modules/${slug}` : "/academy";

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="flex-1">Academy guidance — {title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm">
            <Link to={href}>
              Open Module {moduleNumber}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

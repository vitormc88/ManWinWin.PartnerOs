import { useAuth } from "@/contexts/AuthContext";
import { NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Tag, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  {
    to: "/settings/general",
    title: "General Settings",
    description: "Workspace preferences and defaults.",
    icon: SettingsIcon,
    comingSoon: true,
  },
  {
    to: "/settings/pricing",
    title: "Pricing Rules",
    description: "Manage the pricing catalog used by the proposal generator.",
    icon: Tag,
    comingSoon: false,
  },
  {
    to: "/settings/proposals",
    title: "Proposal Settings",
    description: "Templates, payment terms and proposal defaults.",
    icon: FileText,
    comingSoon: true,
  },
];

export default function Settings() {
  const { roles, isLoading } = useAuth();
  const isAdmin = roles.includes("hq_admin");
  const location = useLocation();

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const isIndex = location.pathname === "/settings" || location.pathname === "/settings/";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Settings</span>
        {!isIndex && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">
              {sections.find((s) => location.pathname.startsWith(s.to))?.title ?? ""}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 md:col-span-3">
          <nav className="flex flex-col gap-1">
            {sections.map((s) => {
              const active = location.pathname.startsWith(s.to);
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <s.icon className="h-4 w-4" />
                  <span>{s.title}</span>
                  {s.comingSoon && (
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground">Soon</span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="col-span-12 md:col-span-9">
          {isIndex ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sections.map((s) => (
                <NavLink key={s.to} to={s.to} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <s.icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        {s.comingSoon && (
                          <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{s.description}</CardDescription>
                    </CardContent>
                  </Card>
                </NavLink>
              ))}
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}

export function SettingsComingSoon({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>This section is coming soon.</CardDescription>
      </CardHeader>
    </Card>
  );
}

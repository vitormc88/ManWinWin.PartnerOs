import { useAuth } from "@/contexts/AuthContext";
import { useMyPermissions } from "@/hooks/useUsers";
import { LogOut, UserCog } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  BarChart3,
  BookOpen,
  GraduationCap,
  MessageSquare,
  Megaphone,
  Bell,
  Settings,
  RefreshCcw,
  ChevronLeft,
  Kanban,
  ShieldCheck,
  DollarSign,
  Rocket,
  Award,
  Shield,
  Zap,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

// Map URLs to module keys for permission filtering
const urlToModule: Record<string, string> = {
  "/": "dashboard",
  "/partners": "_admin_only",
  "/clients": "clients",
  "/renewals": "renewals",
  "/analytics": "_admin_only",
  "/pipeline": "pipeline",
  "/deal-registrations": "deal_registrations",
  "/commissions": "commissions",
  "/onboarding": "onboarding",
  "/certifications": "certifications",
  "/tiers": "_admin_only",
  "/performance": "_admin_only",
  "/knowledge": "knowledge_base",
  "/training": "training",
  "/community": "community",
  "/announcements": "announcements",
  "/notifications": "_admin_only",
};

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Partners", url: "/partners", icon: Users },
  { title: "Clients & Licenses", url: "/clients", icon: Building2 },
  { title: "Renewals", url: "/renewals", icon: RefreshCcw },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

const salesNav = [
  { title: "Pipeline", url: "/pipeline", icon: Kanban },
  { title: "Deal Registrations", url: "/deal-registrations", icon: ShieldCheck },
  { title: "Commissions", url: "/commissions", icon: DollarSign },
];

const partnerOpsNav = [
  { title: "Onboarding", url: "/onboarding", icon: Rocket },
  { title: "Certifications", url: "/certifications", icon: Award },
  { title: "Tiers", url: "/tiers", icon: Shield },
  { title: "Performance", url: "/performance", icon: Zap },
];

const resourcesNav = [
  { title: "Knowledge Base", url: "/knowledge", icon: BookOpen },
  { title: "Training", url: "/training", icon: GraduationCap },
];

const communityNav = [
  { title: "Community", url: "/community", icon: MessageSquare },
  { title: "Announcements", url: "/announcements", icon: Megaphone },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

export function AppSidebar() {
  const { profile, roles, signOut } = useAuth();
  const { data: myPerms } = useMyPermissions();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isAdmin = roles.includes("hq_admin");

  const canSee = (url: string) => {
    if (isAdmin) return true;
    const moduleKey = urlToModule[url];
    if (!moduleKey || moduleKey === "_admin_only") return false;
    if (!myPerms || myPerms.length === 0) return false;
    return myPerms.some((p) => p.module_key === moduleKey && p.access_level !== "no_access");
  };

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const renderGroup = (label: string, items: typeof mainNav) => {
    const visible = items.filter(item => canSee(item.url));
    if (visible.length === 0) return null;
    return (
      <SidebarGroup>
        {!collapsed && (
          <SidebarGroupLabel className="text-sidebar-muted uppercase text-[11px] tracking-wider font-medium px-3">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm shrink-0">
              M
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-sidebar-accent-foreground leading-tight">
                  ManWinWin
                </span>
                <span className="text-[11px] text-sidebar-muted leading-tight">
                  PartnerOS
                </span>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggleSidebar}
              className="text-sidebar-muted hover:text-sidebar-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1.5">
        {renderGroup("Main", mainNav)}
        {renderGroup("Sales CRM", salesNav)}
        {renderGroup("Partner Ops", partnerOpsNav)}
        {renderGroup("Resources", resourcesNav)}
        {renderGroup("Engage", communityNav)}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/users")}>
                <NavLink
                  to="/users"
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <UserCog className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span>User Management</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <Settings className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-md bg-sidebar-accent">
            <div className="h-7 w-7 rounded-full bg-sidebar-primary flex items-center justify-center text-[11px] font-semibold text-sidebar-primary-foreground shrink-0">
              {(profile?.full_name || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium text-sidebar-accent-foreground truncate">
                {profile?.full_name || "User"}
              </span>
              <span className="text-[11px] text-sidebar-muted truncate">
                {roles[0]?.replace("_", " ") || "No role"}
              </span>
            </div>
            <button onClick={signOut} className="text-sidebar-muted hover:text-sidebar-foreground transition-colors shrink-0" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

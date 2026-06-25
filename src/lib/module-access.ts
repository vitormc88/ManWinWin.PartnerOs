export type ModuleAccessLevel = "no_access" | "view" | "edit" | "admin";

export type ModulePermissionEntry = {
  module_key: string;
  access_level: string;
};

export const MODULE_KEYS_LIST = [
  "dashboard",
  "tasks",
  "partners",
  "clients",
  "renewals",
  "pipeline",
  "incoming_leads",
  "deal_registrations",
  "commissions",
  "onboarding",
  "certifications",
  "knowledge_base",
  "training",
  "announcements",
  "community",
  "notifications",
  "analytics",
  "tiers",
  "performance",
  "settings",
  "user_management",
] as const;

export const MODULE_LABELS: Record<(typeof MODULE_KEYS_LIST)[number], string> = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  partners: "Partners",
  clients: "Clients & Licenses",
  renewals: "Renewals",
  pipeline: "Pipeline",
  incoming_leads: "Incoming Leads",
  deal_registrations: "Deal Registrations",
  commissions: "Commissions",
  onboarding: "Onboarding",
  certifications: "Certifications",
  knowledge_base: "Knowledge Base",
  training: "Training",
  announcements: "Announcements",
  community: "Community",
  notifications: "Notifications",
  analytics: "Analytics",
  tiers: "Tiers",
  performance: "Performance",
  settings: "Settings",
  user_management: "User Management",
};

export const INTERNAL_ONLY_MODULES = new Set<string>([
  "partners",
  "analytics",
  "tiers",
  "performance",
  "settings",
  "user_management",
]);

type RouteModule = {
  prefix: string;
  path: string;
  moduleKey: (typeof MODULE_KEYS_LIST)[number];
};

const ROOT_ROUTE_MODULE: RouteModule = {
  prefix: "/",
  path: "/",
  moduleKey: "dashboard",
};

const ROUTE_MODULES: RouteModule[] = [
  { prefix: "/dashboard", path: "/", moduleKey: "dashboard" },
  { prefix: "/partners", path: "/partners", moduleKey: "partners" },
  { prefix: "/clients", path: "/clients", moduleKey: "clients" },
  { prefix: "/renewals", path: "/renewals", moduleKey: "renewals" },
  { prefix: "/pipeline", path: "/pipeline", moduleKey: "pipeline" },
  { prefix: "/deals", path: "/pipeline", moduleKey: "pipeline" },
  { prefix: "/incoming-leads", path: "/incoming-leads", moduleKey: "incoming_leads" },
  { prefix: "/deal-registrations", path: "/deal-registrations", moduleKey: "deal_registrations" },
  { prefix: "/commissions", path: "/commissions", moduleKey: "commissions" },
  { prefix: "/onboarding", path: "/onboarding", moduleKey: "onboarding" },
  { prefix: "/certifications", path: "/certifications", moduleKey: "certifications" },
  { prefix: "/knowledge", path: "/knowledge", moduleKey: "knowledge_base" },
  { prefix: "/training", path: "/training", moduleKey: "training" },
  { prefix: "/announcements", path: "/announcements", moduleKey: "announcements" },
  { prefix: "/community", path: "/community", moduleKey: "community" },
  { prefix: "/notifications", path: "/notifications", moduleKey: "notifications" },
  { prefix: "/analytics", path: "/analytics", moduleKey: "analytics" },
  { prefix: "/tiers", path: "/tiers", moduleKey: "tiers" },
  { prefix: "/performance", path: "/performance", moduleKey: "performance" },
  { prefix: "/settings", path: "/settings", moduleKey: "settings" },
  { prefix: "/users", path: "/users", moduleKey: "user_management" },
];

export const FALLBACK_MODULE_ORDER: Array<Pick<RouteModule, "path" | "moduleKey">> = [
  { path: "/", moduleKey: "dashboard" },
  { path: "/clients", moduleKey: "clients" },
  { path: "/pipeline", moduleKey: "pipeline" },
  { path: "/incoming-leads", moduleKey: "incoming_leads" },
  { path: "/renewals", moduleKey: "renewals" },
  { path: "/deal-registrations", moduleKey: "deal_registrations" },
  { path: "/commissions", moduleKey: "commissions" },
  { path: "/onboarding", moduleKey: "onboarding" },
  { path: "/certifications", moduleKey: "certifications" },
  { path: "/knowledge", moduleKey: "knowledge_base" },
  { path: "/training", moduleKey: "training" },
  { path: "/announcements", moduleKey: "announcements" },
  { path: "/community", moduleKey: "community" },
  { path: "/partners", moduleKey: "partners" },
  { path: "/analytics", moduleKey: "analytics" },
  { path: "/notifications", moduleKey: "notifications" },
  { path: "/tiers", moduleKey: "tiers" },
  { path: "/performance", moduleKey: "performance" },
  { path: "/settings", moduleKey: "settings" },
];

export function getRouteModule(pathname: string) {
  if (pathname === "/") return ROOT_ROUTE_MODULE;

  return ROUTE_MODULES.find(
    (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)
  );
}

export function hasModuleAccess(
  permissions: ModulePermissionEntry[],
  moduleKey: string,
  options?: { isPartnerUser?: boolean }
) {
  if (options?.isPartnerUser && INTERNAL_ONLY_MODULES.has(moduleKey)) {
    return false;
  }

  return permissions.some(
    (permission) => permission.module_key === moduleKey && permission.access_level !== "no_access"
  );
}

export function getFirstAllowedModule(
  permissions: ModulePermissionEntry[],
  options?: { isPartnerUser?: boolean }
) {
  return FALLBACK_MODULE_ORDER.find((module) =>
    hasModuleAccess(permissions, module.moduleKey, options)
  );
}
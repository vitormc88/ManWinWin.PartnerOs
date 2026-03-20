export type PartnerStatus = "Active" | "Inactive" | "Ghosting" | "Negotiation";
export type PartnerLevel = "Strategic Connector" | "Reseller" | "Implementer";
export type HealthScore = "Excellent" | "Good" | "At Risk" | "Critical";

export interface Partner {
  id: string;
  company: string;
  country: string;
  level: PartnerLevel;
  status: PartnerStatus;
  startDate: string;
  manager: string;
  clients: number;
  revenue: number;
  pipeline: number;
  lastActivity: string;
  healthScore: HealthScore;
  engagementScore: number;
  contacts: { name: string; role: string; email: string }[];
}

export const partners: Partner[] = [
  {
    id: "1",
    company: "Iberian Solutions Lda",
    country: "Portugal",
    level: "Implementer",
    status: "Active",
    startDate: "2021-03-15",
    manager: "Carlos Mendes",
    clients: 24,
    revenue: 187400,
    pipeline: 94200,
    lastActivity: "2026-03-18",
    healthScore: "Excellent",
    engagementScore: 92,
    contacts: [
      { name: "João Ferreira", role: "CEO", email: "joao@iberian.pt" },
      { name: "Ana Costa", role: "Sales Director", email: "ana@iberian.pt" },
    ],
  },
  {
    id: "2",
    company: "Nordic Maintenance AB",
    country: "Sweden",
    level: "Reseller",
    status: "Active",
    startDate: "2022-08-01",
    manager: "Sofia Lindgren",
    clients: 12,
    revenue: 95600,
    pipeline: 42000,
    lastActivity: "2026-03-15",
    healthScore: "Good",
    engagementScore: 74,
    contacts: [
      { name: "Erik Johansson", role: "Managing Director", email: "erik@nordicm.se" },
    ],
  },
  {
    id: "3",
    company: "LATAM Industrial Group",
    country: "Brazil",
    level: "Strategic Connector",
    status: "Active",
    startDate: "2023-01-10",
    manager: "Carlos Mendes",
    clients: 8,
    revenue: 62300,
    pipeline: 128000,
    lastActivity: "2026-03-12",
    healthScore: "Good",
    engagementScore: 68,
    contacts: [
      { name: "Ricardo Silva", role: "Partner Lead", email: "ricardo@latamig.com.br" },
      { name: "Mariana Santos", role: "Technical Manager", email: "mariana@latamig.com.br" },
    ],
  },
  {
    id: "4",
    company: "Gulf Tech Services LLC",
    country: "UAE",
    level: "Reseller",
    status: "Negotiation",
    startDate: "2025-11-20",
    manager: "Sofia Lindgren",
    clients: 0,
    revenue: 0,
    pipeline: 215000,
    lastActivity: "2026-03-10",
    healthScore: "Good",
    engagementScore: 55,
    contacts: [
      { name: "Ahmed Al-Rashid", role: "CEO", email: "ahmed@gulftech.ae" },
    ],
  },
  {
    id: "5",
    company: "Midwest Facilities Corp",
    country: "United States",
    level: "Implementer",
    status: "Ghosting",
    startDate: "2022-05-22",
    manager: "Carlos Mendes",
    clients: 6,
    revenue: 34200,
    pipeline: 0,
    lastActivity: "2025-12-03",
    healthScore: "Critical",
    engagementScore: 18,
    contacts: [
      { name: "Sarah Mitchell", role: "VP Partnerships", email: "sarah@midwestfc.com" },
    ],
  },
  {
    id: "6",
    company: "Afrique Maintenance SARL",
    country: "Morocco",
    level: "Strategic Connector",
    status: "Active",
    startDate: "2024-02-14",
    manager: "Sofia Lindgren",
    clients: 3,
    revenue: 18700,
    pipeline: 67000,
    lastActivity: "2026-03-17",
    healthScore: "Good",
    engagementScore: 71,
    contacts: [
      { name: "Youssef Benhaddou", role: "Director", email: "youssef@afriquem.ma" },
    ],
  },
  {
    id: "7",
    company: "Balkan Engineering d.o.o.",
    country: "Serbia",
    level: "Reseller",
    status: "Inactive",
    startDate: "2021-09-08",
    manager: "Carlos Mendes",
    clients: 2,
    revenue: 8400,
    pipeline: 0,
    lastActivity: "2025-08-19",
    healthScore: "At Risk",
    engagementScore: 22,
    contacts: [
      { name: "Nikola Petrović", role: "Owner", email: "nikola@balkaneng.rs" },
    ],
  },
  {
    id: "8",
    company: "Asia Pacific CMMS Pte",
    country: "Singapore",
    level: "Implementer",
    status: "Active",
    startDate: "2023-06-01",
    manager: "Sofia Lindgren",
    clients: 15,
    revenue: 142800,
    pipeline: 78000,
    lastActivity: "2026-03-19",
    healthScore: "Excellent",
    engagementScore: 88,
    contacts: [
      { name: "Wei Lin Tan", role: "Regional Director", email: "weilin@apcmms.sg" },
      { name: "Priya Nair", role: "Operations", email: "priya@apcmms.sg" },
    ],
  },
];

export const revenueByMonth = [
  { month: "Oct", revenue: 42000, pipeline: 68000 },
  { month: "Nov", revenue: 48000, pipeline: 72000 },
  { month: "Dec", revenue: 38000, pipeline: 58000 },
  { month: "Jan", revenue: 52000, pipeline: 81000 },
  { month: "Feb", revenue: 61000, pipeline: 95000 },
  { month: "Mar", revenue: 57000, pipeline: 88000 },
];

export const revenueByCountry = [
  { country: "Portugal", revenue: 187400 },
  { country: "Singapore", revenue: 142800 },
  { country: "Sweden", revenue: 95600 },
  { country: "Brazil", revenue: 62300 },
  { country: "United States", revenue: 34200 },
  { country: "Morocco", revenue: 18700 },
  { country: "Serbia", revenue: 8400 },
];

export const announcements = [
  { id: "1", title: "ManWinWin v6.2 Released", date: "2026-03-18", type: "Product" as const },
  { id: "2", title: "Q1 Partner Awards Announced", date: "2026-03-15", type: "Event" as const },
  { id: "3", title: "New Implementation Guide Available", date: "2026-03-12", type: "Resource" as const },
];

import { mockClients, mockContracts, mockLicenses, partnerRenewalSettings, defaultRenewalSettings } from "./clients-mock-data";

export type RenewalWorkflowStatus = "Upcoming" | "Due Soon" | "In Negotiation" | "Quoted" | "Won" | "Lost" | "Expired";
export type RenewalType = "License" | "SAT" | "Contract";
export type RenewalPriority = "Critical" | "High" | "Medium" | "Low";

export interface RenewalRecord {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  partnerId: string;
  partnerName: string;
  contractId?: string;
  licenseId?: string;
  renewalType: RenewalType;
  renewalDate: string;
  alertWindowDays: number;
  status: RenewalWorkflowStatus;
  estimatedValue: number;
  finalValue?: number;
  assignedOwner: string;
  lastInteraction: string;
  notes: string;
  priority: RenewalPriority;
  daysUntil: number;
  country: string;
}

export interface RenewalActivity {
  id: string;
  renewalId: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  performedBy: string;
  notes: string;
  createdAt: string;
}

function getDaysUntil(date: string): number {
  if (!date) return 999;
  return Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

function getPriority(days: number): RenewalPriority {
  if (days < 0) return "Critical";
  if (days <= 30) return "High";
  if (days <= 60) return "Medium";
  return "Low";
}

function getStatus(days: number, isInactive: boolean): RenewalWorkflowStatus {
  if (isInactive) return "Expired";
  if (days < 0) return "Expired";
  if (days <= 30) return "Due Soon";
  if (days <= 90) return "Upcoming";
  return "Upcoming";
}

function getAlertWindow(partnerId: string): number {
  const setting = partnerRenewalSettings.find(s => s.partnerId === partnerId);
  return setting ? setting.yellowDays : defaultRenewalSettings.yellowDays;
}

// Generate renewal records from clients, licenses, and contracts
export function generateRenewals(): RenewalRecord[] {
  const renewals: RenewalRecord[] = [];
  let counter = 1;

  for (const client of mockClients) {
    if (client.isInactive && !client.renewalDate) continue;

    // License renewal
    if (client.renewalDate) {
      const days = getDaysUntil(client.renewalDate);
      renewals.push({
        id: `r${counter++}`,
        clientId: client.id,
        clientName: client.commercialName,
        clientCode: client.clientCode,
        partnerId: client.partnerId,
        partnerName: client.partnerName,
        renewalType: "License",
        renewalDate: client.renewalDate,
        alertWindowDays: getAlertWindow(client.partnerId),
        status: client.id === "c5" ? "In Negotiation" : client.id === "c2" ? "Quoted" : getStatus(days, client.isInactive),
        estimatedValue: client.contractValue,
        assignedOwner: client.accountManager,
        lastInteraction: "2026-03-18",
        notes: client.observations,
        priority: getPriority(days),
        daysUntil: days,
        country: client.country,
      });
    }

    // SAT renewal (if different from license)
    if (client.satEndDate && client.satEndDate !== client.renewalDate) {
      const days = getDaysUntil(client.satEndDate);
      renewals.push({
        id: `r${counter++}`,
        clientId: client.id,
        clientName: client.commercialName,
        clientCode: client.clientCode,
        partnerId: client.partnerId,
        partnerName: client.partnerName,
        renewalType: "SAT",
        renewalDate: client.satEndDate,
        alertWindowDays: getAlertWindow(client.partnerId),
        status: getStatus(days, client.isInactive),
        estimatedValue: Math.round(client.contractValue * 0.25),
        assignedOwner: client.accountManager,
        lastInteraction: "2026-03-15",
        notes: "",
        priority: getPriority(days),
        daysUntil: days,
        country: client.country,
      });
    }

    // Contract renewal (if different)
    if (client.contractEndDate && client.contractEndDate !== client.renewalDate) {
      const days = getDaysUntil(client.contractEndDate);
      renewals.push({
        id: `r${counter++}`,
        clientId: client.id,
        clientName: client.commercialName,
        clientCode: client.clientCode,
        partnerId: client.partnerId,
        partnerName: client.partnerName,
        renewalType: "Contract",
        renewalDate: client.contractEndDate,
        alertWindowDays: getAlertWindow(client.partnerId),
        status: getStatus(days, client.isInactive),
        estimatedValue: client.contractValue,
        assignedOwner: client.accountManager,
        lastInteraction: "2026-03-12",
        notes: "",
        priority: getPriority(days),
        daysUntil: days,
        country: client.country,
      });
    }
  }

  return renewals.sort((a, b) => a.daysUntil - b.daysUntil);
}

export const mockRenewals = generateRenewals();

export const mockRenewalActivities: RenewalActivity[] = [
  { id: "ra1", renewalId: "r1", action: "Status changed", fromStatus: "Upcoming", toStatus: "Due Soon", performedBy: "Ana Costa", notes: "Renewal approaching, contacted client", createdAt: "2026-03-15T10:00:00Z" },
  { id: "ra2", renewalId: "r3", action: "Quote sent", fromStatus: "Due Soon", toStatus: "Quoted", performedBy: "Ana Costa", notes: "Sent renewal quote with 2.5% increase", createdAt: "2026-03-16T14:30:00Z" },
  { id: "ra3", renewalId: "r5", action: "Negotiation started", fromStatus: "Due Soon", toStatus: "In Negotiation", performedBy: "Erik Johansson", notes: "SSAB requesting price freeze discussion", createdAt: "2026-03-14T09:00:00Z" },
  { id: "ra4", renewalId: "r8", action: "Status changed", fromStatus: "Upcoming", toStatus: "Expired", performedBy: "System", notes: "Renewal date passed without action", createdAt: "2026-03-01T00:00:00Z" },
];

// Notification data
export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: "warning" | "danger" | "info" | "success";
  category: string;
  partnerId?: string;
  clientId?: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

export const mockNotifications: NotificationRecord[] = [
  { id: "n1", title: "SSAB renewal in 5 days", message: "License renewal for SSAB Special Steels is due on March 25. Currently in negotiation.", type: "danger", category: "renewal", partnerId: "2", clientId: "c5", isRead: false, actionUrl: "/renewals", createdAt: "2026-03-20T08:00:00Z" },
  { id: "n2", title: "Tyson Foods renewal overdue", message: "License renewal expired on Feb 28. Partner Midwest Facilities Corp not responding.", type: "danger", category: "renewal", partnerId: "5", clientId: "c9", isRead: false, actionUrl: "/renewals", createdAt: "2026-03-20T08:00:00Z" },
  { id: "n3", title: "Sonae MC renewal approaching", message: "Renewal due April 10. Quote has been sent. Awaiting client confirmation.", type: "warning", category: "renewal", partnerId: "1", clientId: "c2", isRead: false, actionUrl: "/renewals", createdAt: "2026-03-19T10:00:00Z" },
  { id: "n4", title: "5 renewals due in next 60 days", message: "Multiple client renewals approaching across partners. Review pipeline.", type: "info", category: "summary", isRead: false, actionUrl: "/renewals", createdAt: "2026-03-18T08:00:00Z" },
  { id: "n5", title: "Partner Midwest Facilities at risk", message: "No activity from Midwest Facilities Corp since December 2025. 1 overdue renewal.", type: "warning", category: "partner", partnerId: "5", isRead: true, actionUrl: "/partners/5", createdAt: "2026-03-17T08:00:00Z" },
  { id: "n6", title: "NIS contract expired", message: "Contract for NIS a.d. Novi Sad expired on Nov 1, 2025. Client marked inactive.", type: "danger", category: "renewal", partnerId: "7", clientId: "c10", isRead: true, actionUrl: "/clients/c10", createdAt: "2026-03-15T08:00:00Z" },
  { id: "n7", title: "Petrobras SCADA Phase 2 SOW", message: "SCADA integration Phase 2 SOW draft expected Q3 2026. Track with Ricardo Silva.", type: "info", category: "operational", partnerId: "3", clientId: "c6", isRead: true, actionUrl: "/clients/c6", createdAt: "2026-03-12T14:00:00Z" },
  { id: "n8", title: "Q1 revenue target exceeded", message: "Total partner revenue for Q1 2026 has exceeded target by 8.3%.", type: "success", category: "performance", isRead: true, createdAt: "2026-03-10T09:00:00Z" },
];

// Analytics helper data
export const monthlyRevenue = [
  { month: "Jul '25", revenue: 38200, pipeline: 62000, renewals: 4, newBusiness: 18200 },
  { month: "Aug '25", revenue: 41500, pipeline: 58000, renewals: 3, newBusiness: 22500 },
  { month: "Sep '25", revenue: 45800, pipeline: 71000, renewals: 5, newBusiness: 15800 },
  { month: "Oct '25", revenue: 42000, pipeline: 68000, renewals: 3, newBusiness: 24000 },
  { month: "Nov '25", revenue: 48000, pipeline: 72000, renewals: 6, newBusiness: 18000 },
  { month: "Dec '25", revenue: 38000, pipeline: 58000, renewals: 2, newBusiness: 16000 },
  { month: "Jan '26", revenue: 52000, pipeline: 81000, renewals: 4, newBusiness: 28000 },
  { month: "Feb '26", revenue: 61000, pipeline: 95000, renewals: 5, newBusiness: 31000 },
  { month: "Mar '26", revenue: 57000, pipeline: 88000, renewals: 4, newBusiness: 25000 },
];

export const partnerPerformance = [
  { partner: "Iberian Solutions", revenue: 187400, clients: 24, deals: 8, avgDeal: 23425, growth: 12.3, target: 180000 },
  { partner: "Asia Pacific CMMS", revenue: 142800, clients: 15, deals: 6, avgDeal: 23800, growth: 18.7, target: 130000 },
  { partner: "Nordic Maintenance", revenue: 95600, clients: 12, deals: 5, avgDeal: 19120, growth: 8.1, target: 100000 },
  { partner: "LATAM Industrial", revenue: 62300, clients: 8, deals: 3, avgDeal: 20767, growth: 24.5, target: 55000 },
  { partner: "Midwest Facilities", revenue: 34200, clients: 6, deals: 2, avgDeal: 17100, growth: -15.2, target: 50000 },
  { partner: "Afrique Maintenance", revenue: 18700, clients: 3, deals: 2, avgDeal: 9350, growth: 45.0, target: 15000 },
  { partner: "Balkan Engineering", revenue: 8400, clients: 2, deals: 1, avgDeal: 8400, growth: -32.0, target: 20000 },
];

export const revenueByProduct = [
  { product: "Business", revenue: 361500, clients: 7, pct: 65 },
  { product: "Professional", revenue: 104400, clients: 4, pct: 19 },
  { product: "KeepIT", revenue: 33500, clients: 2, pct: 6 },
  { product: "UseIT", revenue: 13600, clients: 2, pct: 2 },
  { product: "Express", revenue: 8200, clients: 3, pct: 1 },
];

export const renewalAnalytics = {
  successRate: 87.5,
  avgTimeToClose: 18,
  renewalRevenue: 389200,
  newBusinessRevenue: 160200,
  lostRenewals: 3,
  totalRenewals: 24,
  wonRenewals: 21,
  avgDelay: 4.2,
};

export const salesPerformance = [
  { salesperson: "Ana Costa", revenue: 103600, deals: 5, conversion: 83, target: 100000, clients: 8 },
  { salesperson: "Erik Johansson", revenue: 96500, deals: 4, conversion: 80, target: 100000, clients: 5 },
  { salesperson: "Wei Lin Tan", revenue: 142800, deals: 6, conversion: 86, target: 130000, clients: 7 },
  { salesperson: "Ricardo Silva", revenue: 163000, deals: 3, conversion: 75, target: 150000, clients: 4 },
  { salesperson: "Youssef Benhaddou", revenue: 18700, deals: 2, conversion: 67, target: 25000, clients: 2 },
  { salesperson: "Carlos Mendes", revenue: 52000, deals: 2, conversion: 100, target: 50000, clients: 2 },
];

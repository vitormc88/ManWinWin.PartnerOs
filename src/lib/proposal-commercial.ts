import type { Proposal, ProposalItem, ProposalDiscountScope, ProposalLanguage, ProposalPlan } from "@/types/proposal";
import type { ProposalTotals } from "@/lib/proposal-engine";
import { formatEuro, frequencyLabel, t } from "@/lib/proposal-i18n";
import { enrichProposalItem, getItemBaseTotal, getItemDiscountAmount, getItemNetTotal, getItemRenewalValue, hasItemOwnDiscount } from "@/lib/proposal-engine";

type LocalizedSet = Record<"EN" | "PT" | "ES", string>;

const shortLabels = {
  maintenanceModule: { EN: "Maintenance & Costs Module", PT: "Módulo de Manutenção & Custos", ES: "Módulo de Mantenimiento y Costos" },
  stockModule: { EN: "Stock Management Module", PT: "Módulo de Gestão de Stocks", ES: "Módulo de Gestión de Stock" },
  purchaseOrdersModule: { EN: "Purchase Orders Module", PT: "Módulo de Ordens de Compra", ES: "Módulo de Órdenes de Compra" },
  pluginImportTool: { EN: "Import Tool Plugin", PT: "Plugin Import Tool", ES: "Plugin Import Tool" },
  pluginWorkflow: { EN: "Workflow Email Notifications Plugin", PT: "Plugin Workflow / Notificações por e-mail", ES: "Plugin Workflow / Notificaciones por e-mail" },
  pluginAdvancedReports: { EN: "Advanced Reports Plugin", PT: "Plugin Relatórios Avançados", ES: "Plugin Informes Avanzados" },
  pluginSLA: { EN: "SLA Plugin", PT: "Plugin SLA", ES: "Plugin SLA" },
  apiManwinwin: { EN: "API ManWinWin", PT: "API ManWinWin", ES: "API ManWinWin" },
  backofficeAccess: { EN: "1 BackOffice access", PT: "1 acesso BackOffice", ES: "1 acceso BackOffice" },
  webAccess: { EN: "1 Web/Mobile access", PT: "1 acesso Web/Mobile", ES: "1 acceso Web/Mobile" },
  requestsModule: { EN: "Maintenance Requests Module", PT: "Módulo de Pedidos de Manutenção", ES: "Módulo de Solicitudes de Mantenimiento" },
  additionalWebUsers: { EN: "Additional Web/Mobile users", PT: "Utilizadores Web/Mobile adicionais", ES: "Usuarios Web/Mobile adicionales" },
  softwareSubtotal: { EN: "Software subtotal", PT: "Subtotal software", ES: "Subtotal software" },
  servicesSubtotal: { EN: "Services subtotal", PT: "Subtotal serviços", ES: "Subtotal servicios" },
} satisfies Record<string, LocalizedSet>;

function pick(lang: ProposalLanguage, labels: LocalizedSet) {
  return labels[(lang === "PT" || lang === "ES" ? lang : "EN") as "EN" | "PT" | "ES"];
}

export function getCommercialIncludes(plan: ProposalPlan, language: ProposalLanguage, includeRequests: boolean, webUsers: number) {
  const list = [
    pick(language, shortLabels.maintenanceModule),
    ...(plan >= 2 ? [pick(language, shortLabels.stockModule), pick(language, shortLabels.purchaseOrdersModule)] : []),
    ...(plan === 3
      ? [
          pick(language, shortLabels.pluginImportTool),
          pick(language, shortLabels.pluginWorkflow),
          pick(language, shortLabels.pluginAdvancedReports),
          pick(language, shortLabels.pluginSLA),
          pick(language, shortLabels.apiManwinwin),
        ]
      : []),
    pick(language, shortLabels.backofficeAccess),
    pick(language, shortLabels.webAccess),
    ...(includeRequests ? [pick(language, shortLabels.requestsModule)] : []),
    ...(webUsers > 0 ? [`${pick(language, shortLabels.additionalWebUsers)}: ${webUsers}`] : []),
  ];

  const optional = includeRequests ? [] : [pick(language, shortLabels.requestsModule)];
  return { included: list, optional };
}

export function getCommercialItemLabel(item: ProposalItem, proposal: Proposal) {
  const lang = proposal.language;
  const s = t(lang);
  switch (item.item_code) {
    case "plan_1_annual":
    case "plan_2_annual":
    case "plan_3_annual":
      return s.planAnnualLicense(proposal.plan);
    case "requests_module":
      return s.requestsModuleShort;
    case "web_user":
      return s.webUsersAdditionalLabel(item.qty);
    case "impl_online_p1":
    case "impl_online_p2":
    case "impl_online_p3":
      return s.onlineImplementationLabel(proposal.plan);
    case "impl_light_p1":
    case "impl_light_p2":
    case "impl_light_p3":
      return s.lightImplementationLabel(proposal.plan);
    case "impl_requests":
      return s.requestsImplementationLabel;
    case "onsite_per_diem":
      return s.onsiteDaysLabel(item.qty);
    default:
      return item.item_name;
  }
}

export function getCommercialRows(items: ProposalItem[], proposal: Proposal) {
  const softwarePct = Number(proposal.software_discount_pct || 0);
  const servicesPct = Number(proposal.services_discount_pct || 0);
  const software = items.filter((item) => item.category === "software" || item.category === "addon");
  const services = items.filter((item) => item.category === "service" || (item.category === "custom" && !item.is_recurring));
  const recurring = items.filter((item) => item.is_recurring);

  const toRow = (item: ProposalItem) => {
    const enriched = enrichProposalItem(item, softwarePct, servicesPct);
    const sectionPct = item.is_recurring ? softwarePct : servicesPct;
    const base = enriched.gross_total || getItemBaseTotal(item);
    const discount = enriched.discount_amount || getItemDiscountAmount(item, sectionPct);
    const net = enriched.net_total || getItemNetTotal(item, sectionPct);
    const hasDiscount = discount > 0;

    return {
      item: enriched,
      label: getCommercialItemLabel(item, proposal),
      value: formatEuro(net, proposal.language),
      baseValue: formatEuro(base, proposal.language),
      discountValue: formatEuro(discount, proposal.language),
      hasDiscount,
      suffix: item.is_recurring ? frequencyLabel("yearly", proposal.language) : frequencyLabel(item.frequency, proposal.language),
      discountLabel:
        hasItemOwnDiscount(enriched)
          ? `${getCommercialItemLabel(item, proposal)} discount`
          : item.is_recurring
          ? t(proposal.language).softwareDiscountLabel(sectionPct)
          : t(proposal.language).servicesDiscountLabel(sectionPct),
    };
  };

  /** Recurring rows for Year 2+ display: value uses renewal logic. */
  const toRenewalRow = (item: ProposalItem) => {
    const enriched = enrichProposalItem(item, softwarePct, servicesPct);
    const renewal = getItemRenewalValue(item, softwarePct, servicesPct);
    const gross = enriched.gross_total || getItemBaseTotal(item);
    const discounted = Boolean(item.apply_discount_to_renewal) && renewal < gross;
    return {
      item: enriched,
      label: getCommercialItemLabel(item, proposal),
      value: formatEuro(renewal, proposal.language),
      grossValue: formatEuro(gross, proposal.language),
      discounted,
      suffix: frequencyLabel("yearly", proposal.language),
    };
  };

  return {
    software,
    services,
    recurring,
    softwareLines: software.map(toRow),
    serviceLines: services.map(toRow),
    recurringLines: recurring.map(toRow),
    renewalLines: recurring.map(toRenewalRow),
  };
}

export function getDiscountLabel(scope: ProposalDiscountScope, pct: number, language: ProposalLanguage) {
  const s = t(language);
  if (scope === "services") return s.servicesDiscountLabel(pct);
  if (scope === "software") return s.softwareDiscountLabel(pct);
  if (scope === "total") return s.totalDiscountLabel(pct);
  return s.noDiscount;
}

export function getInvestmentSummary(proposal: Proposal, items: ProposalItem[], totals: ProposalTotals) {
  const lang = proposal.language;
  const rows = getCommercialRows(items, proposal);
  return {
    softwareLines: rows.softwareLines,
    serviceLines: rows.serviceLines,
    recurringLines: rows.recurringLines,
    renewalLines: rows.renewalLines,
    softwareSubtotalLabel: pick(lang, shortLabels.softwareSubtotal),
    servicesSubtotalLabel: pick(lang, shortLabels.servicesSubtotal),
    discountLabel: totals.servicesDiscountAmount > 0 ? t(lang).servicesDiscountLabel(Number(proposal.services_discount_pct || 0)) : t(lang).softwareDiscountLabel(Number(proposal.software_discount_pct || 0)),
  };
}
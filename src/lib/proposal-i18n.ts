import type { ProposalLanguage } from "@/types/proposal";

interface Strings {
  investmentProposal: string;
  forImplementation: string;
  professional: string;
  /** "ManWinWin Professional annual license — Plan X with:" */
  annualLicenseDescription: (plan: number) => string;
  with: string;
  backofficeAccess: string;
  webAccess: string;
  includes: string;
  optionalNotIncluded: string;
  maintenanceModule: string;
  stockModule: string;
  purchaseOrdersModule: string;
  pluginsLabel: string;
  pluginImportTool: string;
  pluginWorkflow: string;
  pluginAdvancedReports: string;
  pluginSLA: string;
  apiManwinwin: string;
  requestsModuleDesc: string;
  webAdditionalDesc: string;
  annualLicenseHeading: (plan: number, hosting: string) => string;
  annualLicensePrice: string;
  satIncluded: string;
  services: string;
  implementation: string;
  implOnlineLine: (price: string) => string;
  implIncludes: (hours: number) => string;
  investmentInProject: string;
  year1: string;
  year2Onwards: string;
  totalOfYear: string;
  totalPerYear: string;
  software: string;
  satShort: string;
  onlineImplService: string;
  onsiteImplService: string;
  lightImplService: string;
  rciImplService: string;
  additionalWebUsers: string;
  workRequestsModule: string;
  perYear: string;
  perUserMonth: string;
  /** "BILLING AND PAYMENT CONDITIONS" */
  billingHeader: string;
  standardTerms: string;
  paymentLine1: string;
  paymentLine2: string;
  footnote1: string;
  footnote2: string;
  otherInfo: string;
  vatNote: string;
  validityNote: (days: number) => string;
  saasFeatures: string;
  saasFeaturesList: string[];
  satTitle: string;
  satList: string[];
  restricted: string;
  assumingSameYear1: string;
  perDiem: string;
  onsiteDays: string;
  discount: string;
  noDiscount: string;
  discountAppliesTo: string;
  discountScopeNone: string;
  discountScopeServices: string;
  discountScopeSoftware: string;
  discountScopeTotal: string;
  servicesDiscountLabel: (pct: number) => string;
  softwareDiscountLabel: (pct: number) => string;
  servicesDiscountsTotalLabel: string;
  softwareDiscountsTotalLabel: string;
  sectionDiscountLabel: (pct: number) => string;
  totalDiscountLabel: (pct: number) => string;
  notes: string;
  /** Table column labels (PDF) */
  colItem: string;
  colQty: string;
  colUnit: string;
  colTotal: string;
  colFrequency: string;
  colGross: string;
  colNet: string;
  /** Subtotal label builders */
  grossSubtotal: (sectionTitle: string) => string;
  netSubtotal: (sectionTitle: string) => string;
  sectionSubtotal: (sectionTitle: string) => string;
  /** Commercial item labels */
  planAnnualLicense: (plan: number) => string;
  onlineImplementationLabel: (plan: number) => string;
  lightImplementationLabel: (plan: number) => string;
  requestsImplementationLabel: string;
  requestsModuleShort: string;
  webUsersAdditionalLabel: (qty: number) => string;
  onsiteDaysLabel: (qty: number) => string;
  /** Misc */
  client: string;
  date: string;
  project: string;
  validity: string;
  country: string;
  versionLabel: string;
  daysWord: string;
  /** Renewal-related labels */
  renewalValue: string;
  renewalDiscountApplied: string;
  discountsYear1OnlyNote: string;
  /** Language fallback warning */
  langFallbackWarning: (target: string) => string;
}

const EN: Strings = {
  investmentProposal: "Investment Proposal",
  forImplementation: "FOR THE IMPLEMENTATION PROJECT OF THE MANWINWIN MAINTENANCE SOFTWARE",
  professional: "ManWinWin Professional",
  annualLicenseDescription: (plan) => `ManWinWin Professional annual license — Plan ${plan} with:`,
  with: "with",
  backofficeAccess: "1 (one) BackOffice access (simultaneous – allows multiple users)",
  webAccess: "1 (one) ManWinWin WEB / Mobility access (possibility to add more)",
  includes: "Includes",
  optionalNotIncluded: "Optional (Not Included):",
  maintenanceModule:
    "Maintenance & Costs Module, which will allow you to manage assets, work orders, costs, KPIs and reports in an integrated multilingual interface.",
  stockModule: "Stock Management Module — full inventory control linked to maintenance.",
  purchaseOrdersModule: "Purchase Orders Module — request, approve and track purchasing.",
  pluginsLabel: "Plugins:",
  pluginImportTool: "Import Tool — bulk data import.",
  pluginWorkflow: "Workflow Email Notifications — automated alerts.",
  pluginAdvancedReports: "Advanced Reports — extended reporting library.",
  pluginSLA: "SLA — service-level agreement tracking.",
  apiManwinwin: "API ManWinWin — REST API for integrations.",
  requestsModuleDesc:
    "Maintenance Requests Module, which will allow you to centralize all requests and connect directly with the maintenance team.",
  webAdditionalDesc:
    "ManWinWin WEB / Mobility additional accesses that will also give access to the ManWinWin App and ManWinWin SMART TAG.",
  annualLicenseHeading: (plan, hosting) =>
    `ManWinWin Professional annual license (${hosting.toLowerCase()}) – Plan ${plan}`,
  annualLicensePrice: "ManWinWin Professional annual license:",
  satIncluded: "Support & Technical Assistance (S&TA): €0 > included in the Annual License (see details at the end)",
  services: "SERVICES",
  implementation: "IMPLEMENTATION - Consulting and Training Services",
  implOnlineLine: (price) => `Implementation, technical consulting, and training services ONLINE: ${price}`,
  implIncludes: (h) => `Includes: consulting services and user training remotely for a total of ${h} hours.`,
  investmentInProject: "Investment in the project",
  year1: "Year 1",
  year2Onwards: "Year 2 and following*",
  totalOfYear: "Total of the year",
  totalPerYear: "Total per year",
  software: "Software",
  satShort: "Support and Technical Assistance (S&TA)",
  onlineImplService: "Online implementation service",
  onsiteImplService: "Onsite implementation service",
  lightImplService: "Online light implementation service",
  rciImplService: "RCI Professional service",
  additionalWebUsers: "Additional WEB Users",
  workRequestsModule: "Work Requests Module",
  perYear: "per year",
  perUserMonth: "€ / user / month",
  billingHeader: "BILLING AND PAYMENT CONDITIONS",
  standardTerms: "ManWinWin standard terms and conditions:",
  paymentLine1: "50% invoice on the date of award¹, payment in full",
  paymentLine2: "50% invoice on the date of installation², payment within 30 days",
  footnote1: "¹ The start of the implementation project is dependent on payment of the first invoice.",
  footnote2:
    "² The installation date is understood to be the date from which the software is available for access by users via login.",
  otherInfo: "OTHER RELEVANT INFORMATION",
  vatNote: "VAT at the legal rate in force is added to the values presented",
  validityNote: (d) => `This proposal is valid for ${d} (${d}) days`,
  saasFeatures: "Features of the ManWinWin SaaS solution",
  saasFeaturesList: [
    "Remote access to the application via the Internet",
    "High-performance remote server",
    "Server bandwidth of 1000 Mbits/s",
    "System maintenance and updates",
    "Database backups",
    "Permanent system monitoring",
    "Support via email, telephone, or remote assistance for troubleshooting",
  ],
  satTitle: "S&AT – Support & Technical Assistance",
  satList: [
    "A Technical Manager allocated to the customer",
    "Direct contact with the fully dedicated Support Department (Support & technical assistance via e-mail or remote assistance)",
    "Online platform for support requests (Helpdesk)",
    "10% discount on additional purchases (modules and/or additional stations)",
    "30% discount on pre-contracted consulting/training days",
    "20% discount on licensing for companies/facilities of the same group",
    "Software Update and Maintenance",
    "Participation in the evolution of the program (with suggestions for improvement, suggestions for new features, lists, etc...)",
  ],
  restricted: "Restricted",
  assumingSameYear1: "* Assuming same configuration of year 1",
  perDiem: "Onsite per diem",
  onsiteDays: "Onsite days",
  discount: "Discount",
  noDiscount: "No discount",
  discountAppliesTo: "Discount applies to",
  discountScopeNone: "No discount",
  discountScopeServices: "Services only",
  discountScopeSoftware: "Software only",
  discountScopeTotal: "Total proposal",
  servicesDiscountLabel: (pct) => `Services discount (${pct}%)`,
  softwareDiscountLabel: (pct) => `Software discount (${pct}%)`,
  servicesDiscountsTotalLabel: "Services discounts total",
  softwareDiscountsTotalLabel: "Software discounts total",
  sectionDiscountLabel: (pct) => `Section discount ${pct}%`,
  totalDiscountLabel: (pct) => `Total proposal discount (${pct}%)`,
  notes: "Notes",
  colItem: "Item",
  colQty: "Qty",
  colUnit: "Unit price",
  colTotal: "Total",
  colFrequency: "Frequency",
  colGross: "Gross",
  colNet: "Net",
  grossSubtotal: (title) => `${title} gross subtotal`,
  netSubtotal: (title) => `${title} net subtotal`,
  sectionSubtotal: (title) => `${title} subtotal`,
  planAnnualLicense: (plan) => `ManWinWin Professional — Plan ${plan} annual license`,
  onlineImplementationLabel: (plan) => `Online Implementation — Plan ${plan}`,
  lightImplementationLabel: (plan) => `Light Implementation — Plan ${plan}`,
  requestsImplementationLabel: "Maintenance Requests Implementation",
  requestsModuleShort: "Maintenance Requests Module",
  webUsersAdditionalLabel: (qty) => `ManWinWin WEB / Mobility additional accesses (×${qty})`,
  onsiteDaysLabel: (qty) => `Onsite implementation days (×${qty})`,
  client: "Client",
  date: "Date",
  project: "Project",
  validity: "Validity",
  country: "Country",
  versionLabel: "Version",
  daysWord: "days",
  renewalValue: "Renewal",
  renewalDiscountApplied: "Renewal discount applied",
  discountsYear1OnlyNote: "Discounts shown are applied to Year 1 only unless otherwise stated.",
  langFallbackWarning: (target) =>
    `Translations for ${target} are not available yet — proposal will be generated in English.`,
};

const PT: Strings = {
  ...EN,
  investmentProposal: "Proposta de Investimento",
  forImplementation: "PARA O PROJETO DE IMPLEMENTAÇÃO DO SOFTWARE DE MANUTENÇÃO MANWINWIN",
  annualLicenseDescription: (plan) => `Licença anual ManWinWin Professional — Plano ${plan} com:`,
  backofficeAccess: "1 (um) acesso BackOffice (simultâneo – permite múltiplos utilizadores)",
  webAccess: "1 (um) acesso ManWinWin WEB / Mobility (possibilidade de adicionar mais)",
  includes: "Inclui",
  optionalNotIncluded: "Opcional (Não Incluído):",
  maintenanceModule:
    "Módulo de Manutenção & Custos, que permite gerir ativos, ordens de trabalho, custos, KPIs e relatórios numa interface multilingue integrada.",
  stockModule: "Módulo de Gestão de Stocks — controlo de inventário ligado à manutenção.",
  purchaseOrdersModule: "Módulo de Ordens de Compra — pedir, aprovar e rastrear compras.",
  pluginsLabel: "Plugins:",
  pluginImportTool: "Import Tool — importação de dados em massa.",
  pluginWorkflow: "Workflow / Notificações por e-mail — alertas automáticos.",
  pluginAdvancedReports: "Relatórios Avançados — biblioteca alargada de relatórios.",
  pluginSLA: "SLA — gestão de acordos de nível de serviço.",
  apiManwinwin: "API ManWinWin — API REST para integrações.",
  requestsModuleDesc:
    "Módulo de Pedidos de Manutenção, que permite centralizar todos os pedidos e ligar diretamente à equipa de manutenção.",
  webAdditionalDesc:
    "Acessos adicionais ManWinWin WEB / Mobility que também dão acesso à App ManWinWin e ao ManWinWin SMART TAG.",
  annualLicenseHeading: (plan, hosting) =>
    `Licença anual ManWinWin Professional (${hosting.toLowerCase()}) – Plano ${plan}`,
  annualLicensePrice: "Licença anual ManWinWin Professional:",
  satIncluded: "Suporte e Assistência Técnica (S&TA): €0 > incluído na licença anual (ver detalhes no final)",
  services: "SERVIÇOS",
  implementation: "IMPLEMENTAÇÃO - Serviços de Consultoria e Formação",
  implOnlineLine: (price) => `Serviços de implementação, consultoria técnica e formação ONLINE: ${price}`,
  implIncludes: (h) => `Inclui: serviços de consultoria e formação de utilizadores remotamente, num total de ${h} horas.`,
  investmentInProject: "Investimento no projeto",
  year1: "Ano 1",
  year2Onwards: "Ano 2 e seguintes*",
  totalOfYear: "Total do ano",
  totalPerYear: "Total por ano",
  software: "Software",
  satShort: "Suporte e Assistência Técnica (S&TA)",
  onlineImplService: "Serviço de implementação online",
  onsiteImplService: "Serviço de implementação presencial",
  lightImplService: "Serviço de implementação online light",
  rciImplService: "Serviço RCI Professional",
  additionalWebUsers: "Acessos WEB adicionais",
  workRequestsModule: "Módulo de Pedidos de Trabalho",
  perYear: "por ano",
  perUserMonth: "€ / utilizador / mês",
  billingHeader: "CONDIÇÕES DE FATURAÇÃO E PAGAMENTO",
  standardTerms: "Condições standard ManWinWin:",
  paymentLine1: "Fatura de 50%, na data de adjudicação¹, pagamento a pronto",
  paymentLine2: "Fatura de 50%, na data de instalação², pagamento a 30 dias",
  footnote1: "¹ O arranque do projeto de implementação está dependente do pagamento da primeira fatura.",
  footnote2:
    "² Por data de instalação entende-se, data a partir da qual, o software fica disponível para acesso por parte dos utilizadores mediante login.",
  otherInfo: "OUTRAS INFORMAÇÕES RELEVANTES",
  vatNote: "Aos valores apresentados acresce IVA à taxa legal em vigor",
  validityNote: (d) => `Esta proposta é válida por ${d} (${d}) dias`,
  saasFeatures: "Características da solução ManWinWin SaaS",
  saasFeaturesList: [
    "Acesso remoto à aplicação via Internet",
    "Servidor remoto de alta performance",
    "Largura de banda do servidor de 1000 Mbits/s",
    "Manutenção e atualizações do sistema",
    "Backups da base de dados",
    "Monitorização permanente do sistema",
    "Suporte por email, telefone ou assistência remota para resolução de problemas",
  ],
  satTitle: "S&AT – Suporte e Assistência Técnica",
  satList: [
    "Um Gestor Técnico alocado ao cliente",
    "Contacto direto com o Departamento de Suporte (suporte e assistência técnica por e-mail ou remota)",
    "Plataforma online para pedidos de suporte (Helpdesk)",
    "10% de desconto em compras adicionais (módulos e/ou estações adicionais)",
    "30% de desconto em dias de consultoria/formação pré-contratados",
    "20% de desconto em licenciamento para empresas/instalações do mesmo grupo",
    "Atualização e manutenção do software",
    "Participação na evolução do programa (sugestões de melhoria, sugestões de novas funcionalidades, listas, etc...)",
  ],
  restricted: "Restrito",
  assumingSameYear1: "* Assumindo a mesma configuração do ano 1",
  perDiem: "Per diem presencial",
  onsiteDays: "Dias presenciais",
  discount: "Desconto",
  noDiscount: "Sem desconto",
  discountAppliesTo: "Desconto aplica-se a",
  discountScopeNone: "Sem desconto",
  discountScopeServices: "Apenas serviços",
  discountScopeSoftware: "Apenas software",
  discountScopeTotal: "Proposta total",
  servicesDiscountLabel: (pct) => `Desconto de serviços (${pct}%)`,
  softwareDiscountLabel: (pct) => `Desconto de software (${pct}%)`,
  servicesDiscountsTotalLabel: "Total de descontos de serviços",
  softwareDiscountsTotalLabel: "Total de descontos de software",
  sectionDiscountLabel: (pct) => `Desconto da secção ${pct}%`,
  totalDiscountLabel: (pct) => `Desconto da proposta total (${pct}%)`,
  notes: "Notas",
  colItem: "Item",
  colQty: "Qtd",
  colUnit: "Preço unitário",
  colTotal: "Total",
  colFrequency: "Periodicidade",
  colGross: "Bruto",
  colNet: "Líquido",
  grossSubtotal: (title) => `Subtotal bruto ${title.toLowerCase()}`,
  netSubtotal: (title) => `Subtotal líquido ${title.toLowerCase()}`,
  sectionSubtotal: (title) => `Subtotal ${title.toLowerCase()}`,
  planAnnualLicense: (plan) => `Licença anual — Plano ${plan}`,
  onlineImplementationLabel: (plan) => `Implementação Online — Plano ${plan}`,
  lightImplementationLabel: (plan) => `Implementação Light — Plano ${plan}`,
  requestsImplementationLabel: "Implementação do Módulo de Pedidos de Manutenção",
  requestsModuleShort: "Módulo de Pedidos de Manutenção",
  webUsersAdditionalLabel: (qty) => `Utilizadores Web/Mobile adicionais (×${qty})`,
  onsiteDaysLabel: (qty) => `Dias de implementação presencial (×${qty})`,
  client: "Cliente",
  date: "Data",
  project: "Projeto",
  validity: "Validade",
  country: "País",
  versionLabel: "Versão",
  daysWord: "dias",
  renewalValue: "Renovação",
  renewalDiscountApplied: "Desconto de renovação aplicado",
  discountsYear1OnlyNote: "Os descontos apresentados aplicam-se apenas ao Ano 1, salvo indicação em contrário.",
  langFallbackWarning: (target) =>
    `Traduções para ${target} ainda não estão disponíveis — a proposta será gerada em inglês.`,
};

const ES: Strings = {
  ...EN,
  investmentProposal: "Propuesta de Inversión",
  forImplementation: "PARA EL PROYECTO DE IMPLEMENTACIÓN DEL SOFTWARE DE MANTENIMIENTO MANWINWIN",
  annualLicenseDescription: (plan) => `Licencia anual ManWinWin Professional — Plan ${plan} con:`,
  backofficeAccess: "1 (uno) acceso BackOffice (simultáneo – permite múltiples usuarios)",
  webAccess: "1 (uno) acceso ManWinWin WEB / Mobility (posibilidad de añadir más)",
  includes: "Incluye",
  optionalNotIncluded: "Opcional (No Incluido):",
  maintenanceModule:
    "Módulo de Mantenimiento y Costos, que le permitirá gestionar activos, órdenes de trabajo, costos, KPIs e informes en una interfaz multilingüe integrada.",
  stockModule: "Módulo de Gestión de Stock — control de inventario integrado con mantenimiento.",
  purchaseOrdersModule: "Módulo de Órdenes de Compra — solicitar, aprobar y rastrear compras.",
  pluginsLabel: "Plugins:",
  pluginImportTool: "Import Tool — importación masiva de datos.",
  pluginWorkflow: "Workflow / Notificaciones por e-mail — alertas automáticas.",
  pluginAdvancedReports: "Informes avanzados — biblioteca ampliada de informes.",
  pluginSLA: "SLA — gestión de acuerdos de nivel de servicio.",
  apiManwinwin: "API ManWinWin — API REST para integraciones.",
  requestsModuleDesc:
    "Módulo de Solicitudes de Mantenimiento, que le permitirá centralizar todas las solicitudes y conectar directamente con el equipo de mantenimiento.",
  webAdditionalDesc:
    "Accesos adicionales ManWinWin WEB / Mobility que también darán acceso a la App ManWinWin y al ManWinWin SMART TAG.",
  annualLicenseHeading: (plan, hosting) =>
    `Licencia anual ManWinWin Professional (${hosting.toLowerCase()}) – Plan ${plan}`,
  annualLicensePrice: "Licencia anual ManWinWin Professional:",
  satIncluded: "Soporte y Asistencia Técnica (S&TA): €0 > incluido en la licencia anual (ver detalles al final)",
  services: "SERVICIOS",
  implementation: "IMPLEMENTACIÓN - Servicios de Consultoría y Capacitación",
  implOnlineLine: (price) => `Servicios de implementación, consultoría técnica y capacitación ONLINE: ${price}`,
  implIncludes: (h) =>
    `Incluye: servicios de consultoría y capacitación de usuarios remotamente por un total de ${h} horas.`,
  investmentInProject: "Inversión en el proyecto",
  year1: "Año 1",
  year2Onwards: "Año 2 y siguientes*",
  totalOfYear: "Total del año",
  totalPerYear: "Total por año",
  software: "Software",
  satShort: "Soporte y Asistencia Técnica (S&TA)",
  onlineImplService: "Servicio de implementación online",
  onsiteImplService: "Servicio de implementación presencial",
  lightImplService: "Servicio de implementación online light",
  rciImplService: "Servicio RCI Professional",
  additionalWebUsers: "Usuarios WEB adicionales",
  workRequestsModule: "Módulo de Solicitudes de Trabajo",
  perYear: "por año",
  perUserMonth: "€ / usuario / mes",
  billingHeader: "CONDICIONES DE FACTURACIÓN Y PAGO",
  standardTerms: "Condiciones estándar ManWinWin:",
  paymentLine1: "Factura del 50% en la fecha de adjudicación¹, pago al contado",
  paymentLine2: "Factura del 50% en la fecha de instalación², pago a 30 días",
  footnote1: "¹ El inicio del proyecto de implementación depende del pago de la primera factura.",
  footnote2:
    "² Por fecha de instalación se entiende la fecha a partir de la cual el software está disponible para que los usuarios puedan acceder mediante inicio de sesión.",
  otherInfo: "OTRA INFORMACIÓN RELEVANTE",
  vatNote: "A los valores presentados se añade el IVA a la tasa legal vigente",
  validityNote: (d) => `Esta propuesta es válida por ${d} (${d}) días`,
  saasFeatures: "Características de la solución ManWinWin SaaS",
  saasFeaturesList: [
    "Acceso remoto a la aplicación vía Internet",
    "Servidor remoto de alto rendimiento",
    "Ancho de banda del servidor de 1000 Mbits/s",
    "Mantenimiento y actualizaciones del sistema",
    "Copias de seguridad de la base de datos",
    "Monitorización permanente del sistema",
    "Soporte por email, teléfono o asistencia remota para resolución de problemas",
  ],
  satTitle: "S&AT – Soporte y Asistencia Técnica",
  satList: [
    "Un Gerente Técnico asignado al cliente",
    "Contacto directo con el Departamento de Soporte (soporte y asistencia técnica por e-mail o remota)",
    "Plataforma online para solicitudes de soporte (Helpdesk)",
    "10% de descuento en compras adicionales (módulos y/o estaciones adicionales)",
    "30% de descuento en días de consultoría/capacitación precontratados",
    "20% de descuento en licencias para empresas/instalaciones del mismo grupo",
    "Actualización y mantenimiento del software",
    "Participación en la evolución del programa (sugerencias de mejora, sugerencias de nuevas funcionalidades, listas, etc...)",
  ],
  restricted: "Restringido",
  assumingSameYear1: "* Asumiendo la misma configuración del año 1",
  perDiem: "Per diem presencial",
  onsiteDays: "Días presenciales",
  discount: "Descuento",
  noDiscount: "Sin descuento",
  discountAppliesTo: "El descuento se aplica a",
  discountScopeNone: "Sin descuento",
  discountScopeServices: "Solo servicios",
  discountScopeSoftware: "Solo software",
  discountScopeTotal: "Propuesta total",
  servicesDiscountLabel: (pct) => `Descuento de servicios (${pct}%)`,
  softwareDiscountLabel: (pct) => `Descuento de software (${pct}%)`,
  servicesDiscountsTotalLabel: "Total descuentos de servicios",
  softwareDiscountsTotalLabel: "Total descuentos de software",
  sectionDiscountLabel: (pct) => `Descuento de sección ${pct}%`,
  totalDiscountLabel: (pct) => `Descuento de la propuesta total (${pct}%)`,
  notes: "Notas",
  colItem: "Ítem",
  colQty: "Cant.",
  colUnit: "Precio unitario",
  colTotal: "Total",
  colFrequency: "Periodicidad",
  colGross: "Bruto",
  colNet: "Neto",
  grossSubtotal: (title) => `Subtotal bruto ${title.toLowerCase()}`,
  netSubtotal: (title) => `Subtotal neto ${title.toLowerCase()}`,
  sectionSubtotal: (title) => `Subtotal ${title.toLowerCase()}`,
  planAnnualLicense: (plan) => `Licencia anual — Plan ${plan}`,
  onlineImplementationLabel: (plan) => `Implementación Online — Plan ${plan}`,
  lightImplementationLabel: (plan) => `Implementación Light — Plan ${plan}`,
  requestsImplementationLabel: "Implementación del Módulo de Solicitudes de Mantenimiento",
  requestsModuleShort: "Módulo de Solicitudes de Mantenimiento",
  webUsersAdditionalLabel: (qty) => `Usuarios Web/Mobile adicionales (×${qty})`,
  onsiteDaysLabel: (qty) => `Días de implementación presencial (×${qty})`,
  client: "Cliente",
  date: "Fecha",
  project: "Proyecto",
  validity: "Validez",
  country: "País",
  versionLabel: "Versión",
  daysWord: "días",
  renewalValue: "Renovación",
  renewalDiscountApplied: "Descuento de renovación aplicado",
  discountsYear1OnlyNote: "Los descuentos mostrados se aplican solo al Año 1, salvo indicación en contrario.",
  langFallbackWarning: (target) =>
    `Las traducciones para ${target} aún no están disponibles — la propuesta se generará en inglés.`,
};

/** Active language tables. RO / TH intentionally omitted → fall back to EN until translated. */
const STRINGS: Partial<Record<ProposalLanguage, Strings>> = { EN, PT, ES };

/** Returns translation strings, falling back to EN for unknown languages. */
export function t(lang: ProposalLanguage): Strings {
  return STRINGS[lang] || EN;
}

/** True if the language has a full translation table; false → EN fallback. */
export function isLanguageSupported(lang: string): boolean {
  return lang in STRINGS;
}

export function formatEuro(value: number, lang: ProposalLanguage = "EN"): string {
  const locale = lang === "PT" ? "pt-PT" : lang === "ES" ? "es-ES" : "en-GB";
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
  return `${formatted} €`;
}

/** Frequency label per language. */
export function frequencyLabel(freq: string, lang: ProposalLanguage = "EN"): string {
  const map: Record<string, Partial<Record<ProposalLanguage, string>>> = {
    yearly: { EN: "yearly", PT: "por ano", ES: "por año" },
    monthly: { EN: "monthly", PT: "por mês", ES: "por mes" },
    "one-time": { EN: "one-time", PT: "único", ES: "único" },
    "per-user-month": { EN: "per-user-month", PT: "por utilizador/mês", ES: "por usuario/mes" },
    "per-hour": { EN: "per-hour", PT: "por hora", ES: "por hora" },
  };
  return map[freq]?.[lang] ?? map[freq]?.EN ?? freq;
}

/** Default standard payment terms text used when user hasn't customised it. */
export function standardPaymentTerms(lang: ProposalLanguage): string {
  const s = t(lang);
  return [
    s.standardTerms,
    `• ${s.paymentLine1}`,
    `• ${s.paymentLine2}`,
    "",
    s.footnote1,
    s.footnote2,
  ].join("\n");
}

/**
 * Business proposal i18n strings.
 *
 * Kept separate from the Professional `proposal-i18n.ts` so changes here
 * cannot regress Professional document output. Supports EN / PT / ES with
 * fallback to EN for any other language code.
 */
import type { ProposalLanguage } from "@/types/proposal";

export interface BusinessStrings {
  // Cover
  investmentProposal: string;
  businessSubtitle: string; // e.g. "ManWinWin Business"
  restricted: string;

  // Introduction
  forImplementation: (client: string) => string;

  // Sections
  softwareDescription: string;
  optionsTitle: string;
  servicesTitle: string;
  investmentSummaryTitle: string;
  billingHeader: string;
  otherInfo: string;
  featuresClientServerTitle: string;
  featuresSaasTitle: string;
  satTitle: string;
  apiTitle: string;

  // Software description bullets
  defaultBackoffice: string;
  defaultWebMobile: string;
  additionalBackofficeAccesses: (n: number) => string;
  additionalWebMobileAccesses: (n: number) => string;
  modulesIncludedHeading: string;
  pluginsIncludedHeading: string;
  optionalNotIncluded: string;
  hostingSaas: string;
  hostingClientServer: string;
  apiManwinwin: string;

  maintenanceModule: string;
  requestsModule: string;
  stockModule: string;
  purchaseModule: string;
  pluginImport: string;
  pluginWorkflow: string;
  pluginAdvancedReports: string;
  pluginSLA: string;

  // Options
  optionAKeepIT: string;
  optionBUseIT: string;
  permanentKeepITLicense: string;
  annualUseITLicense: string;
  keepItLicenseAmount: string;
  useItAnnualLicenseAmount: string;
  satAnnual: string;
  satIncluded: string;
  webMobileAdditionalAnnual: string;
  apiAnnual: string;
  saasHostingAnnual: string;

  // Services
  rciTitle: string;
  onsiteTitle: string;
  customServicesTitle: string;
  region: string;
  clientDays: string;
  backofficeDays: string;
  totalOnsite: string;
  travelNote: string;
  additionalLiveSessions: string;
  rciBase: string;

  // Investment summary
  itemColumn: string;
  optionAColumn: string;
  optionBColumn: string;
  year1: string;
  year2Onwards: string;
  totalOfYear1: string;
  totalPerYear2Plus: string;
  software: string;
  services: string;
  webMobileAdditional: string;
  additionalBackoffice: string;
  apiRow: string;
  saasHostingRow: string;
  satRow: string;
  satIncludedShort: string;
  oneTimeDash: string;

  // Discounts
  softwareDiscount: string;
  webMobileDiscount: string;
  apiDiscount: string;
  servicesDiscount: string;

  // Payment terms
  standardTerms: string;
  paymentLine1: string;
  paymentLine2: string;
  footnote1: string;
  footnote2: string;

  // Other info
  vatNote: string;
  validityNote: (d: number) => string;
  satEscalationNote: string;

  // Features
  clientServerFeaturesIntro: string;
  clientServerFeatures: string[];
  saasFeaturesIntro: string;
  saasFeatures: string[];

  // S&AT details
  satList: string[];

  // API conditions
  apiList: string[];

  // Footer
  footerLine: string;
  client: string;
  project: string;
  date: string;
  validity: string;
  daysWord: string;
}

const EN: BusinessStrings = {
  investmentProposal: "Investment Proposal",
  businessSubtitle: "ManWinWin Business",
  restricted: "Restricted",

  forImplementation: (client) =>
    `FOR THE IMPLEMENTATION PROJECT OF THE MANWINWIN MAINTENANCE SOFTWARE AT ${client}`,

  softwareDescription: "Software",
  optionsTitle: "Commercial Licensing Options",
  servicesTitle: "Services",
  investmentSummaryTitle: "Investment Summary",
  billingHeader: "BILLING AND PAYMENT CONDITIONS",
  otherInfo: "OTHER RELEVANT INFORMATION",
  featuresClientServerTitle: "Features of the ManWinWin Client/Server solution",
  featuresSaasTitle: "Features of the ManWinWin SaaS solution",
  satTitle: "S&AT — Support & Technical Assistance",
  apiTitle: "Licensing conditions and access to the ManWinWin API",

  defaultBackoffice: "3 simultaneous BackOffice accesses included by default",
  defaultWebMobile: "1 ManWinWin WEB/Mobile access included by default",
  additionalBackofficeAccesses: (n) => `Additional BackOffice accesses: ${n}`,
  additionalWebMobileAccesses: (n) => `Additional ManWinWin WEB/Mobile accesses: ${n}`,
  modulesIncludedHeading: "Included modules",
  pluginsIncludedHeading: "Included plugins",
  optionalNotIncluded: "Optional / Not Included",
  hostingSaas: "ManWinWin SaaS Hosting Services",
  hostingClientServer: "Client/Server solution",
  apiManwinwin: "API ManWinWin",

  maintenanceModule: "Maintenance & Costs Module",
  requestsModule: "Maintenance Requests Module",
  stockModule: "Stock Management Module",
  purchaseModule: "Purchase Management Module",
  pluginImport: "Import Tool Plugin",
  pluginWorkflow: "Workflow Email Notifications Plugin",
  pluginAdvancedReports: "Advanced Reports Plugin",
  pluginSLA: "SLA Plugin",

  optionAKeepIT: 'Option A — Permanent "KeepIT" License',
  optionBUseIT: 'Option B — Annual "UseIT" License',
  permanentKeepITLicense: 'Permanent "KeepIT" License',
  annualUseITLicense: 'Annual "UseIT" License',
  keepItLicenseAmount: "Permanent software license",
  useItAnnualLicenseAmount: "Annual software license",
  satAnnual: "Support & Technical Assistance (S&AT) — annual",
  satIncluded: "S&AT — included in the annual UseIT license",
  webMobileAdditionalAnnual: "Additional Web/Mobile users — annual",
  apiAnnual: "API ManWinWin — annual",
  saasHostingAnnual: "SaaS Hosting Services — annual",

  rciTitle: "IMPLEMENTATION — Remote Consultancy & Implementation Services",
  onsiteTitle: "IMPLEMENTATION — Consulting and Training Services On-Site",
  customServicesTitle: "IMPLEMENTATION — Custom Services",
  region: "Region",
  clientDays: "Client days",
  backofficeDays: "BackOffice days",
  totalOnsite: "Total onsite services",
  travelNote:
    "Travel, accommodation, local transportation and meal expenses are not included unless otherwise stated.",
  additionalLiveSessions: "Additional live sessions",
  rciBase: "RCI Business — Base",

  itemColumn: "Item",
  optionAColumn: 'Option A — Permanent "KeepIT" License',
  optionBColumn: 'Option B — Annual "UseIT" License',
  year1: "YEAR 1",
  year2Onwards: "YEAR 2 AND FOLLOWING (per year)",
  totalOfYear1: "TOTAL OF THE YEAR (Year 1)",
  totalPerYear2Plus: "TOTAL PER YEAR (Year 2+)",
  software: "Software license",
  services: "Implementation services",
  webMobileAdditional: "ManWinWin WEB/Mobile additional accesses",
  additionalBackoffice: "Additional BackOffice accesses",
  apiRow: "API ManWinWin",
  saasHostingRow: "SaaS Hosting Services",
  satRow: "Support & Technical Assistance (S&AT)",
  satIncludedShort: "included",
  oneTimeDash: "—",

  softwareDiscount: "Software discount",
  webMobileDiscount: "Web/Mobile discount",
  apiDiscount: "API discount",
  servicesDiscount: "Services discount",

  standardTerms: "ManWinWin standard terms and conditions:",
  paymentLine1: "50% invoice on the date of award¹, payment in full",
  paymentLine2: "50% invoice on the date of installation², payment within 30 days",
  footnote1:
    "¹ The start of the implementation project is dependent on payment of the first invoice.",
  footnote2:
    "² The installation date is understood to be the date from which the software is available for access by users via login.",

  vatNote: "VAT at the legal rate in force is added to the values presented.",
  validityNote: (d) => `This proposal is valid for ${d} days.`,
  satEscalationNote:
    "The S&AT value may be updated annually according to the price list in force. The client will be informed in advance.",

  clientServerFeaturesIntro: "Features of the ManWinWin Client/Server solution:",
  clientServerFeatures: [
    "Database installed on the client's server",
    "Software installed on users' computers with network access to the database",
    "Backup management is the responsibility of the client",
  ],
  saasFeaturesIntro: "Features of the ManWinWin SaaS solution:",
  saasFeatures: [
    "Remote access to the application via the Internet",
    "High-performance remote server",
    "Server bandwidth of 1000 Mbits/s",
    "System maintenance and updates",
    "Database backups",
    "Permanent system monitoring",
    "Support via email, telephone or remote assistance for troubleshooting",
  ],

  satList: [
    "A Technical Manager allocated to the customer",
    "Direct contact with the dedicated Support Department",
    "Online platform for support requests (Helpdesk)",
    "10% discount on additional purchases (modules and/or additional stations)",
    "30% discount on pre-contracted consulting/training days",
    "20% discount on licensing for companies/facilities of the same group",
    "Software Update and Maintenance",
    "Participation in the evolution of the software through suggestions and improvement proposals",
  ],

  apiList: [
    "With the license, access to the ManWinWin API is made available to the client so they can develop the integrations they need.",
    "The development and updating of integrations are the sole responsibility of the client.",
    "ManWinWin will provide support in everything related to ManWinWin and the ManWinWin API, as provided under S&AT conditions.",
    "The ManWinWin API is a passive/static API, prepared to receive information via PUT and POST methods and to make information available via GET methods.",
  ],

  footerLine: "ManWinWin Software · support@manwinwin.com · www.manwinwin.com",
  client: "Client",
  project: "Project",
  date: "Date",
  validity: "Validity",
  daysWord: "days",
};

const PT: BusinessStrings = {
  ...EN,
  investmentProposal: "Proposta de Investimento",
  restricted: "Restrito",
  forImplementation: (client) =>
    `PARA O PROJETO DE IMPLEMENTAÇÃO DO SOFTWARE DE MANUTENÇÃO MANWINWIN NA ${client}`,

  softwareDescription: "Software",
  optionsTitle: "Opções Comerciais de Licenciamento",
  servicesTitle: "Serviços",
  investmentSummaryTitle: "Resumo do Investimento",
  billingHeader: "CONDIÇÕES DE FATURAÇÃO E PAGAMENTO",
  otherInfo: "OUTRAS INFORMAÇÕES RELEVANTES",
  featuresClientServerTitle: "Características da solução ManWinWin Cliente/Servidor",
  featuresSaasTitle: "Características da solução ManWinWin SaaS",
  satTitle: "S&AT — Suporte & Assistência Técnica",
  apiTitle: "Condições de licenciamento e acesso à API ManWinWin",

  defaultBackoffice: "3 acessos BackOffice simultâneos incluídos por defeito",
  defaultWebMobile: "1 acesso ManWinWin WEB/Mobile incluído por defeito",
  additionalBackofficeAccesses: (n) => `Acessos BackOffice adicionais: ${n}`,
  additionalWebMobileAccesses: (n) => `Acessos ManWinWin WEB/Mobile adicionais: ${n}`,
  modulesIncludedHeading: "Módulos incluídos",
  pluginsIncludedHeading: "Plugins incluídos",
  optionalNotIncluded: "Opcional / Não Incluído",
  hostingSaas: "Serviços de Alojamento ManWinWin SaaS",
  hostingClientServer: "Solução Cliente/Servidor",
  apiManwinwin: "API ManWinWin",

  maintenanceModule: "Módulo de Manutenção & Custos",
  requestsModule: "Módulo de Pedidos de Manutenção",
  stockModule: "Módulo de Gestão de Stock",
  purchaseModule: "Módulo de Gestão de Compras",
  pluginImport: "Plugin de Importação",
  pluginWorkflow: "Plugin de Notificações por Email (Workflow)",
  pluginAdvancedReports: "Plugin de Relatórios Avançados",
  pluginSLA: "Plugin de SLA",

  optionAKeepIT: 'Opção A — Licença Permanente "KeepIT"',
  optionBUseIT: 'Opção B — Licença Anual "UseIT"',
  permanentKeepITLicense: 'Licença Permanente "KeepIT"',
  annualUseITLicense: 'Licença Anual "UseIT"',
  keepItLicenseAmount: "Licença de software permanente",
  useItAnnualLicenseAmount: "Licença de software anual",
  satAnnual: "Suporte & Assistência Técnica (S&AT) — anual",
  satIncluded: "S&AT — incluído na licença anual UseIT",
  webMobileAdditionalAnnual: "Utilizadores Web/Mobile adicionais — anual",
  apiAnnual: "API ManWinWin — anual",
  saasHostingAnnual: "Serviços de Alojamento SaaS — anual",

  rciTitle: "IMPLEMENTAÇÃO — Serviços Remotos de Consultoria e Implementação",
  onsiteTitle: "IMPLEMENTAÇÃO — Serviços de Consultoria e Formação On-Site",
  customServicesTitle: "IMPLEMENTAÇÃO — Serviços Personalizados",
  region: "Região",
  clientDays: "Dias cliente",
  backofficeDays: "Dias BackOffice",
  totalOnsite: "Total de serviços on-site",
  travelNote:
    "As despesas de deslocação, estadia, transporte local e alimentação não estão incluídas, salvo indicação em contrário.",
  additionalLiveSessions: "Sessões live adicionais",
  rciBase: "RCI Business — Base",

  itemColumn: "Item",
  optionAColumn: 'Opção A — Licença Permanente "KeepIT"',
  optionBColumn: 'Opção B — Licença Anual "UseIT"',
  year1: "ANO 1",
  year2Onwards: "ANO 2 E SEGUINTES (por ano)",
  totalOfYear1: "TOTAL DO ANO (Ano 1)",
  totalPerYear2Plus: "TOTAL POR ANO (Ano 2+)",
  software: "Licença de software",
  services: "Serviços de implementação",
  webMobileAdditional: "Acessos ManWinWin WEB/Mobile adicionais",
  additionalBackoffice: "Acessos BackOffice adicionais",
  apiRow: "API ManWinWin",
  saasHostingRow: "Serviços de Alojamento SaaS",
  satRow: "Suporte & Assistência Técnica (S&AT)",
  satIncludedShort: "incluído",
  oneTimeDash: "—",

  softwareDiscount: "Desconto de software",
  webMobileDiscount: "Desconto Web/Mobile",
  apiDiscount: "Desconto API",
  servicesDiscount: "Desconto de serviços",

  standardTerms: "Condições standard ManWinWin:",
  paymentLine1: "Fatura de 50%, na data de adjudicação¹, pagamento a pronto",
  paymentLine2: "Fatura de 50%, na data de instalação², pagamento a 30 dias",
  footnote1:
    "¹ O arranque do projeto de implementação está dependente do pagamento da primeira fatura.",
  footnote2:
    "² Por data de instalação entende-se, data a partir da qual, o software fica disponível para acesso por parte dos utilizadores mediante login.",

  vatNote: "Aos valores apresentados acresce IVA à taxa legal em vigor.",
  validityNote: (d) => `Esta proposta é válida por ${d} dias.`,
  satEscalationNote:
    "O valor do S&AT poderá ser atualizado anualmente de acordo com a tabela de preços em vigor. O cliente será informado com antecedência.",

  clientServerFeaturesIntro: "Características da solução ManWinWin Cliente/Servidor:",
  clientServerFeatures: [
    "Base de dados instalada no servidor do cliente",
    "Software instalado nos computadores dos utilizadores que necessitam de acesso em rede à base de dados",
    "A gestão de backups é da responsabilidade do cliente",
  ],
  saasFeaturesIntro: "Características da solução ManWinWin SaaS:",
  saasFeatures: [
    "Acesso remoto à aplicação via Internet",
    "Servidor remoto de alta performance",
    "Largura de banda do servidor de 1000 Mbits/s",
    "Manutenção e atualizações do sistema",
    "Backups da base de dados",
    "Monitorização permanente do sistema",
    "Suporte por email, telefone ou assistência remota para resolução de problemas",
  ],

  satList: [
    "Um Gestor Técnico alocado ao cliente",
    "Contacto direto com o Departamento de Suporte dedicado",
    "Plataforma online para pedidos de suporte (Helpdesk)",
    "10% de desconto em aquisições adicionais (módulos e/ou postos adicionais)",
    "30% de desconto em dias de consultoria/formação pré-contratados",
    "20% de desconto em licenciamento para empresas/instalações do mesmo grupo",
    "Atualização e manutenção do software",
    "Participação na evolução do software através de sugestões de melhoria",
  ],

  apiList: [
    "Com o licenciamento, o acesso à API ManWinWin é disponibilizado ao cliente para que possa desenvolver as integrações necessárias.",
    "O desenvolvimento e a atualização de integrações são da inteira responsabilidade do cliente.",
    "A ManWinWin dará apoio em tudo o que diga respeito ao ManWinWin e à API ManWinWin, conforme previsto nas condições de S&AT.",
    "A API ManWinWin é uma API passiva/estática, preparada para receber informação por via dos métodos PUT e POST e disponibilizar informação por via de métodos GET.",
  ],

  client: "Cliente",
  project: "Projeto",
  date: "Data",
  validity: "Validade",
  daysWord: "dias",
};

const ES: BusinessStrings = {
  ...EN,
  investmentProposal: "Propuesta de Inversión",
  restricted: "Restringido",
  forImplementation: (client) =>
    `PARA EL PROYECTO DE IMPLEMENTACIÓN DEL SOFTWARE DE MANTENIMIENTO MANWINWIN EN ${client}`,

  softwareDescription: "Software",
  optionsTitle: "Opciones Comerciales de Licenciamiento",
  servicesTitle: "Servicios",
  investmentSummaryTitle: "Resumen de la Inversión",
  billingHeader: "CONDICIONES DE FACTURACIÓN Y PAGO",
  otherInfo: "OTRA INFORMACIÓN RELEVANTE",
  featuresClientServerTitle: "Características de la solución ManWinWin Cliente/Servidor",
  featuresSaasTitle: "Características de la solución ManWinWin SaaS",
  satTitle: "S&AT — Soporte y Asistencia Técnica",
  apiTitle: "Condiciones de licencia y acceso a la API ManWinWin",

  defaultBackoffice: "3 accesos BackOffice simultáneos incluidos por defecto",
  defaultWebMobile: "1 acceso ManWinWin WEB/Mobile incluido por defecto",
  additionalBackofficeAccesses: (n) => `Accesos BackOffice adicionales: ${n}`,
  additionalWebMobileAccesses: (n) => `Accesos ManWinWin WEB/Mobile adicionales: ${n}`,
  modulesIncludedHeading: "Módulos incluidos",
  pluginsIncludedHeading: "Plugins incluidos",
  optionalNotIncluded: "Opcional / No Incluido",
  hostingSaas: "Servicios de Alojamiento ManWinWin SaaS",
  hostingClientServer: "Solución Cliente/Servidor",

  maintenanceModule: "Módulo de Mantenimiento y Costos",
  requestsModule: "Módulo de Solicitudes de Mantenimiento",
  stockModule: "Módulo de Gestión de Stock",
  purchaseModule: "Módulo de Gestión de Compras",
  pluginImport: "Plugin de Importación",
  pluginWorkflow: "Plugin de Notificaciones por Email (Workflow)",
  pluginAdvancedReports: "Plugin de Informes Avanzados",
  pluginSLA: "Plugin de SLA",

  optionAKeepIT: 'Opción A — Licencia Permanente "KeepIT"',
  optionBUseIT: 'Opción B — Licencia Anual "UseIT"',
  permanentKeepITLicense: 'Licencia Permanente "KeepIT"',
  annualUseITLicense: 'Licencia Anual "UseIT"',
  keepItLicenseAmount: "Licencia de software permanente",
  useItAnnualLicenseAmount: "Licencia de software anual",
  satAnnual: "Soporte y Asistencia Técnica (S&AT) — anual",
  satIncluded: "S&AT — incluido en la licencia anual UseIT",
  webMobileAdditionalAnnual: "Usuarios Web/Mobile adicionales — anual",
  apiAnnual: "API ManWinWin — anual",
  saasHostingAnnual: "Servicios de Alojamiento SaaS — anual",

  rciTitle: "IMPLEMENTACIÓN — Servicios Remotos de Consultoría e Implementación",
  onsiteTitle: "IMPLEMENTACIÓN — Servicios de Consultoría y Formación On-Site",
  customServicesTitle: "IMPLEMENTACIÓN — Servicios Personalizados",
  region: "Región",
  clientDays: "Días cliente",
  backofficeDays: "Días BackOffice",
  totalOnsite: "Total de servicios on-site",
  travelNote:
    "Los gastos de desplazamiento, alojamiento, transporte local y comidas no están incluidos salvo indicación en contrario.",
  additionalLiveSessions: "Sesiones en vivo adicionales",
  rciBase: "RCI Business — Base",

  itemColumn: "Ítem",
  optionAColumn: 'Opción A — Licencia Permanente "KeepIT"',
  optionBColumn: 'Opción B — Licencia Anual "UseIT"',
  year1: "AÑO 1",
  year2Onwards: "AÑO 2 Y SIGUIENTES (por año)",
  totalOfYear1: "TOTAL DEL AÑO (Año 1)",
  totalPerYear2Plus: "TOTAL POR AÑO (Año 2+)",
  software: "Licencia de software",
  services: "Servicios de implementación",
  webMobileAdditional: "Accesos ManWinWin WEB/Mobile adicionales",
  additionalBackoffice: "Accesos BackOffice adicionales",
  apiRow: "API ManWinWin",
  saasHostingRow: "Servicios de Alojamiento SaaS",
  satRow: "Soporte y Asistencia Técnica (S&AT)",
  satIncludedShort: "incluido",
  oneTimeDash: "—",

  softwareDiscount: "Descuento de software",
  webMobileDiscount: "Descuento Web/Mobile",
  apiDiscount: "Descuento API",
  servicesDiscount: "Descuento de servicios",

  standardTerms: "Condiciones estándar ManWinWin:",
  paymentLine1: "Factura del 50% en la fecha de adjudicación¹, pago al contado",
  paymentLine2: "Factura del 50% en la fecha de instalación², pago a 30 días",
  footnote1:
    "¹ El inicio del proyecto de implementación depende del pago de la primera factura.",
  footnote2:
    "² Por fecha de instalación se entiende la fecha a partir de la cual el software está disponible para que los usuarios puedan acceder mediante inicio de sesión.",

  vatNote: "A los valores presentados se añade el IVA a la tasa legal vigente.",
  validityNote: (d) => `Esta propuesta es válida por ${d} días.`,
  satEscalationNote:
    "El valor del S&AT podrá actualizarse anualmente de acuerdo con la lista de precios vigente. El cliente será informado con antelación.",

  clientServerFeaturesIntro: "Características de la solución ManWinWin Cliente/Servidor:",
  clientServerFeatures: [
    "Base de datos instalada en el servidor del cliente",
    "Software instalado en los ordenadores de los usuarios con acceso de red a la base de datos",
    "La gestión de copias de seguridad es responsabilidad del cliente",
  ],
  saasFeaturesIntro: "Características de la solución ManWinWin SaaS:",
  saasFeatures: [
    "Acceso remoto a la aplicación a través de Internet",
    "Servidor remoto de alto rendimiento",
    "Ancho de banda del servidor de 1000 Mbits/s",
    "Mantenimiento y actualizaciones del sistema",
    "Copias de seguridad de la base de datos",
    "Monitorización permanente del sistema",
    "Soporte por email, teléfono o asistencia remota para resolución de incidencias",
  ],

  satList: [
    "Un Gestor Técnico asignado al cliente",
    "Contacto directo con el Departamento de Soporte dedicado",
    "Plataforma online para solicitudes de soporte (Helpdesk)",
    "10% de descuento en compras adicionales (módulos y/o puestos adicionales)",
    "30% de descuento en días de consultoría/formación precontratados",
    "20% de descuento en licencias para empresas/instalaciones del mismo grupo",
    "Actualización y mantenimiento del software",
    "Participación en la evolución del software mediante sugerencias de mejora",
  ],

  apiList: [
    "Con la licencia, se pone a disposición del cliente el acceso a la API ManWinWin para que pueda desarrollar las integraciones necesarias.",
    "El desarrollo y la actualización de integraciones son responsabilidad exclusiva del cliente.",
    "ManWinWin prestará soporte en todo lo relacionado con ManWinWin y la API ManWinWin, según lo previsto en las condiciones de S&AT.",
    "La API ManWinWin es una API passiva/estática, preparada para recibir información mediante métodos PUT y POST y poner información a disposición mediante métodos GET.",
  ],

  client: "Cliente",
  project: "Proyecto",
  date: "Fecha",
  validity: "Validez",
  daysWord: "días",
};

export function tBusiness(lang: ProposalLanguage | string | null | undefined): BusinessStrings {
  switch (lang) {
    case "PT":
      return PT;
    case "ES":
      return ES;
    case "EN":
    case "RO":
    case "TH":
    default:
      return EN;
  }
}

import type { ProposalLanguage } from "@/types/proposal";
import { documentEscape } from "./proposal-document-design";

const copy = {
  PT: {
    scope: "Âmbito dos serviços",
    onsite: "Presencial, nas instalações do cliente",
    online: "Online",
    day: ["dia", "dias"],
    hour: ["hora", "horas"],
    session: ["sessão adicional", "sessões adicionais"],
    annual: "Inclui 1 dia por ano de formação ou consultoria contínua.",
    introOnsite: "A nossa equipa trabalha com os vossos utilizadores nas vossas instalações para preparar o ManWinWin para as rotinas de manutenção.",
    introOnline: "As sessões remotas combinam implementação assistida, consultoria técnica e formação, com exemplos dos processos de manutenção da vossa organização.",
    activities: [
      ["Preparação da solução", "Apoio na preparação da base de dados e na configuração inicial do software e dos perfis de utilizador."],
      ["Parametrização e consultoria", "Orientação na organização dos equipamentos, na definição de planos preventivos e na preparação das primeiras ordens de trabalho."],
      ["Formação prática", "Exercícios guiados sobre o registo de intervenções, o planeamento de trabalhos e a consulta de indicadores."],
    ],
  },
  EN: {
    scope: "Scope of services",
    onsite: "Onsite at the customer's premises",
    online: "Online",
    day: ["day", "days"],
    hour: ["hour", "hours"],
    session: ["additional session", "additional sessions"],
    annual: "Includes 1 day per year of ongoing training or consultancy.",
    introOnsite: "Our team works with your users at your premises to set up ManWinWin for your maintenance routines.",
    introOnline: "The remote sessions combine assisted implementation, technical consultancy and training, using examples from your maintenance processes.",
    activities: [
      ["Solution setup", "Support with database preparation and initial software and user profile configuration."],
      ["Configuration and consultancy", "Guidance on organising equipment records, setting up preventive maintenance plans and preparing the first work orders."],
      ["Practical training", "Guided exercises in recording interventions, scheduling work and reviewing performance indicators."],
    ],
  },
  ES: {
    scope: "Alcance de los servicios",
    onsite: "Presencial, en las instalaciones del cliente",
    online: "En línea",
    day: ["día", "días"],
    hour: ["hora", "horas"],
    session: ["sesión adicional", "sesiones adicionales"],
    annual: "Incluye 1 día al año de formación o consultoría continua.",
    introOnsite: "Nuestro equipo trabaja con sus usuarios en sus instalaciones para adaptar ManWinWin a sus rutinas de mantenimiento.",
    introOnline: "Las sesiones remotas combinan implementación asistida, consultoría técnica y formación, con ejemplos de sus procesos de mantenimiento.",
    activities: [
      ["Preparación de la solución", "Apoyo en la preparación de la base de datos y en la configuración inicial del software y de los perfiles de usuario."],
      ["Parametrización y consultoría", "Orientación para organizar el registro de equipos, definir planes preventivos y preparar las primeras órdenes de trabajo."],
      ["Formación práctica", "Ejercicios guiados sobre el registro de intervenciones, la planificación de trabajos y la consulta de indicadores."],
    ],
  },
};

const strings = (lang: ProposalLanguage) => copy[lang === "PT" || lang === "ES" ? lang : "EN"];

export function serviceQuantity(lang: ProposalLanguage, quantity: number, unit: "day" | "hour" | "session") {
  const locale = lang === "PT" ? "pt-PT" : lang === "ES" ? "es-ES" : "en-GB";
  return `${new Intl.NumberFormat(locale).format(quantity)} ${strings(lang)[unit][quantity === 1 ? 0 : 1]}`;
}

export function explicitServiceHours(description: string | null | undefined): number | null {
  const match = description?.trim().match(/^(\d+(?:[.,]\d+)?)\s+(?:standard\s+)?(?:hours?|horas?)\.?$/i);
  const hours = match ? Number(match[1].replace(",", ".")) : 0;
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

export function implementationScope(lang: ProposalLanguage, mode: "online" | "onsite", quantity?: string) {
  const s = strings(lang);
  const modality = mode === "onsite" ? s.onsite : s.online;
  return `<p><strong>${documentEscape([modality, quantity].filter(Boolean).join(" · "))}</strong></p>
<h3>${s.scope}</h3><p>${mode === "onsite" ? s.introOnsite : s.introOnline}</p>
<ul>${s.activities.map(([title, detail]) => `<li><strong>${title}</strong> · ${detail}</li>`).join("")}</ul>`;
}

export const annualConsultancyBenefit = (lang: ProposalLanguage) => strings(lang).annual;

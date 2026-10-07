import worldCountries from "@/data/customer-explorer-countries.json";
import { ISO_COUNTRIES } from "@/data/iso-countries";

export interface ExplorerClient {
  id: string;
  name: string;
  country: string | null;
  sector: string | null;
  active: boolean;
  partner: string;
  contact_name: string;
  contact_email: string | null;
}

export const CUSTOMER_CARE_EMAIL = "support@manwinwin.com";
export const UNKNOWN_SECTOR = "Sector to confirm";
type Country = { code: string; name: string; region: string; lon: number; lat: number; aliases: string[] };
export const EXPLORER_COUNTRIES: Country[] = [
  {code:"RO",name:"Romania",region:"Europe",lon:25,lat:46,aliases:["ROMANIA"]},
  {code:"NO",name:"Norway",region:"Europe",lon:9,lat:62,aliases:["NORWAY"]},
  {code:"NL",name:"Netherlands",region:"Europe",lon:5,lat:52,aliases:["NETHERLANDS"]},
  {code:"PT",name:"Portugal",region:"Europe",lon:-8,lat:39.5,aliases:["PORTUGAL"]},
  {code:"SA",name:"Saudi Arabia",region:"MENA",lon:45,lat:24,aliases:["SAUDI ARABIA","KSA"]},
  {code:"AE",name:"United Arab Emirates",region:"MENA",lon:54,lat:24,aliases:["UNITED ARAB EMIRATES","UAE"]},
  {code:"EG",name:"Egypt",region:"MENA",lon:30,lat:27,aliases:["EGYPT"]},
  {code:"JO",name:"Jordan",region:"MENA",lon:36,lat:31,aliases:["JORDAN"]},
  {code:"LB",name:"Lebanon",region:"MENA",lon:35.9,lat:34,aliases:["LEBANON"]},
  {code:"LY",name:"Libya",region:"MENA",lon:17,lat:27,aliases:["LIBYA"]},
  {code:"MY",name:"Malaysia",region:"APAC",lon:109,lat:4,aliases:["MALAYSIA"]},
  {code:"TH",name:"Thailand",region:"APAC",lon:101,lat:15,aliases:["THAILAND"]},
  {code:"VN",name:"Vietnam",region:"APAC",lon:107,lat:16,aliases:["VIETNAM","VIET NAM"]},
  {code:"IN",name:"India",region:"APAC",lon:79,lat:22,aliases:["INDIA"]},
  {code:"PH",name:"Philippines",region:"APAC",lon:123,lat:12,aliases:["PHILIPPINES"]},
  {code:"MX",name:"Mexico",region:"LATAM",lon:-102,lat:23,aliases:["MEXICO"]},
  {code:"CL",name:"Chile",region:"LATAM",lon:-71,lat:-33,aliases:["CHILE"]},
  {code:"PE",name:"Peru",region:"LATAM",lon:-75,lat:-10,aliases:["PERU"]},
  {code:"MZ",name:"Mozambique",region:"Africa",lon:35,lat:-18,aliases:["MOZAMBIQUE"]},
];
export function countryInfo(value: string | null) {
  const key = (value || "").trim().toUpperCase();
  const current = EXPLORER_COUNTRIES.find(c => c.code === key || c.aliases.includes(key));
  if (current) return current;
  const iso = ISO_COUNTRIES.find(c=>c.code===key||c.name.toUpperCase()===key);
  const world = worldCountries.find(c=>c.code===(iso?.code||key)||c.name.toUpperCase()===key||c.aliases.some(a=>a.toUpperCase()===key));
  if (!world) return undefined;
  const mena = new Set(["DZ","BH","EG","IR","IQ","IL","JO","KW","LB","LY","MA","OM","PS","QA","SA","SY","TN","AE","YE"]);
  const region=mena.has(world.code)?"MENA":world.continent==="Europe"?"Europe":world.continent==="Asia"||world.continent==="Oceania"?"APAC":world.continent==="Africa"?"Africa":world.continent==="South America"||world.subregion==="Central America"||world.subregion==="Caribbean"?"LATAM":world.continent==="North America"?"North America":"Region to confirm";
  return {code:world.code,name:world.name,region,lon:world.lon,lat:world.lat,aliases:world.aliases};
}
export function countryName(value: string | null) { return countryInfo(value)?.name || value || "Country to confirm"; }
export function countryCode(value: string | null) { return countryInfo(value)?.code || (value || "").trim().toUpperCase(); }
export function regionName(value: string | null) { return countryInfo(value)?.region || "Region to confirm"; }
export type ExplorerFilters = { search: string; sector: string; region: string; country: string; includeHistorical: boolean };
export function filterExplorerClients(rows: ExplorerClient[], f: ExplorerFilters) {
  const search = f.search.trim().toLocaleLowerCase();
  return rows.filter(r => (f.includeHistorical || r.active)
    && (!f.sector || (r.sector || UNKNOWN_SECTOR) === f.sector)
    && (!f.region || regionName(r.country) === f.region)
    && (!f.country || countryCode(r.country) === f.country)
    && (!search || [r.name,countryName(r.country),r.sector,r.partner].some(v => v?.toLocaleLowerCase().includes(search))));
}
export function countryGroups(rows: ExplorerClient[]) {
  const groups = new Map<string, { code: string; name: string; region: string; count: number; lon?: number; lat?: number }>();
  for (const r of rows) {
    const info = countryInfo(r.country), code = countryCode(r.country);
    const current = groups.get(code);
    if (current) current.count++;
    else groups.set(code,{code,name:countryName(r.country),region:regionName(r.country),count:1,lon:info?.lon,lat:info?.lat});
  }
  return [...groups.values()].sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
}
export function requestEmail(client: ExplorerClient, context: string) {
  const recipient = client.contact_email || CUSTOMER_CARE_EMAIL;
  const subject = `Customer information request — ${client.name} (${countryName(client.country)})`;
  const body = `Hello ${client.contact_email ? client.contact_name : "Customer Care"},\n\nI found ${client.name} in the ManWinWin Customer Explorer.\nSector: ${client.sector || UNKNOWN_SECTOR}\nCountry: ${countryName(client.country)}\n\nMy opportunity / question:\n${context.trim() || "[Please describe your opportunity and the information you need.]"}\n\nCould you help me understand whether this experience is relevant and what information can be shared?\n\nThank you.`;
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

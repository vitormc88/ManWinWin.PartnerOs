import {countryCode,countryGroups,countryName,filterExplorerClients,hasCaseStudy,type ExplorerClient,type ExplorerFilters} from './customer-explorer';

export type ExportOptions={map:boolean;logos:boolean;websites:boolean;caseStudies:boolean};
export const DEFAULT_EXPORT_OPTIONS:ExportOptions={map:false,logos:true,websites:true,caseStudies:false};
export function safeCompanyWebsite(value:unknown){
 if(typeof value!=='string'||value.length>2000)return null;
 if(!/^https:\/\/([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}([/?#][^\s\\]*)?$/.test(value))return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function customerWebsite(row:ExplorerClient){
 return row.website_reviewed_at&&/^\d{4}-\d{2}-\d{2}$/.test(row.website_reviewed_at)&&safeCompanyWebsite(row.website_source)?safeCompanyWebsite(row.website_url):null;
}
export function reviewedExportStudy(row:ExplorerClient){
 const s=row.case_study;
 return hasCaseStudy(row)&&s&&/^\d{4}-\d{2}-\d{2}$/.test(s.reviewed_at)&&
  ['title','scope','problem','approach','evidence','limitation'].every(k=>typeof s[k as keyof typeof s]==='string'&&s[k as keyof typeof s].trim())?s:null;
}
export function exportSelection(rows:ExplorerClient[],filters:ExplorerFilters,ids?:Set<string>){
 return filterExplorerClients(rows.filter(r=>!('visible' in r)||r.visible===true),filters).filter(r=>!ids||ids.has(r.id));
}
export function exportSummary(rows:ExplorerClient[]){
 return {customers:rows.length,countries:countryGroups(rows).length,caseStudies:rows.filter(reviewedExportStudy).length,logos:rows.filter(r=>r.logo_path||r.logo_url).length,websites:rows.filter(customerWebsite).length};
}
export function exportFilename(filters:ExplorerFilters,date:Date){
 const topic=filters.sector||filters.country&&countryName(filters.country)||'Customer-Selection';
 const slug=topic.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75)||'Customers';
 const localDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 return `ManWinWin_${slug}_${localDate}.pdf`;
}
export function exportFilterLabel(f:ExplorerFilters){
 return [`Sector: ${f.sector||'All sectors'}`,`Region: ${f.region||'All regions'}`,`Country: ${f.country?countryName(f.country):'All countries'}`,f.search?`Search: ${f.search}`:'',f.onlyCaseStudies?'With case study':'',f.includeHistorical?'Including historical customers':'Excluding historical customers'].filter(Boolean).join(' | ');
}

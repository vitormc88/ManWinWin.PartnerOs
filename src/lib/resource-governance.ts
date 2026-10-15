import { resourceLanguage } from './ux-discovery';

export const RESOURCE_PURPOSES = ['Brochure','Sales presentation','Demo','User manual','Installation guide','Technical reference','Pricing & licensing','Implementation & services','Business case','Other'] as const;
export type ResourceReview = {
  status: 'needs_review'|'recommended'|'archived';
  display_title: string; language: string; product: string; purpose: string; version_label: string;
  reviewed_at?: string; reviewed_by?: string;
};
export type ResourceRecord = {id:string;title:string;file_name?:string|null;file_type?:string|null;file_url?:string|null;tags?:string[]|null;content_review?:ResourceReview|null};
export function reviewOf(doc: ResourceRecord): ResourceReview {
  return doc.content_review?.status ? doc.content_review : {status:'needs_review',display_title:'',language:'',product:'',purpose:'',version_label:''};
}
export function resourceTitle(doc: ResourceRecord) { return reviewOf(doc).display_title || doc.title; }
export function proposedResourceTitle(doc: ResourceRecord): string {
  // Mechanical readability only: never expand unknown abbreviations or infer product/version.
  return doc.title.replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
}
export function resourceProposal(doc: ResourceRecord) {
  const language=resourceLanguage(doc);
  return {title:proposedResourceTitle(doc),language:language==='unconfirmed'?'':language};
}
export function validateResourceReview(review: ResourceReview): ResourceReview {
  const next={...review,display_title:review.display_title.trim(),product:review.product.trim(),version_label:review.version_label.trim()};
  if(!['needs_review','recommended','archived'].includes(next.status))throw new Error('Choose a valid editorial status.');
  if(next.language && !['en','pt','es','fr','multilingual','other'].includes(next.language))throw new Error('Choose a supported language.');
  if(next.purpose && !RESOURCE_PURPOSES.some(p=>p===next.purpose))throw new Error('Choose a resource purpose.');
  if(next.status==='recommended' && (!next.display_title||!next.language||!next.product||!next.purpose||!next.version_label))throw new Error('Recommended resources require a title, confirmed language, product, purpose and version label.');
  if([next.display_title,next.product,next.version_label].some(s=>s.length>240))throw new Error('Editorial fields must be at most 240 characters.');
  return next;
}
export function duplicateFilenameCounts(docs: ResourceRecord[]) {
  const counts=new Map<string,number>();
  for(const doc of docs){const key=doc.file_name?.trim().toLowerCase();if(key)counts.set(key,(counts.get(key)||0)+1);}
  return counts;
}

import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reviewOf,resourceTitle,resourceProposal,validateResourceReview,duplicateFilenameCounts, type ResourceReview } from '../resource-governance';
import { SECTOR_CATALOGUE,LEGACY_SECTORS,isKnownSector } from '@/data/sector-catalogue';
const doc={id:'1',title:'Mn_PWeb_EN_03',file_name:'Mn_PWeb_EN_03.pdf'};
const valid:ResourceReview={status:'recommended',display_title:'Reviewed manual',language:'en',product:'ManWinWin',purpose:'User manual',version_label:'Verified revision 03'};
describe('Resource editorial governance',()=>{
 it('never infers approval or version from filenames',()=>{expect(reviewOf(doc).status).toBe('needs_review');expect(resourceProposal(doc)).toEqual({title:'Mn PWeb EN 03',language:'en'});expect(resourceTitle(doc)).toBe(doc.title)});
 it('requires complete metadata for recommendation',()=>{for(const field of ['display_title','language','product','purpose','version_label'])expect(()=>validateResourceReview({...valid,[field]:''})).toThrow();expect(validateResourceReview(valid)).toEqual(valid)});
 it('accepts partial drafts without approving them',()=>{expect(validateResourceReview({...valid,status:'needs_review',language:'',version_label:''}).status).toBe('needs_review')});
 it('rejects invalid statuses/languages/purposes and oversized fields',()=>{for(const patch of [{status:'approved'},{language:'xx'},{purpose:'arbitrary'},{display_title:'x'.repeat(241)}])expect(()=>validateResourceReview({...valid,...patch} as ResourceReview)).toThrow()});
 it('keeps original filenames and groups repeated filenames rather than formats',()=>{const counts=duplicateFilenameCounts([doc,{...doc,id:'2'},{...doc,id:'3',file_name:'Mn_PWeb_EN_03.docx'}]);expect(counts.get('mn_pweb_en_03.pdf')).toBe(2);expect(counts.get('mn_pweb_en_03.docx')).toBe(1)});
 it('uses the reviewed display title without mutating the original',()=>{expect(resourceTitle({...doc,content_review:valid})).toBe(valid.display_title);expect(doc.title).toBe('Mn_PWeb_EN_03')});
});
describe('Shared sector catalogue',()=>{
 it('keeps potentially different industries distinct and retains historical labels',()=>{expect(SECTOR_CATALOGUE).toContain('Packaging & Paper');expect(SECTOR_CATALOGUE).toContain('Plastics, Paper & Packaging');expect(isKnownSector('Food & Beverages')).toBe(true);expect(isKnownSector('invented free text')).toBe(false)});
 it('matches every database accepted sector exactly to the versioned UI catalogue',()=>{const sql=readFileSync('supabase/migrations/20261015214702_content_governance.sql','utf8');const array=sql.match(/allowed text\[\]:=array\[([\s\S]*?)\];/)![1].replace(/--[^\n]*/g,'');const db=[...array.matchAll(/'([^']+)'/g)].map(m=>m[1]);expect(db.sort()).toEqual([...SECTOR_CATALOGUE,...LEGACY_SECTORS].sort());expect(new Set(db).size).toBe(db.length)});
});

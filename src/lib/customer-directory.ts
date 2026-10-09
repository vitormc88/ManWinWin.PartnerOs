import { countryCode, countryInfo, type ExplorerClient } from './customer-explorer';
export type EvidenceStatus = 'unconfirmed' | 'suggested' | 'validated';
export type DirectoryClient = ExplorerClient & {
  source_kind: 'partner' | 'hq';
  source_id: string;
  visible: boolean;
  evidence_status: EvidenceStatus;
  evidence_note: string | null;
  validated_at: string | null;
  validated_by: string | null;
  // HQ row / partner override revision, fetched only for authorized management.
  write_updated_at?: string | null;
  source_sector?: string | null;
  source_sector_at_review?: string | null;
  has_sector_override?: boolean;
  source_sector_changed?: boolean;
};
export type DirectoryInput = {
  client_id: string; name: string; country: string; sector: string | null;
  active: boolean | null; visible: boolean; evidence_status: EvidenceStatus;
  evidence_note: string | null;
};
export function clientKey(value: unknown) {
  const id=String(value??'').trim();
  if(!/^\d+$/.test(id))throw new Error('Client ID must contain digits only.');
  return id.replace(/^0+(?=\d)/,'');
}
export function validateDirectoryInput(input: DirectoryInput) {
  const key=clientKey(input.client_id);
  if(['0','9998'].includes(key))throw new Error('This ID is reserved for internal/test records.');
  if(!input.name.trim()||!input.country.trim())throw new Error('Company name and country are required.');
  if(!countryInfo(input.country))throw new Error('Choose a recognized country.');
  if(input.evidence_status==='validated'&&!input.sector?.trim())throw new Error('Choose a sector before validating it.');
  return {...input,client_id:input.client_id.trim(),name:input.name.trim(),country:countryCode(input.country),sector:input.sector?.trim()||null,evidence_note:input.evidence_note?.trim()||null};
}
export type ImportReview = { input: DirectoryInput; action: 'new' | 'update' | 'skip' | 'error'; message: string; existing?: DirectoryClient; row: number };
export function reviewDirectoryImport(rows: Record<string,unknown>[], existing: DirectoryClient[]): ImportReview[] {
  const byKey=new Map(existing.map(r=>[clientKey(r.client_id),r]));
  const seen=new Set<string>();
  return rows.map((r,index)=>{
    const sourceEvidence=String(r['Sector Evidence Status']??'');
    const input: DirectoryInput={client_id:String(r['Client ID']??''),name:String(r['Client Name']??r['Name']??''),country:String(r['Country']??''),sector:String(r['Sector (normalized)']??r['Sector']??'')||null,active:null,visible:true,evidence_status:sourceEvidence.startsWith('Suggested')||sourceEvidence.startsWith('Correction proposed')?'suggested':'unconfirmed',evidence_note:String(r['Sector Source URL']??r['Source']??'')||null};
    try {
      if(sourceEvidence.startsWith('Exclude')||!/^\d+$/.test(input.client_id.trim())||['0','9998'].includes(input.client_id.replace(/^0+(?=\d)/,'')))return {input,action:'skip',message:'Excluded: non-numeric ID or internal/test record.',row:index+2};
      const validated=validateDirectoryInput(input),key=clientKey(input.client_id);
      if(seen.has(key))throw new Error('Duplicate Client ID in this file.');
      seen.add(key);
      const current=byKey.get(key);
      if(current?.source_kind==='partner')return {input:validated,action:'skip',message:'Partner customer: managed from its existing source. Use sector review to correct it.',existing:current,row:index+2};
      // An Excel label is evidence, not authority to mark a sector as validated.
      // Preserve known lifecycle/visibility on updates; a file cannot invent active status.
      return {input:{...validated,active:current?.active??null,visible:current?.visible??true},action:current?'update':'new',message:current?'Existing HQ customer: review before replacing its name/country/sector.':'New HQ customer; status unconfirmed.',existing:current,row:index+2};
    }catch(error){return {input,action:'error',message:error instanceof Error?error.message:'Invalid row.',row:index+2};}
  });
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DirectoryClient, DirectoryInput, ImportReview } from "@/lib/customer-directory";
import {clientKey} from '@/lib/customer-directory';
import type {ExplorerCaseStudy} from '@/lib/customer-explorer';

export function useCustomerExplorer(manage=false,enabled=true) {
  return useQuery({
    queryKey: ["customer-explorer",manage?'hq':'network'],
    enabled,
    queryFn: async (): Promise<DirectoryClient[]> => {
      // Dedicated projection with RLS. Never fall back to clients.select('*').
      // Regenerate Supabase types after installing the reviewed SQL.
      const rows:DirectoryClient[]=[];
      // Page explicitly: Supabase's default response limit must not truncate the map.
      for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from("customer_explorer_directory" as never)
          .select("id,client_id,name,country,sector,active,partner,contact_name,contact_email,source_kind,source_id,visible,evidence_status,evidence_note,validated_at,validated_by")
          .order("id").range(offset,offset+499);
        if(error)throw error;
        rows.push(...((data||[]) as unknown as DirectoryClient[]));
        if(!data||data.length<500)break;
      }
      if(manage){
        const {data:reviewData,error:reviewError}=await supabase.rpc('customer_explorer_sector_review_data' as never);
        if(reviewError)throw new Error(reviewError.message);
        for(const source of (reviewData||[]) as unknown as {source_id:string;source_sector:string|null;source_sector_at_review:string|null;has_sector_override:boolean;source_sector_changed:boolean}[]){
          const row=rows.find(r=>r.source_kind==='partner'&&r.source_id===source.source_id);
          if(row)Object.assign(row,source);
        }
        for(const [table,kind,key] of [['customer_explorer_hq','hq','id'],['customer_explorer_overrides','partner','client_id']] as const){
          for(let offset=0;;offset+=500){
            const {data,error}=await supabase.from(table as never).select(`${key},evidence_note,updated_at`).order(key).range(offset,offset+499);
            if(error)throw error;
            for(const note of (data||[]) as unknown as Record<string,string|null>[]){const row=rows.find(r=>r.source_kind===kind&&r.source_id===note[key]);if(row){row.evidence_note=note.evidence_note;row.write_updated_at=note.updated_at;}}
            if(!data||data.length<500)break;
          }
        }
      }
      for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from('customer_explorer_media' as never)
          .select('client_key,logo_path,logo_dark,case_study,updated_at,website_url,website_source,website_reviewed_at').order('client_key').range(offset,offset+499);
        if(error)throw new Error(error.message);
        for(const media of (data||[]) as unknown as {client_key:string;logo_path:string|null;logo_dark:boolean;case_study:ExplorerCaseStudy|null;updated_at:string;website_url:string|null;website_source:string|null;website_reviewed_at:string|null}[]){
          const row=rows.find(r=>clientKey(r.client_id)===media.client_key);
          if(row)Object.assign(row,{logo_path:media.logo_path,logo_dark:media.logo_dark,case_study:media.case_study,media_updated_at:media.updated_at,website_url:media.website_url,website_source:media.website_source,website_reviewed_at:media.website_reviewed_at});
        }
        if(!data||data.length<500)break;
      }
      return rows.sort((a,b)=>a.name.localeCompare(b.name));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useDirectoryWrites(){
 const queryClient=useQueryClient();
 const refresh=()=>queryClient.invalidateQueries({queryKey:['customer-explorer']});
 const hqPayload=(input:DirectoryInput,current?:DirectoryClient)=>({...input,...(current?{id:current.source_id,expected_updated_at:current.write_updated_at}:{} )});
 const saveHq=async(payload:ReturnType<typeof hqPayload>[])=>{
   const {error}=await supabase.rpc('customer_explorer_save_hq_batch' as never,{items:payload} as never);
   if(error){await refresh();throw new Error(error.message);}
 };
 const onSave=async(input:DirectoryInput,current?:DirectoryClient)=>{
   if(current?.source_kind==='partner'){
    const payload={client_id:current.source_id,sector:input.sector,visible:input.visible,evidence_status:input.evidence_status,evidence_note:input.evidence_note};
    if(current.write_updated_at){
     const {data,error}=await supabase.from('customer_explorer_overrides' as never).update(payload as never)
      .eq('client_id',current.source_id).eq('updated_at',current.write_updated_at).select('client_id');
     if(error)throw new Error(error.message);
     if(!data?.length){await refresh();throw new Error('This customer changed. Refresh and review before saving.');}
    }else{
     const {error}=await supabase.from('customer_explorer_overrides' as never).insert(payload as never);
     if(error){await refresh();throw new Error(error.code==='23505'?'This customer changed. Refresh and review before saving.':error.message);}
    }
   }else await saveHq([hqPayload(input,current)]);
   await refresh();
 };
 const onImport=async(items:ImportReview[])=>{
   if(!items.length)return;
   if(items.some(r=>r.existing?.source_kind==='partner'))throw new Error('Import only reviewed HQ customers.');
   // One transaction: any conflict or invalid row rejects the whole batch.
   await saveHq(items.map(r=>hqPayload(r.input,r.existing)));
   await refresh();
 };
 const onMediaSave=async(current:DirectoryClient,patch:{logo_path?:string|null;logo_dark?:boolean;case_study?:ExplorerCaseStudy|null;website_url?:string|null;website_source?:string|null;website_reviewed_at?:string|null})=>{
   const key=clientKey(current.client_id);
   const payload={client_key:key,logo_path:current.logo_path||null,logo_dark:current.logo_dark||false,case_study:current.case_study||null,...patch};
   if(current.media_updated_at){
    const {data,error}=await supabase.from('customer_explorer_media' as never).update(payload as never)
     .eq('client_key',key).eq('updated_at',current.media_updated_at).select('client_key');
    if(error)throw new Error(error.message);
    if(!data?.length)throw new Error('This media entry was changed by another editor. Refresh and review before saving.');
   }else{
    const {error}=await supabase.from('customer_explorer_media' as never).insert(payload as never);
    if(error)throw new Error(error.message);
   }
   await refresh();
 };
 const onKeepSector=async(current:DirectoryClient)=>{
   const {error}=await supabase.rpc('customer_explorer_keep_sector' as never,{p_client_id:current.source_id,p_expected_updated_at:current.write_updated_at,p_expected_source:current.source_sector??null} as never);
   await refresh();
   if(error)throw new Error(error.message);
 };
 return {onSave,onImport,onMediaSave,onKeepSector};
}

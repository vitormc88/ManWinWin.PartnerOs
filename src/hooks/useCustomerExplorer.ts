import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DirectoryClient, DirectoryInput, ImportReview } from "@/lib/customer-directory";

export function useCustomerExplorer(manage=false) {
  return useQuery({
    queryKey: ["customer-explorer",manage?'hq':'network'],
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
        for(const [table,kind,key] of [['customer_explorer_hq','hq','id'],['customer_explorer_overrides','partner','client_id']] as const){
          for(let offset=0;;offset+=500){
            const {data,error}=await supabase.from(table as never).select(`${key},evidence_note`).order(key).range(offset,offset+499);
            if(error)throw error;
            for(const note of (data||[]) as unknown as Record<string,string|null>[]){const row=rows.find(r=>r.source_kind===kind&&r.source_id===note[key]);if(row)row.evidence_note=note.evidence_note;}
            if(!data||data.length<500)break;
          }
        }
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
 const hqPayload=(input:DirectoryInput,id?:string)=>({...input,...(id?{id}:{} )});
 const onSave=async(input:DirectoryInput,current?:DirectoryClient)=>{
   const table=current?.source_kind==='partner'?'customer_explorer_overrides':'customer_explorer_hq';
   const payload=current?.source_kind==='partner'?{client_id:current.source_id,sector:input.sector,visible:input.visible,evidence_status:input.evidence_status,evidence_note:input.evidence_note}:hqPayload(input,current?.source_id);
   const {error}=await supabase.from(table as never).upsert(payload as never,{onConflict:current?.source_kind==='partner'?'client_id':'client_key'});
   if(error)throw error;
   await refresh();
 };
 const onImport=async(items:ImportReview[])=>{
   const payload=items.map(r=>hqPayload(r.input,r.existing?.source_id));
   // One statement: a duplicate or invalid row rolls back the entire HQ batch.
   const {error}=await supabase.from('customer_explorer_hq' as never).upsert(payload as never,{onConflict:'client_key'});
   if(error)throw error;
   await refresh();
 };
 return {onSave,onImport};
}

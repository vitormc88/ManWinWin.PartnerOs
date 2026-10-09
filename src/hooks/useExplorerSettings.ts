import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
export type ExplorerMode='off'|'hq'|'pilot'|'all';
export type ExplorerSettings={mode:ExplorerMode;pilot_user_ids:string[];changed_at:string;sync_failed_at:string|null;sync_error_code:string|null};
export function useExplorerSettings(){
 const {user,profile}=useAuth();
 const qc=useQueryClient();
 const query=useQuery({queryKey:['customer-explorer-settings',user?.id],enabled:!!user&&profile?.is_hq===true&&profile?.is_active===true,
  queryFn:async()=>{const {data,error}=await supabase.rpc('customer_explorer_settings' as never);if(error)throw new Error(error.message);return data as unknown as ExplorerSettings;},retry:false});
 const configure=async(mode:ExplorerMode,pilotIds:string[])=>{
  const {error}=await supabase.rpc('customer_explorer_configure' as never,{new_mode:mode,pilot_ids:pilotIds} as never);
  if(error)throw new Error(error.message);
  await Promise.all(['customer-explorer-settings','customer-explorer-access','customer-explorer'].map(key=>qc.invalidateQueries({queryKey:[key]})));
 };
 return {...query,configure};
}

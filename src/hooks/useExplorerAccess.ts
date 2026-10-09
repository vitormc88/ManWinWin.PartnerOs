import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
export function useExplorerAccess(enabled=true){
 const {session,profile,isAuthReady}=useAuth();
 return useQuery({
  queryKey:['customer-explorer-access',session?.user.id],
  enabled:enabled&&isAuthReady&&!!session&&profile?.is_active===true,
  queryFn:async()=>{
   try {
   const {data,error}=await supabase.rpc('customer_explorer_access' as never);
   // Missing migration, connection failure or explicit denial must never enable access.
   if(error)return {read:false,manage:false};
   const access=data as unknown as {read?:boolean;manage?:boolean}|null;
   return {read:access?.read===true,manage:access?.manage===true};
   } catch {
    return {read:false,manage:false};
   }
  },
  staleTime:15_000,refetchInterval:30_000,refetchOnWindowFocus:true,retry:false,
 });
}

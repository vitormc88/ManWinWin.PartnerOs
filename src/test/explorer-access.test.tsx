import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderHook,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useExplorerAccess} from '@/hooks/useExplorerAccess';

const {rpc,auth}=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>auth()}));

function setup(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return renderHook(()=>useExplorerAccess(),{wrapper});
}
describe('Explorer database capability',()=>{
 beforeEach(()=>{
  cleanup();rpc.mockReset();
  auth.mockReturnValue({session:{user:{id:'hq-test'}},profile:{is_active:true},isAuthReady:true});
 });
 it('uses strict database read and manage booleans',async()=>{
  rpc.mockResolvedValue({data:{read:true,manage:false},error:null});
  const {result}=setup();
  await waitFor(()=>expect(result.current.data).toEqual({read:true,manage:false}));
  expect(rpc).toHaveBeenCalledWith('customer_explorer_access');
 });
 it('does not trust truthy strings',async()=>{
  rpc.mockResolvedValue({data:{read:'true',manage:1},error:null});
  const {result}=setup();
  await waitFor(()=>expect(result.current.data).toEqual({read:false,manage:false}));
 });
 it('fails closed on API errors',async()=>{
  rpc.mockResolvedValue({data:null,error:{message:'unavailable'}});
  const {result}=setup();
  await waitFor(()=>expect(result.current.data).toEqual({read:false,manage:false}));
 });
 it('revokes cached permission when a refresh throws',async()=>{
  rpc.mockResolvedValueOnce({data:{read:true,manage:true},error:null});
  const {result}=setup();
  await waitFor(()=>expect(result.current.data?.read).toBe(true));
  rpc.mockRejectedValueOnce(new Error('Network disconnected'));
  await result.current.refetch();
  await waitFor(()=>expect(result.current.data).toEqual({read:false,manage:false}));
 });
 it('does not query for an inactive profile',()=>{
  auth.mockReturnValue({session:{user:{id:'inactive'}},profile:{is_active:false},isAuthReady:true});
  setup();expect(rpc).not.toHaveBeenCalled();
 });
});

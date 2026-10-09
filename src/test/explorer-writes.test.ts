import {beforeEach,describe,expect,it,vi} from 'vitest';
import {useDirectoryWrites} from '@/hooks/useCustomerExplorer';
import type {DirectoryClient,DirectoryInput} from '@/lib/customer-directory';
const {rpc,from,invalidate,query}=vi.hoisted(()=>{
 const query={update:vi.fn(),insert:vi.fn(),eq:vi.fn(),select:vi.fn()};
 return {rpc:vi.fn(),from:vi.fn(),invalidate:vi.fn(),query};
});
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,from}}));
vi.mock('@tanstack/react-query',()=>({useQuery:vi.fn(),useQueryClient:()=>({invalidateQueries:invalidate})}));
const input:DirectoryInput={client_id:'00123',name:'Reviewed customer',country:'PT',sector:'Energy',active:null,visible:true,evidence_status:'suggested',evidence_note:null};
describe('Explorer guarded writes',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();rpc.mockResolvedValue({error:null});invalidate.mockResolvedValue(undefined);
  from.mockReturnValue(query);query.update.mockReturnValue(query);query.eq.mockReturnValue(query);
  query.select.mockResolvedValue({data:[{client_id:'source'}],error:null});
 });
 it('submits the reviewed revision with an existing HQ edit',async()=>{
  const current={source_kind:'hq',source_id:'source',write_updated_at:'2026-10-08T10:00:00Z'} as DirectoryClient;
  await useDirectoryWrites().onSave(input,current);
  expect(rpc).toHaveBeenCalledWith('customer_explorer_save_hq_batch',{items:[{...input,id:'source',expected_updated_at:current.write_updated_at}]});
  expect(from).not.toHaveBeenCalled();
 });
 it('propagates an atomic import conflict and refreshes the stale directory',async()=>{
  rpc.mockResolvedValue({error:{code:'PT409',message:'A reviewed customer changed'}});
  await expect(useDirectoryWrites().onImport([{input,action:'new',message:'Reviewed',row:2}])).rejects.toThrow('A reviewed customer changed');
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith({queryKey:['customer-explorer']});
 });
 it('refuses a partner edit when the reviewed override revision no longer matches',async()=>{
  query.select.mockResolvedValue({data:[],error:null});
  const current={source_kind:'partner',source_id:'source',write_updated_at:'2026-10-08T10:00:00Z'} as DirectoryClient;
  await expect(useDirectoryWrites().onSave(input,current)).rejects.toThrow('This customer changed');
  expect(query.eq).toHaveBeenCalledWith('updated_at',current.write_updated_at);
  expect(query.insert).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
 });
 it('never overwrites an override that was created after review',async()=>{
  query.insert.mockResolvedValue({error:{code:'23505',message:'Duplicate key'}});
  const current={source_kind:'partner',source_id:'source'} as DirectoryClient;
  await expect(useDirectoryWrites().onSave(input,current)).rejects.toThrow('This customer changed');
  expect(query.update).not.toHaveBeenCalled();
 });
});

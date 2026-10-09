import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {useDealsHealth} from './useDealsHealth';
const state=vi.hoisted(()=>({rows:{} as Record<string,any[]>,fail:''}));
vi.mock('@tanstack/react-query',()=>({useQuery:(options:any)=>options}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 const query:any={select:()=>query,in:()=>query,eq:()=>query,order:()=>query,range:async(from:number,to:number)=>({data:(state.rows[table]||[]).slice(from,to+1),error:state.fail===table?new Error('Unavailable'):null})};return query;
}}}));
beforeEach(()=>{state.rows={};state.fail='';vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());
const run=()=> (useDealsHealth([{id:'deal',stage:'Qualified',status:'Open',created_at:'2026-01-01',stage_entered_at:'2026-09-01',assigned_salesperson:'Owner',probability:null} as any]) as any).queryFn();
describe('Pipeline health source correctness',()=>{
 it('uses the newest effective activity date rather than insertion order',async()=>{
 state.rows.deal_activities=[{id:'1',deal_id:'deal',activity_type:'call',activity_date:'2026-10-08',created_at:'2026-10-08'},{id:'2',deal_id:'deal',activity_type:'call',activity_date:'2026-09-01',created_at:'2026-10-09'}];
 const map=await run();expect(map.get('deal').lastActivityAt.toISOString().slice(0,10)).toBe('2026-10-08');expect(map.get('deal').baseProbability).toBe(20);
 });
 it('surfaces a source error instead of calculating misleading health',async()=>{state.fail='deal_tasks';await expect(run()).rejects.toThrow('Unavailable');});
 it('reads activity beyond the first API page',async()=>{
 state.rows.deal_activities=Array.from({length:1001},(_,i)=>({id:String(i),deal_id:'deal',activity_type:'call',activity_date:i===1000?'2026-10-09':'2026-01-01',created_at:'2026-01-01'}));
 const map=await run();expect(map.get('deal').lastActivityAt.toISOString().slice(0,10)).toBe('2026-10-09');
 });
});

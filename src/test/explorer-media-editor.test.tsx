import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DirectoryMediaEditor} from '@/components/customer-explorer/DirectoryMediaEditor';
import type {DirectoryClient} from '@/lib/customer-directory';
vi.mock('@/components/customer-explorer/CustomerLogo',()=>({CustomerLogo:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:vi.fn()}}}));
const client:DirectoryClient={id:'fixture',client_id:'123',name:'Test customer',country:'PT',sector:'Manufacturing',active:null,partner:'HQ',contact_name:'Customer Care',contact_email:'customercare@manwinwin.com',source_kind:'hq',source_id:'fixture',visible:false,evidence_status:'unconfirmed',evidence_note:null,validated_at:null,validated_by:null};
describe('Permanent media editor',()=>{
 beforeEach(()=>cleanup());
 it('saves a complete curated case schema including an explicit review date',async()=>{
  const save=vi.fn().mockResolvedValue(undefined);
  render(<DirectoryMediaEditor client={client} onSave={save}/>);
  for(const label of ['Title','Public case-study URL','Language','Customer / project scope','Challenge','Approach','Published evidence','Limitations / context'])fireEvent.change(screen.getByLabelText(label),{target:{value:label==='Public case-study URL'?'https://www.manwinwin.com/cmms-case-studies/':'TEST'}});
  fireEvent.change(screen.getByLabelText('Source review date'),{target:{value:'2026-10-08'}});
  fireEvent.click(screen.getByText('Save reviewed case study'));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(client,{case_study:expect.objectContaining({reviewed_at:'2026-10-08',limitation:'TEST',scope:'TEST'})}));
 });
 it('unlinks a logo without deleting a Storage object',async()=>{
  const save=vi.fn().mockResolvedValue(undefined),withLogo={...client,logo_path:'123/a.png'};
  render(<DirectoryMediaEditor client={withLogo} onSave={save}/>);
  fireEvent.click(screen.getByText('Remove logo from directory'));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(withLogo,{logo_path:null}));
 });
 it('rejects unsupported uploads before storing anything',async()=>{
  const save=vi.fn();render(<DirectoryMediaEditor client={client} onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Upload confirmed logo'),{target:{files:[new File(['<svg/>'],'test.svg',{type:'image/svg+xml'})]}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Use PNG, JPEG or WebP');
  expect(save).not.toHaveBeenCalled();
 });
});

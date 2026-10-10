import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DirectoryMediaEditor} from '@/components/customer-explorer/DirectoryMediaEditor';
import {CustomerExplorer} from '@/components/customer-explorer/CustomerExplorer';
import {customerWebsite,safeCompanyWebsite} from '@/lib/customer-export';
import type {DirectoryClient} from '@/lib/customer-directory';
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:vi.fn()}}}));
vi.mock('@/components/customer-explorer/CustomerLogo',()=>({CustomerLogo:()=>null}));
const row:DirectoryClient={id:'website-fixture',client_id:'9101',name:'Website Fixture',country:'PT',sector:'Manufacturing',active:true,visible:true,partner:'HQ',contact_name:'Customer Care',contact_email:null,source_kind:'hq',source_id:'fixture-source',evidence_status:'unconfirmed',evidence_note:null,validated_at:null,validated_by:null,website_url:'https://www.example.com/',website_source:'https://www.example.com/about',website_reviewed_at:'2026-10-10'};
afterEach(cleanup);
describe('Reviewed websites',()=>{
 it.each(['javascript:alert(1)','http://example.com','https://user:pass@example.com/','https://127.0.0.1/','https://localhost/','https://example.com\\evil','https://example.com/ bad'])('rejects unsafe URL %s',url=>expect(safeCompanyWebsite(url)).toBeNull());
 it('does not invent websites from familiar names or publish missing evidence',()=>{
  expect(customerWebsite({...row,name:'Novarroz',website_url:null})).toBeNull();
  expect(customerWebsite({...row,website_source:null})).toBeNull();
  expect(customerWebsite(row)).toBe('https://www.example.com/');
 });
 it('shows a safe external link in the customer card',()=>{
  render(<CustomerExplorer clients={[row]}/>);
  const link=screen.getByRole('link',{name:'Company website'});
  expect(link).toHaveAttribute('href',row.website_url);expect(link).toHaveAttribute('rel','noopener noreferrer');
 });
 it('HQ website save contains only website fields, preserving logo and case study',async()=>{
  const save=vi.fn().mockResolvedValue(undefined);render(<DirectoryMediaEditor client={row} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Save reviewed website'}));
  expect(save).toHaveBeenCalledWith(row,{website_url:row.website_url,website_source:row.website_source,website_reviewed_at:row.website_reviewed_at});
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));
 });
 it('HQ unlink clears all website evidence without changing customer media',async()=>{
  const save=vi.fn().mockResolvedValue(undefined);render(<DirectoryMediaEditor client={row} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Remove website'}));
  expect(save).toHaveBeenCalledWith(row,{website_url:null,website_source:null,website_reviewed_at:null});
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));
 });
});

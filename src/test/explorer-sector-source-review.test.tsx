import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DirectoryManager} from '@/components/customer-explorer/DirectoryManager';
import type {DirectoryClient} from '@/lib/customer-directory';
vi.mock('@/components/customer-explorer/CustomerLogo',()=>({CustomerLogo:()=>null}));
vi.mock('@/components/customer-explorer/DirectoryMediaEditor',()=>({DirectoryMediaEditor:()=>null}));
afterEach(cleanup);
const partner:DirectoryClient={id:'p',client_id:'123',name:'Fixture partner',country:'PT',sector:'Healthcare & Pharma',active:true,partner:'Partner',contact_name:'Owner',contact_email:null,source_kind:'partner',source_id:'p',visible:true,evidence_status:'suggested',evidence_note:null,validated_at:null,validated_by:null,source_sector:'Manufacturing',source_sector_at_review:'Industry',has_sector_override:true,source_sector_changed:true};
function setup(row=partner){const save=vi.fn(),keep=vi.fn().mockResolvedValue(undefined);render(<DirectoryManager rows={[row]} onSave={save} onImport={vi.fn()} onClose={vi.fn()} onKeepSector={keep}/>);return {save,keep};}
describe('HQ sector source review',()=>{
 it('warns about a source change without overwriting or acknowledging anything',()=>{const before=JSON.stringify(partner);const {save,keep}=setup();expect(screen.getByRole('status')).toHaveTextContent('1 source sector changes');expect(save).not.toHaveBeenCalled();expect(keep).not.toHaveBeenCalled();expect(JSON.stringify(partner)).toBe(before);});
 it('shows both sources and does not label a suggestion as validated',()=>{setup();fireEvent.click(screen.getByRole('button',{name:'Edit'}));const section=screen.getByRole('region',{name:'Sector source review'});expect(within(section).getByText('Clients & Licenses: Manufacturing')).toBeInTheDocument();expect(section).toHaveTextContent('Explorer override · not HQ-validated');expect(within(section).getByRole('alert')).toHaveTextContent('Industry → Manufacturing');});
 it('requires an explicit acknowledgement to retain the Explorer sector',async()=>{const {keep,save}=setup();fireEvent.click(screen.getByRole('button',{name:'Edit'}));fireEvent.click(screen.getByRole('button',{name:'Reviewed: keep Explorer sector'}));expect(keep).toHaveBeenCalledWith(partner);expect(save).not.toHaveBeenCalled();expect(await screen.findByText('Source change reviewed. The Explorer sector was kept.')).toBeInTheDocument();});
 it('does not warn for an unchanged source despite different normalized names',()=>{setup({...partner,source_sector:'Industry',source_sector_changed:false});expect(screen.queryByRole('status')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Edit'}));expect(screen.queryByRole('button',{name:'Reviewed: keep Explorer sector'})).not.toBeInTheDocument();});
 it('filters source changes separately from other unvalidated sectors',()=>{setup({...partner,source_sector_changed:false});fireEvent.change(screen.getByRole('combobox',{name:'Review filter'}),{target:{value:'source_changed'}});expect(screen.queryByRole('cell',{name:'Fixture partner'})).not.toBeInTheDocument();});
});

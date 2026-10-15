import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { CustomerExplorer } from '@/components/customer-explorer/CustomerExplorer';
import type { ExplorerClient } from '@/lib/customer-explorer';
vi.mock('@/components/customer-explorer/CustomerLogo',()=>({CustomerLogo:()=>null}));
vi.mock('@/components/customer-explorer/CustomerCaseStudy',()=>({CustomerCaseStudy:()=>null}));
vi.mock('@/components/customer-explorer/CustomerExportDialog',()=>({CustomerExportDialog:()=>null}));
const rows:ExplorerClient[]=[{id:'1',name:'Example Peru',country:'PE',sector:'Healthcare',active:true,partner:'HQ',contact_name:'Customer Care',contact_email:null},{id:'2',name:'Example Romania',country:'RO',sector:'Manufacturing',active:true,partner:'HQ',contact_name:'Customer Care',contact_email:null}];
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({features:[]})}));Element.prototype.scrollIntoView=vi.fn();});afterEach(async()=>{await act(async()=>{await Promise.resolve()});cleanup();vi.unstubAllGlobals()});
describe('Explorer discovery',()=>{
  it('preserves the map by default, allows hiding it and keeps the results',()=>{render(<CustomerExplorer clients={rows}/>);expect(document.getElementById('ce-global-map')).not.toHaveAttribute('hidden');fireEvent.click(screen.getByRole('button',{name:'Hide map'}));expect(document.getElementById('ce-global-map')).toHaveAttribute('hidden');expect(screen.getByRole('heading',{name:'Example Peru'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Show map'}));expect(document.getElementById('ce-global-map')).not.toHaveAttribute('hidden');});
  it('updates filtered totals and moves keyboard focus to the results',()=>{render(<CustomerExplorer clients={rows}/>);fireEvent.change(screen.getByRole('combobox',{name:'Country'}),{target:{value:'PE'}});expect(screen.getByRole('heading',{name:'Example Peru'})).toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Example Romania'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'View results ↓'}));expect(screen.getByRole('heading',{name:'Peru'})).toHaveFocus();expect(screen.getByText(/Country ranking ignores the country selection/)).toBeInTheDocument();});
});

import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { RoleApplyReview } from './RoleApplyReview';
const state=vi.hoisted(()=>({error:false,mutate:vi.fn()}));
vi.mock('@/hooks/useUsers',()=>({useUsers:()=>({data:[{id:'1',full_name:'Example partner',is_hq:false,is_active:true,partner_name:'Example partner company',roles:['partner_sales']},{id:'2',full_name:'HQ only',is_hq:true,is_active:true,roles:['hq_admin']}],isLoading:false,isError:state.error})}));
vi.mock('@/hooks/useRoleTemplates',()=>({useApplyRoleTemplate:()=>({mutate:state.mutate,isPending:false})}));
beforeEach(()=>{state.error=false;state.mutate.mockReset()});afterEach(cleanup);
function show(disabled=false){render(<RoleApplyReview role="partner_sales" label="Partner Sales" disabled={disabled}/>);}
function open(){fireEvent.click(screen.getByRole('button',{name:'Review application to existing users'}));}
describe('Role application review',()=>{
  it('previews role members and Cancel does not change permissions',()=>{show();open();expect(screen.getByText(/1 accounts with this role/)).toBeInTheDocument();expect(screen.getByText(/Example partner ·/)).toBeInTheDocument();expect(screen.queryByText('HQ only')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(state.mutate).not.toHaveBeenCalled();});
  it('requires saved edits before review can open',()=>{show(true);expect(screen.getByRole('button')).toBeDisabled();expect(state.mutate).not.toHaveBeenCalled();});
  it('preserves overrides by default and calls the existing workflow only on confirmation',()=>{show();open();expect(state.mutate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Apply preserving overrides'}));expect(state.mutate).toHaveBeenCalledWith({role:'partner_sales',overwriteOverrides:false});});
  it('makes overwrite explicit, and resets it on reopening',()=>{show();open();fireEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('alert')).toHaveTextContent('Custom exceptions will be removed');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));open();expect(screen.getByRole('checkbox')).not.toBeChecked();expect(state.mutate).not.toHaveBeenCalled();});
  it('blocks applying when the candidate list failed to load',()=>{state.error=true;show();open();expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Apply preserving overrides'})).toBeDisabled();});
});

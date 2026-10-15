import { afterEach,describe,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserManagement from '@/pages/UserManagement';
const state=vi.hoisted(()=>({admin:true,error:false,mutate:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({isAdmin:state.admin})}));
vi.mock('@/hooks/useUsers',()=>({useUsers:()=>({data:[{id:'1',full_name:'HQ Example',email:'hq@example.invalid',is_hq:true,is_active:true,invitation_status:'active',partner_id:null,roles:['hq_admin']},{id:'2',full_name:'Partner Example',email:'partner@example.invalid',is_hq:false,is_active:false,invitation_status:'pending',partner_id:'p1',partner_name:'Example Partner Co',roles:['partner_sales']}],isError:state.error,isLoading:false,refetch:vi.fn()}),useUpdateUser:()=>({mutateAsync:state.mutate})}));
vi.mock('@/components/users/UserEditDialog',()=>({UserEditDialog:()=>null}));
vi.mock('@/components/users/UserCreateDialog',()=>({UserCreateDialog:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
afterEach(()=>{cleanup();state.admin=true;state.error=false;state.mutate.mockReset()});
function show(){render(<MemoryRouter><UserManagement/></MemoryRouter>)}
describe('User directory filters',()=>{
 it('combines filters and clears them without changing accounts',()=>{show();fireEvent.change(screen.getByRole('combobox',{name:'Filter by role'}),{target:{value:'partner_sales'}});expect(screen.queryByText('HQ Example')).not.toBeInTheDocument();expect(screen.getByText('Partner Example')).toBeInTheDocument();fireEvent.change(screen.getByRole('combobox',{name:'Filter by account status'}),{target:{value:'active'}});expect(screen.getByText('No users found')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));expect(screen.getByText('HQ Example')).toBeInTheDocument();expect(state.mutate).not.toHaveBeenCalled()});
 it('shows an error instead of a false empty list',()=>{state.error=true;show();expect(screen.getByRole('alert')).toBeInTheDocument()});
 it('does not render administration controls for a non-admin',()=>{state.admin=false;show();expect(screen.queryByRole('combobox',{name:'Filter by role'})).not.toBeInTheDocument();expect(state.mutate).not.toHaveBeenCalled()});
});

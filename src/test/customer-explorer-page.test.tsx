import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import Page from '@/pages/CustomerExplorer';

const {access,read}=vi.hoisted(()=>({access:vi.fn(),read:vi.fn()}));
vi.mock('@/hooks/useExplorerAccess',()=>({useExplorerAccess:()=>access()}));
vi.mock('@/hooks/useCustomerExplorer',()=>({useCustomerExplorer:(...args:unknown[])=>read(...args),useDirectoryWrites:()=>({onSave:vi.fn(),onImport:vi.fn()})}));
vi.mock('@/components/customer-explorer/CustomerExplorer',()=>({CustomerExplorer:()=> <div>Customer map</div>}));
vi.mock('@/components/customer-explorer/DirectoryManager',()=>({DirectoryManager:()=> <div>HQ manager</div>}));

describe('Explorer page permissions',()=>{
 beforeEach(()=>{cleanup();access.mockReset();read.mockReset();read.mockReturnValue({data:[],isLoading:false,refetch:vi.fn()});});
 it('allows HQ management only with the database manage capability',()=>{
  access.mockReturnValue({data:{read:true,manage:true},isLoading:false});
  render(<Page/>);expect(read).toHaveBeenCalledWith(true,true);
  fireEvent.click(screen.getByText('Manage directory'));
  expect(screen.getByText('HQ manager')).toBeInTheDocument();
 });
 it('keeps read-only members out of management and HQ notes',()=>{
  access.mockReturnValue({data:{read:true,manage:false},isLoading:false});
  render(<Page/>);expect(read).toHaveBeenCalledWith(false,true);
  expect(screen.getByText('Customer map')).toBeInTheDocument();
  expect(screen.queryByText('Manage directory')).not.toBeInTheDocument();
 });
 it('disables data loading and hides the map when access is revoked',()=>{
  access.mockReturnValue({data:{read:false,manage:false},isLoading:false});
  render(<Page/>);expect(read).toHaveBeenCalledWith(false,false);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Customer map')).not.toBeInTheDocument();
 });
 it('does not reuse stale permission data after an error',()=>{
  access.mockReturnValue({data:{read:true,manage:true},isError:true,isLoading:false});
  render(<Page/>);expect(read).toHaveBeenCalledWith(false,false);
  expect(screen.queryByText('Customer map')).not.toBeInTheDocument();
 });
});

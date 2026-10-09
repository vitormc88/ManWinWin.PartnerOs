import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Page from '@/pages/CustomerExplorerSettings';
const {settings,configure}=vi.hoisted(()=>({settings:vi.fn(),configure:vi.fn()}));
vi.mock('@/hooks/useExplorerSettings',()=>({useExplorerSettings:()=>settings()}));
vi.mock('@/hooks/useUsers',()=>({useUsers:()=>({data:[{id:'test-partner',full_name:'Test Partner',is_active:true,is_hq:false,partner_id:'p',partner_name:'Test Company',invitation_status:'accepted'}]})}));
describe('Explorer Settings',()=>{
 beforeEach(()=>{cleanup();configure.mockReset();configure.mockResolvedValue(undefined);settings.mockReturnValue({data:{mode:'hq',pilot_user_ids:[],sync_failed_at:null},configure});});
 it('saves a kill switch without needing Explorer read access',async()=>{
  render(<MemoryRouter><Page/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Explorer availability'),{target:{value:'off'}});
  fireEvent.click(screen.getByText('Save Explorer settings'));
  await waitFor(()=>expect(configure).toHaveBeenCalledWith('off',[]));
 });
 it('requires an explicitly selected account for pilot activation',()=>{
  render(<MemoryRouter><Page/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Explorer availability'),{target:{value:'pilot'}});
  expect(screen.getByText('Save Explorer settings')).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:'Test Partner · Test Company'}));
  expect(screen.getByText('Save Explorer settings')).not.toBeDisabled();
 });
 it('does not render controls if the database refuses settings access',()=>{
  settings.mockReturnValue({error:new Error('Access denied'),configure});
  render(<MemoryRouter><Page/></MemoryRouter>);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Save Explorer settings')).not.toBeInTheDocument();
 });
});

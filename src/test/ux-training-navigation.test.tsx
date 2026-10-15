import { afterEach,describe,it,expect,vi } from 'vitest';
import { cleanup,render,screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComingSoon from '@/pages/ComingSoon';
const state=vi.hoisted(()=>({allowed:[] as string[]}));
vi.mock('@/hooks/useModuleAccess',()=>({useModuleAccess:()=>({isResolved:true,canView:(key:string)=>state.allowed.includes(key)})}));
afterEach(cleanup);
describe('Training guidance respects module access',()=>{
  it('links to existing training when Academy and resources are available',()=>{state.allowed=['onboarding','knowledge_base'];render(<MemoryRouter initialEntries={['/training']}><ComingSoon/></MemoryRouter>);expect(screen.getByRole('link',{name:'Open Partner Academy'})).toHaveAttribute('href','/academy');expect(screen.getByRole('link',{name:'Find learning resources'})).toHaveAttribute('href','/knowledge');});
  it('does not offer navigation to modules outside the account permissions',()=>{state.allowed=[];render(<MemoryRouter initialEntries={['/training']}><ComingSoon/></MemoryRouter>);expect(screen.queryByRole('link')).not.toBeInTheDocument();expect(screen.getByText(/separate training area/)).toBeInTheDocument();});
});

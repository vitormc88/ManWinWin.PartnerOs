import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => ({ isLoading: false, data: [
    { id: 'pending', email: 'pending@example.test', full_name: 'Pending QA', is_active: true, invitation_status: 'pending', roles: ['partner_sales'], partner_name: 'Synthetic Partner' },
    { id: 'active', email: 'active@example.test', full_name: 'Active QA', is_active: true, invitation_status: 'active', roles: ['partner_admin'], partner_name: 'Synthetic Partner' },
    { id: 'disabled', email: 'disabled@example.test', full_name: 'Disabled QA', is_active: false, invitation_status: 'active', roles: ['partner_sales'] },
  ] }), useUpdateUser: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/components/users/UserCreateDialog', () => ({ UserCreateDialog: () => null }));
vi.mock('@/components/users/UserEditDialog', () => ({ UserEditDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('sonner', () => ({ toast: mocks }));
import UserManagement from './UserManagement';
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: { success: true, kind: 'recovery' }, error: null }); });
afterEach(cleanup);
it('offers recovery for both pending and active users, but not disabled users', () => {
  render(<MemoryRouter><UserManagement /></MemoryRouter>);
  expect(screen.getAllByTitle('Send password recovery')).toHaveLength(1);
  expect(screen.getAllByTitle('Resend invitation / recover access')).toHaveLength(1);
});
it('requests recovery on the original identity and surfaces provider errors', async () => {
  mocks.invoke.mockResolvedValue({ error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'Email rate limit exceeded' }), { status: 429 }) } });
  render(<MemoryRouter><UserManagement /></MemoryRouter>);
  fireEvent.click(screen.getByTitle('Send password recovery'));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Email rate limit exceeded'));
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.invoke).toHaveBeenCalledWith('admin-create-user', { body: { action: 'recover_access', user_id: 'active', email: 'active@example.test', redirectTo: 'https://partneros-manwinwin.lovable.app/reset-password' } });
});
it('reports a recovery request as recovery rather than a new invitation', async () => {
  render(<MemoryRouter><UserManagement /></MemoryRouter>);
  fireEvent.click(screen.getByTitle('Send password recovery'));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Password recovery email requested')));
});

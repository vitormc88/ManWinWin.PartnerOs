import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as unknown,
  getSession: vi.fn(), onAuthStateChange: vi.fn(), resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(), getUser: vi.fn(), signOut: vi.fn(),
  toastSuccess: vi.fn(), toastError: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: mocks } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: mocks.session, isLoading: false, isAuthReady: true, isInviteOrRecoveryFlow: false }) }));
vi.mock('@/components/BrandMark', () => ({ BrandMark: () => <span>PartnerOS</span> }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
import Auth from './Auth';
import ResetPassword from './ResetPassword';
import { initialAuthFlow, clearInitialAuthFlow } from '@/lib/auth-flow';

beforeEach(() => {
  vi.clearAllMocks(); clearInitialAuthFlow(); mocks.session = null;
  window.history.replaceState({}, '', '/auth');
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(() => { cleanup(); clearInitialAuthFlow(); });

describe('access recovery navigation', () => {
  it('Request a new link opens the actual recovery form', () => {
    window.history.replaceState({}, '', '/auth?forgot=1');
    render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign In' })).not.toBeInTheDocument();
  });
  it('allows recovery form even when another account has a session', () => {
    mocks.session = { user: { id: 'other-account' } };
    window.history.replaceState({}, '', '/auth?forgot=1');
    render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
  });
  it('does not accept an unrelated existing session as an activation link', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'other-account' } } } });
    window.history.replaceState({}, '', '/reset-password');
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Missing invitation token')).toBeInTheDocument());
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Update Password' })).not.toBeInTheDocument();
  });
  it('does not accept a spoofed invite marker without credentials', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'other-account' } } } });
    window.history.replaceState({}, '', '/reset-password?type=invite');
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Missing invitation token')).toBeInTheDocument());
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('does not activate a profile when saving the password fails', async () => {
    initialAuthFlow.shouldForcePasswordSetup = true;
    initialAuthFlow.hasTokens = true;
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'qa-account' } } } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'qa-account' } }, error: null });
    mocks.updateUser.mockResolvedValue({ error: new Error('Password update failed') });
    window.history.replaceState({}, '', '/reset-password');
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update Password' })).toBeInTheDocument());
    for (const field of screen.getAllByPlaceholderText('••••••••')) fireEvent.change(field, { target: { value: 'synthetic-test-only-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Password update failed'));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
  it('shows an expired link with a recovery path' , async () => {
    window.history.replaceState({}, '', '/reset-password?error_code=otp_expired');
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Invitation expired')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

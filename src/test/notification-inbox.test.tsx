import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarkNotificationsRead, useNotificationInbox, useNotificationUnreadCount } from '@/hooks/useNotificationInbox';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'recipient' }, isAuthReady: true }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('sonner', () => ({ toast: { error: mocks.toast } }));
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
beforeEach(() => vi.clearAllMocks());
describe('notification inbox', () => {
  it('counts unread rows independently of the loaded page', async () => {
    const eq = vi.fn().mockResolvedValue({ count: 81, error: null });
    const select = vi.fn(() => ({ eq })); mocks.from.mockReturnValue({ select });
    const { result } = renderHook(() => useNotificationUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(81));
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eq).toHaveBeenCalledWith('is_read', false);
  });
  it('fetches the requested page with stable ordering', async () => {
    const range = vi.fn().mockResolvedValue({ data: [{ id: 'n' }], count: 81, error: null });
    const query: any = { order: vi.fn(() => query), range, select: vi.fn(() => query) };
    mocks.from.mockReturnValue(query);
    const { result } = renderHook(() => useNotificationInbox(true, { page: 2 }), { wrapper });
    await waitFor(() => expect(result.current.data?.total).toBe(81));
    expect(range).toHaveBeenCalledWith(50, 74);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: false });
  });
  it('does not present a failed count as zero', async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: async () => ({ error: new Error('offline') }) }) });
    const { result } = renderHook(() => useNotificationUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it('marks all through the server operation, without page IDs', async () => {
    mocks.rpc.mockResolvedValue({ data: 81, error: null });
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper });
    await result.current.mutateAsync(null);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_notifications_read', { _notification_id: null });
  });
  it('reports failed writes', async () => {
    mocks.rpc.mockResolvedValue({ error: new Error('denied') });
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper });
    await expect(result.current.mutateAsync('n')).rejects.toThrow('denied');
    expect(mocks.toast).toHaveBeenCalled();
  });
});

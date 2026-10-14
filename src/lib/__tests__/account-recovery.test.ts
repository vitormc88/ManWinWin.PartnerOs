import { describe, it, expect, vi } from 'vitest';
import { findAuthUser, getResetUrl, sendAccessLink } from '../../../supabase/functions/admin-create-user/recovery';
import { createAdminUserHandler } from '../../../supabase/functions/admin-create-user/handler';
import { resolvePublishedAppUrl } from '../app-url';

const testUrl = 'https://avxxzmoayxzrykwqzoqn.supabase.co';
const prodUrl = 'https://qownzparzsaeoyccgwuj.supabase.co';
const email = 'qa@example.test';
const user = { id: 'qa-id', email, email_confirmed_at: null };

function fixture(options: { confirmed?: boolean; active?: boolean; callerRole?: boolean; callerActive?: boolean; callerHq?: boolean; status?: string; sendError?: object } = {}) {
  const target = { ...user, email_confirmed_at: options.confirmed ? '2026-10-14' : null };
  const updates: unknown[] = [];
  const auth = {
    admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: target }, error: null }),
      listUsers: vi.fn().mockResolvedValue({ data: { users: [target] }, error: null }),
      inviteUserByEmail: vi.fn().mockResolvedValue({ error: options.sendError ?? null }),
      createUser: vi.fn(), deleteUser: vi.fn(), updateUserById: vi.fn(),
    },
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: options.sendError ?? null }),
  };
  const from = vi.fn((table: string) => {
    let id = ''; let update: unknown;
    const query: any = {
      select: () => query,
      eq: (key: string, value: string) => { if (key === 'id') id = value; return query; },
      update: (value: unknown) => { update = value; updates.push(value); return query; },
      single: async () => ({ data: id === 'caller' ? { is_hq: options.callerHq ?? true, is_active: options.callerActive ?? true } : { id, is_active: options.active ?? true, invitation_status: options.status ?? 'pending' }, error: null }),
      then: (resolve: any) => resolve({ data: table === 'user_roles' ? (options.callerRole === false ? [] : [{ role: 'hq_admin' }]) : update, error: null }),
      insert: vi.fn(),
    };
    return query;
  });
  const admin = { auth, from };
  const caller = { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'caller' } }, error: null }) } };
  const createClient = vi.fn((_url: string, key: string) => key === 'service' ? admin : caller);
  const handler = createAdminUserHandler(createClient, { get: (key: string) => ({ SUPABASE_URL: testUrl, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' })[key] });
  const request = (body: unknown, authorized = true) => handler(new Request('https://edge.example.test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer synthetic' } : {}) }, body: JSON.stringify(body) }));
  return { auth, updates, from, request };
}

describe('environment isolation', () => {
  it.each([testUrl, prodUrl])('frontend and edge agree for %s', url => {
    expect(getResetUrl(url)).toBe(resolvePublishedAppUrl(url) + '/reset-password');
  });
  it('rejects unknown projects and lookalike hosts', () => {
    expect(() => getResetUrl('https://qownzparzsaeoyccgwuj.supabase.co.attacker.test')).toThrow();
    expect(() => resolvePublishedAppUrl('https://unknown.supabase.co')).toThrow();
  });
});

describe('existing account lookup and access email', () => {
  it('finds an existing account beyond page one', async () => {
    const listUsers = vi.fn().mockResolvedValueOnce({ data: { users: Array.from({ length: 100 }, (_, i) => ({ id: String(i), email: `${i}@example.test` })) }, error: null }).mockResolvedValueOnce({ data: { users: [user] }, error: null });
    expect(await findAuthUser({ listUsers }, email)).toEqual(user);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 100 });
  });
  it('propagates lookup failures instead of claiming user not found', async () => {
    await expect(findAuthUser({ listUsers: vi.fn().mockResolvedValue({ error: new Error('Auth unavailable') }) }, email)).rejects.toThrow('Auth unavailable');
  });
  it('rejects a mismatched ID/email pair', async () => {
    await expect(findAuthUser({ getUserById: vi.fn().mockResolvedValue({ data: { user } }) }, 'other@example.test', user.id)).rejects.toThrow('do not match');
  });
  it('handles a concurrent confirmation with recovery', async () => {
    const auth = { admin: { inviteUserByEmail: vi.fn().mockResolvedValue({ error: { code: 'email_exists' } }) }, resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }) };
    expect(await sendAccessLink(auth, user, getResetUrl(testUrl))).toBe('recovery');
  });
  it('does not hide rate limits by trying another send', async () => {
    const error = new Error('Email rate limit exceeded');
    const auth = { admin: { inviteUserByEmail: vi.fn().mockResolvedValue({ error }) }, resetPasswordForEmail: vi.fn() };
    await expect(sendAccessLink(auth, user, getResetUrl(testUrl))).rejects.toThrow('rate limit');
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe('admin endpoint recovery lifecycle', () => {
  it('resends a pending unconfirmed invitation on the same identity', async () => {
    const f = fixture(); const response = await f.request({ action: 'recover_access', user_id: user.id, email, redirectTo: 'https://attacker.test' });
    expect(response.status).toBe(200); expect((await response.json()).kind).toBe('invite');
    expect(f.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(email, { redirectTo: getResetUrl(testUrl) });
    expect(f.updates).toEqual([{ invitation_sent_at: expect.any(String) }]);
    expect(f.auth.admin.createUser).not.toHaveBeenCalled(); expect(f.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
  it('recovers confirmed accounts still shown as pending', async () => {
    const f = fixture({ confirmed: true }); const response = await f.request({ action: 'resend_invite', email });
    expect((await response.json()).kind).toBe('recovery');
    expect(f.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith(email, { redirectTo: getResetUrl(testUrl) });
  });
  it('recovers an active account without resetting its lifecycle', async () => {
    const f = fixture({ confirmed: true, status: 'active' }); const response = await f.request({ action: 'recover_access', email, user_id: user.id });
    expect(response.status).toBe(200); expect(f.updates).toEqual([]);
    expect(f.from.mock.calls.every(([table]) => ['profiles', 'user_roles'].includes(table))).toBe(true);
  });
  it.each([{ callerRole: false }, { callerActive: false }, { callerHq: false }])('rejects unauthorized admins %j', async opts => {
    const f = fixture(opts); expect((await f.request({ action: 'recover_access', email })).status).toBe(403);
    expect(f.auth.resetPasswordForEmail).not.toHaveBeenCalled(); expect(f.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
  it('rejects anonymous callers', async () => {
    const f = fixture(); expect((await f.request({ action: 'recover_access', email }, false)).status).toBe(401);
  });
  it('does not grant access to deactivated targets', async () => {
    const f = fixture({ active: false }); expect((await f.request({ action: 'recover_access', email })).status).toBe(409);
    expect(f.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
  it('surfaces delivery failures and leaves the profile unchanged', async () => {
    const f = fixture({ sendError: { message: 'Email provider unavailable' } }); const response = await f.request({ action: 'recover_access', email });
    expect(response.status).toBe(500); expect((await response.json()).error).toBe('Email provider unavailable'); expect(f.updates).toEqual([]);
  });
  it('rejects unknown actions without creating a user', async () => {
    const f = fixture(); expect((await f.request({ action: 'delete_user', email })).status).toBe(400); expect(f.auth.admin.createUser).not.toHaveBeenCalled();
  });
});

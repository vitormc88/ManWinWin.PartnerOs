import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Renewals from '@/pages/Renewals';
const fixtures = vi.hoisted(() => ({ editable: true, error: false, rows: [
  { id: 'bps', client_id: 'c-bps', partner_uuid: 'active', partner_id: null, renewal_date: '2026-10-08', status: 'Upcoming', priority: 'Medium', estimated_value: 100 },
  { id: 'erwaa', client_id: 'c-erwaa', partner_uuid: 'mena', partner_id: null, renewal_date: '2026-11-06', status: 'Upcoming', priority: 'Medium', estimated_value: 200 },
  { id: 'old-bps', client_id: 'c-bps', partner_uuid: 'active', status: 'Won', outcome: 'renewed', closed_at: '2026-01-01', renewal_date: '2026-01-01', estimated_value: 150 },
] }));
vi.mock('@/hooks/useDeals', () => ({ useRenewals: () => ({ data: fixtures.rows, isLoading: false, isError: fixtures.error, refetch: vi.fn() }) }));
vi.mock('@/hooks/usePartners', () => ({ usePartners: () => ({ data: [{ id: 'active', company_name: 'Partner Beta', status: 'Active' }, { id: 'mena', company_name: 'Partner Alpha', status: 'Active' }, { id: 'archived', company_name: 'Retired partner', status: 'Archived' }], isLoading: false }) }));
vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [{ id: 'c-bps', commercial_name: 'Deadline client', client_code: 'Deadline client-code' }, { id: 'c-erwaa', commercial_name: 'Canonical client', client_code: 'Canonical client-code' }], isLoading: false }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isHQ: true, profile: {} }) }));
vi.mock('@/hooks/useModuleAccess', () => ({ useModuleAccess: () => ({ canEdit: () => fixtures.editable }) }));
vi.mock('@/hooks/useAssignableUsers', () => ({ useAssignableUsers: () => ({ data: [] }), useAllProfilesMap: () => ({ data: new Map() }) }));
vi.mock('@/hooks/useRenewalOwner', () => ({ useReassignRenewalOwner: () => ({ mutate: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: (v: any) => ({ data: v.queryKey[1] === 'renewal-pipeline-stages' ? [{ id: 'p-bps', renewal_id: 'bps', version: 1, status: 'Ready' }] : v.queryKey[0] === 'renewal_activities' ? [] : v.queryKey[1] === 'renewal' ? { id: 'proposal', version: 1, status: 'Won' } : null }) }));
vi.mock('@/components/proposals/CreateProposalDialog', () => ({ CreateProposalDialog: ({ readOnly }: any) => <div>Proposal mode: {readOnly ? 'read only' : 'edit'}</div> }));
vi.mock('@/components/proposals/ProposalWorkflowActions', () => ({ ProposalWorkflowActions: () => <div>Proposal write actions</div> }));
vi.mock('@/components/renewals/CloseRenewalDialog', () => ({ CloseRenewalDialog: () => null }));
// Use native selectors to exercise the page's filtering without testing Radix internals.
vi.mock('@/components/ui/select', () => ({ Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>, SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: any) => <>{children}</>, SelectItem: ({ value, children }: any) => <option value={value}>{children}</option> }));
function show() { return render(<MemoryRouter><Renewals /></MemoryRouter>); }
function choose(index: number, value: string) { fireEvent.change(screen.getAllByRole('combobox')[index], { target: { value } }); }
describe('Renewals Pipeline interactions', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 9, 12)); fixtures.editable = true; fixtures.error = false; });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('shows Deadline client as critical and overdue while its proposal is validated', () => {
    show(); const row = screen.getByText('Deadline client-code').closest('tr')!;
    expect(within(row).getByText('Critical')).toBeInTheDocument();
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(within(row).getByText('Proposal validated')).toBeInTheDocument();
  });
  it('hides archived partner choices until requested', () => {
    show(); expect(screen.queryByRole('option', { name: 'Retired partner (archived)' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Include archived partners'));
    expect(screen.getByRole('option', { name: 'Retired partner (archived)' })).toBeInTheDocument();
  });
  it('filters Canonical client by canonical Partner Alpha and updates the Clients card with the table', () => {
    show(); choose(1, 'mena');
    expect(screen.getByText('Canonical client-code')).toBeInTheDocument();
    expect(screen.queryByText('Deadline client-code')).not.toBeInTheDocument();
    expect(screen.getByText('Clients').parentElement).toHaveTextContent('Clients1');
  });
  it('shows the previous closed cycle in history and opens its proposal read-only', () => {
    show(); choose(0, 'history');
    expect(screen.queryByText('Canonical client-code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Deadline client-code').closest('tr')!);
    fireEvent.click(screen.getByRole('button', { name: 'Open Renewal Proposal' }));
    expect(screen.getByText('Proposal mode: read only')).toBeInTheDocument();
    expect(screen.queryByText('Proposal write actions')).not.toBeInTheDocument();
  });
  it('blocks proposal write actions for view-only users', () => {
    fixtures.editable = false; show(); fireEvent.click(screen.getByText('Deadline client-code').closest('tr')!);
    expect(screen.queryByText('Proposal write actions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Renewal' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Renewal Proposal' }));
    expect(screen.getByText('Proposal mode: read only')).toBeInTheDocument();
  });
  it('shows a load error rather than claiming there are no renewals', () => {
    fixtures.error = true; show(); expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No renewals found.')).not.toBeInTheDocument();
  });
});

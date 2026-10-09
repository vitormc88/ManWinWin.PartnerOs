import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DirectoryManager } from '@/components/customer-explorer/DirectoryManager';
import type { DirectoryClient } from '@/lib/customer-directory';

vi.mock('@/components/customer-explorer/CustomerLogo', () => ({ CustomerLogo: () => null }));
vi.mock('@/components/customer-explorer/DirectoryMediaEditor', () => ({ DirectoryMediaEditor: () => null }));

const rows: DirectoryClient[] = ['RO', 'ROMANIA', 'SA', 'SAUDI ARABIA'].map((country, index) => ({
  id: `fixture-${index}`, client_id: String(9100 + index), name: `Fixture ${index}`,
  country, sector: 'Manufacturing', active: true, partner: 'Test partner',
  contact_name: 'Test contact', contact_email: null, source_kind: 'partner',
  source_id: `fixture-${index}`, visible: true, evidence_status: 'unconfirmed',
  evidence_note: null, validated_at: null, validated_by: null,
}));
afterEach(cleanup);

function setup() {
  const save = vi.fn(), importRows = vi.fn();
  render(<DirectoryManager rows={rows} onSave={save} onImport={importRows} onClose={vi.fn()} />);
  return { save, importRows };
}

describe('Directory country presentation', () => {
  it('uses the same country names for codes and legacy labels without changing source data', () => {
    const original = JSON.stringify(rows);
    const { save, importRows } = setup();
    expect(screen.getAllByRole('cell', { name: 'Romania' })).toHaveLength(2);
    expect(screen.getAllByRole('cell', { name: 'Saudi Arabia' })).toHaveLength(2);
    expect(JSON.stringify(rows)).toBe(original);
    expect(save).not.toHaveBeenCalled();
    expect(importRows).not.toHaveBeenCalled();
  });

  it.each(['RO', 'Romania', 'SA', 'Saudi Arabia'])('finds both source variants by %s', query => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search directory' }), { target: { value: query } });
    const tableRows = within(screen.getByRole('table')).getAllByRole('row');
    expect(tableRows).toHaveLength(3);
    const country = query.startsWith('R') ? 'Romania' : 'Saudi Arabia';
    expect(screen.getAllByRole('cell', { name: country })).toHaveLength(2);
  });
});

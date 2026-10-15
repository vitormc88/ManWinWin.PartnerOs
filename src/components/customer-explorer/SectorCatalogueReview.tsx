import { useState } from 'react';
import { SECTOR_CATALOGUE, LEGACY_SECTORS, SECTOR_REVIEW_PROPOSALS } from '@/data/sector-catalogue';
import type { DirectoryClient } from '@/lib/customer-directory';

export function SectorCatalogueReview({rows}:{rows:DirectoryClient[]}) {
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState('');
  const affected=rows.filter(r=>selected==='missing'?!r.sector:r.sector===selected||r.source_sector===selected);
  return <section className="rounded-lg border p-4 space-y-3" aria-label="HQ sector catalogue review">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>Review sector catalogue & proposals</button>
    {open&&<><h2>Shared sector catalogue · v1</h2><p>{SECTOR_CATALOGUE.length} choices for new classifications. Existing source values remain unchanged. No proposal below has been applied. A new label requires a reviewed catalogue release, not free text in an import.</p>
      <p>Partner source: Clients &amp; Licenses. HQ customer source: this directory. An HQ Explorer override remains explicit and source changes continue to require review.</p>
      <details><summary>View catalogue and legacy labels</summary><p>{SECTOR_CATALOGUE.join(' · ')}</p><p>Legacy labels retained on existing records: {LEGACY_SECTORS.join(' · ')}. Similar wording is not proof of the same industry.</p></details>
      <h3>Proposals awaiting validation</h3><ul>{SECTOR_REVIEW_PROPOSALS.map(p=><li key={p.from} className="my-2"><button type="button" className="underline" onClick={()=>setSelected(p.from)}>{p.from} → {p.to}</button><p>{p.reason}</p></li>)}</ul>
      <p>Counts cover customers in the HQ Explorer directory, including historical/hidden rows. Matching uses either the Explorer classification or the partner source label; it is not a count of every raw client in Clients &amp; Licenses.</p>
      <label>Inspect affected customers <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a label</option><option value="missing">Missing sector</option>{[...new Set(rows.flatMap(r=>[r.sector,r.source_sector]).filter(Boolean))].sort().map(s=><option key={s!}>{s}</option>)}</select></label>
      {selected&&<div><p>{affected.length} {affected.length===1?'customer':'customers'} · no changes applied</p><ul className="max-h-64 overflow-y-auto">{affected.map(r=><li key={r.id}>{r.client_id} · {r.name} · {r.country} · {r.source_kind==='hq'?'HQ':r.partner} · {r.evidence_status} · Explorer: {r.sector||'Unconfirmed'}{r.source_kind==='partner'&&` / partner source: ${r.source_sector||'Unconfirmed'}`}</li>)}</ul></div>}
    </>}
  </section>;
}

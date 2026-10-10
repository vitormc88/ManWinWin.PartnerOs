import {useMemo,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {DEFAULT_EXPORT_OPTIONS,exportFilename,exportSelection,exportSummary,type ExportOptions} from '@/lib/customer-export';
import type {ExplorerClient,ExplorerFilters} from '@/lib/customer-explorer';

export function CustomerExportDialog({rows,filters,onClose,prepare,validate}:{rows:ExplorerClient[];filters:ExplorerFilters;onClose:()=>void;prepare:()=>Promise<ExplorerClient[]>;validate:(ids:string[])=>Promise<void>}){
 const [options,setOptions]=useState<ExportOptions>({...DEFAULT_EXPORT_OPTIONS});
 const [scope,setScope]=useState<'all'|'selected'>('all');
 const [ids,setIds]=useState<Set<string>>(new Set());
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const selected=useMemo(()=>exportSelection(rows,filters,scope==='selected'?ids:undefined),[rows,filters,scope,ids]);
 const summary=exportSummary(selected);
 async function generate(){
  setBusy(true);setError('');
  try{
   const fresh=await prepare();
   const current=exportSelection(fresh,filters,scope==='selected'?ids:undefined);
   if(!current.length)throw new Error('No visible customers remain in this selection. Refresh and review.');
   if(current.length!==selected.length||current.some(r=>!selected.some(s=>s.id===r.id)))throw new Error('The visible customer selection changed. Close this window and review the updated list.');
   const {createCustomerPdf}=await import('@/lib/customer-export-pdf');
   const date=new Date();
   const bytes=await createCustomerPdf(current,options,filters,date);
   await validate(current.map(r=>r.id));
   const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));
   const a=document.createElement('a');a.href=url;a.download=exportFilename(filters,date);a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60_000);onClose();
  }catch(e){setError(e instanceof Error?e.message:'PDF unavailable. Please try again.');}finally{setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="ce-export-dialog max-h-[90vh] overflow-y-auto" onInteractOutside={e=>{if(busy)e.preventDefault()}} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}}><DialogHeader><DialogTitle>Export customer selection to PDF</DialogTitle></DialogHeader>
 <p>A shareable ManWinWin document. No internal contacts, customer IDs or commercial data.</p>
 <fieldset disabled={busy}><legend>Customers</legend><label><input type="radio" checked={scope==='all'} onChange={()=>setScope('all')}/> All filtered results ({rows.length})</label><label><input type="radio" checked={scope==='selected'} onChange={()=>setScope('selected')}/> Choose customers</label>
 {scope==='selected'&&<div className="ce-export-selection">{rows.map(r=><label key={r.id}><input type="checkbox" checked={ids.has(r.id)} onChange={e=>setIds(previous=>{const next=new Set(previous);if(e.target.checked)next.add(r.id);else next.delete(r.id);return next})}/>{r.name}</label>)}</div>}</fieldset>
 <fieldset disabled={busy}><legend>Optional content</legend>{([
 ['map','Include map'],['logos',`Include available logos (${summary.logos})`],['websites',`Include reviewed websites (${summary.websites})`],['caseStudies',`Add reviewed case studies (${summary.caseStudies})`],
 ] as [keyof ExportOptions,string][]).map(([key,label])=><label key={key}><input type="checkbox" checked={options[key]} onChange={e=>setOptions(v=>({...v,[key]:e.target.checked}))}/>{label}</label>)}</fieldset>
 <p role="status"><strong>{summary.customers} customers · {summary.countries} countries · {summary.caseStudies} reviewed case studies available</strong></p>
 <small>Missing logos, websites and case studies are omitted. Customer presence does not imply availability for a reference call.</small>
 {error&&<p role="alert">{error}</p>}<div className="ce-export-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy||!selected.length} onClick={generate}>{busy?'Preparing PDF…':'Download PDF'}</button></div>
 </DialogContent></Dialog>;
}

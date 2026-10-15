import { useState } from 'react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resourceProposal, reviewOf, RESOURCE_PURPOSES, validateResourceReview, type ResourceRecord, type ResourceReview } from '@/lib/resource-governance';

export function ResourceReviewDialog({doc,onClose,onSave}:{doc:ResourceRecord;onClose:()=>void;onSave:(review:ResourceReview)=>Promise<void>}) {
  const [draft,setDraft]=useState<ResourceReview>(()=>reviewOf(doc));
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const proposal=resourceProposal(doc);
  const change=(patch:Partial<ResourceReview>)=>{setDraft({...draft,...patch});setConfirmed(false)};
  const save=async()=>{setError('');try{const validated=validateResourceReview(draft);if(validated.status!=='needs_review'&&!confirmed)throw new Error('Confirm that you reviewed the resource before recommending or archiving it.');setBusy(true);await onSave(validated);onClose()}catch(e){setError(e instanceof Error?e.message:'Could not save review.')}finally{setBusy(false)}};
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>HQ editorial review</DialogTitle><DialogDescription>Review the actual resource before confirming its language or recommending it. A title, filename, year or upload date is not approval. Original files, categories and visibility are unchanged.</DialogDescription></DialogHeader>
    <p className="text-sm break-all">Original title: {doc.title}<br/>File: {doc.file_name||'External link'}</p>
    <div className="rounded-md border p-3 text-sm"><p>Draft suggestion only: {proposal.title}</p><p>Language hint: {proposal.language||'Unconfirmed'}. Verify content.</p><Button type="button" variant="outline" size="sm" onClick={()=>change({display_title:proposal.title})}>Use suggested title</Button></div>
    <label className="text-sm">Display title<Input value={draft.display_title} maxLength={240} onChange={e=>change({display_title:e.target.value})}/></label>
    <label className="text-sm">Confirmed language<select className="block border rounded p-2 w-full bg-background" value={draft.language} onChange={e=>change({language:e.target.value})}><option value="">Not confirmed</option>{Object.entries({en:'English',pt:'Portuguese',es:'Spanish',fr:'French',multilingual:'Multilingual',other:'Other'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="text-sm">Product / subject<Input value={draft.product} maxLength={240} onChange={e=>change({product:e.target.value})}/></label>
    <label className="text-sm">Purpose<select className="block border rounded p-2 w-full bg-background" value={draft.purpose} onChange={e=>change({purpose:e.target.value})}><option value="">Not confirmed</option>{RESOURCE_PURPOSES.map(p=><option key={p}>{p}</option>)}</select></label>
    <label className="text-sm">Verified version / edition label<Input value={draft.version_label} maxLength={240} placeholder="For example: product edition + document revision" onChange={e=>change({version_label:e.target.value})}/></label>
    <label className="text-sm">Editorial status<select className="block border rounded p-2 w-full bg-background" value={draft.status} onChange={e=>change({status:e.target.value as ResourceReview['status']})}><option value="needs_review">Needs review</option><option value="recommended">Recommended by HQ</option><option value="archived">Editorial archive</option></select></label>
    {draft.status==='archived'&&<p className="text-sm">Removed from the default resource list, not deleted. Still available through the Editorial archive filter under existing access rules.</p>}
    {draft.status!=='needs_review'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed this resource and confirm this editorial decision.</label>}
    <p className="text-xs text-muted-foreground">Your account and review time are recorded by the database. Changing the source title, file reference, filename or version clears the review. Replacing bytes at the same storage path must be accompanied by a document version update.</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save editorial review'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

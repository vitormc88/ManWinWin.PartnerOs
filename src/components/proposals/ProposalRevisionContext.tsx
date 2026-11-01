import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Proposal } from "@/types/proposal";
import { proposalIdentity, proposalJourney } from "@/lib/commercial-proposal-journey";
export function ProposalRevisionContext({proposal}:{proposal:Proposal}) {
  const rows=useQuery({queryKey:["proposal-revision-context",proposal.client_id,proposal.id],enabled:!!proposal.client_id,queryFn:async()=>{
    const {data,error}=await supabase.from("proposals").select("id,version,status,business_config").eq("client_id",proposal.client_id!).eq("source_type","client").order("version",{ascending:false}).limit(100);
    if(error)throw error;return (data||[]) as unknown as Proposal[];
  }});
  const root=proposalJourney(proposal)?.rootId||proposal.id;
  const related=(rows.data||[]).filter(p=>p.id!==proposal.id&&(proposalJourney(p)?.rootId||p.id)===root);
  const newer=related.filter(p=>(p.version||0)>(proposal.version||0));
  return <section className="text-sm rounded-lg border p-3 space-y-1" aria-label="Proposal identity and revisions">
    <p className="font-semibold">Document: {proposalIdentity(proposal)}</p>
    <p>Each new independent proposal has its own reference. A revision preserves the previous document and shares its reference.</p>
    {proposalJourney(proposal)?.revisionOf?<p>This is a revision. The previous document is preserved and listed under Related revisions.</p>:null}
    {newer.length?<p role="status" className="font-medium text-amber-900">A newer revision exists: {newer.map(p=>`${proposalIdentity(p)} (${p.status})`).join(" · ")}. Compare the documents and record exactly which one the customer accepted.</p>:null}
    {rows.isError?<p role="alert">Related revisions could not be checked. Refresh and check the client's proposal list before adjudication.</p>:null}
    {related.length?<details><summary className="cursor-pointer">Related revisions ({related.length})</summary><ul>{related.map(p=><li key={p.id}>{proposalIdentity(p)} · {p.status}</li>)}</ul></details>:null}
  </section>;
}

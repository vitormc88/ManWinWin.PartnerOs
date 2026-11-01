import { useState } from "react";
import { useCreateManualTask } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Proposal } from "@/types/proposal";
import { proposalIdentity } from "@/lib/commercial-proposal-journey";
import { useModuleAccess } from "@/hooks/useModuleAccess";
export function ProposalNextAction({proposal}:{proposal:Proposal}) {
  const task=useCreateManualTask();const [date,setDate]=useState(""),[title,setTitle]=useState("Follow up proposal"),[created,setCreated]=useState(false);
  const {canEdit}=useModuleAccess();if(!canEdit("tasks"))return null;
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium text-sm">Schedule next action · assigned to me</summary><div className="grid sm:grid-cols-2 gap-3 mt-3"><div><Label htmlFor="proposal-next-title">Next action</Label><Input id="proposal-next-title" value={title} onChange={e=>{setTitle(e.target.value);setCreated(false);}}/></div><div><Label htmlFor="proposal-next-date">Follow-up date</Label><Input id="proposal-next-date" type="date" value={date} onChange={e=>{setDate(e.target.value);setCreated(false);}}/></div><Button type="button" variant="outline" disabled={!date||!title.trim()||task.isPending||created} onClick={async()=>{try{await task.mutateAsync({title:`${title} · ${proposalIdentity(proposal)}`,due_date:date,description:`${proposalIdentity(proposal)} · ${proposal.client_name}`,related_type:"client",related_entity_id:proposal.client_id!,related_company:proposal.client_name,related_route:`/clients/${proposal.client_id}?tab=commercial`,task_status:"Open",task_type:"other",priority:"Medium"});setCreated(true);toast.success("Next action created in Tasks, assigned to you and linked to this client and proposal reference.");}catch{toast.error("Unable to create the next action. Proposal status is unchanged.");}}}>{created?"Task created":"Create follow-up task"}</Button></div></details>;
}

import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { GraduationCap, MailPlus, ShieldAlert, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProspectContacts, type PartnerProspect } from "@/hooks/usePartnerGrowth";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select,SelectTrigger,SelectContent,SelectItem,SelectValue } from "@/components/ui/select";

export const initialInvitationRole:Record<string,{role:string,label:string,focus:string}>={
  CMSC:{role:"partner_connector",label:"Strategic Connector",focus:"Academy + owned HQ-routed referrals. No client portfolio or independent proposals."},
  CMAR:{role:"partner_reseller_trainee",label:"Reseller in training",focus:"Academy + supervised referrals. Pipeline and client privileges require later HQ authorization."},
  CMAI:{role:"partner_implementer_trainee",label:"Implementer in training",focus:"Academy + supervised referrals. Implementation and support rights require technical validation."},
};

export function PartnerInvitationPanel({prospect,isAdmin}:{prospect:PartnerProspect,isAdmin:boolean}) {
  const qc=useQueryClient();
  const {data:contacts=[]}=useProspectContacts(prospect.id);
  const [contactId,setContactId]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [sending,setSending]=useState(false);
  const model=initialInvitationRole[prospect.proposed_partner_type??""];
  const {data:invites=[]}=useQuery({
    queryKey:["partner-growth","invitations",prospect.id],
    enabled:!!prospect.converted_partner_id && isAdmin,
    queryFn:async()=>{
      const {data,error}=await supabase.from("partner_growth_invitations" as any)
        .select("contact_id,email,status,invited_role,sent_at").eq("prospect_id",prospect.id);
      if(error)throw error;
      return (data??[]) as unknown as {contact_id:string,email:string,status:string,invited_role:string,sent_at:string|null}[];
    },
  });
  if(!prospect.converted_partner_id || !model)return null;
  const eligible=contacts.filter(c=>c.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
  const selected=eligible.find(c=>c.id===contactId);
  const alreadyInvited=invites.some(v=>v.contact_id===contactId && v.status!=="failed");

  const send=async()=>{
    if(!isAdmin||!selected||!confirmed||sending||alreadyInvited)return;
    setSending(true);
    try{
      const {data,error}=await supabase.functions.invoke("partner-growth-invite",{
        body:{prospect_id:prospect.id,contact_id:selected.id,confirmed:true},
      });
      if(error)throw error;
      if(!data?.success)throw new Error(data?.error||"Invitation was not sent");
      toast.success("Invitation sent. Access is limited to the partner training role.");
      setContactId("");setConfirmed(false);
      await qc.invalidateQueries({queryKey:["partner-growth","invitations",prospect.id]});
    }catch(e){toast.error(e instanceof Error?e.message:"Could not send invitation");}
    finally{setSending(false)}
  };
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-5 w-5"/>Invite & Academy Access</CardTitle>
      <p className="text-sm text-muted-foreground">4B.2 · Named contacts only, after conversion. No certifications or full commercial access are automatically awarded.</p>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="rounded-lg bg-muted/50 p-3 space-y-1">
        <p className="text-sm font-semibold">{model.label}</p>
        <p className="text-xs text-muted-foreground">Starting role: {model.role}</p>
        <p className="text-sm">{model.focus}</p>
      </div>
      {invites.length>0&&<div className="space-y-1" aria-label="Invitation history">
        {invites.map(item=><p key={item.contact_id} className="text-sm flex gap-2 items-center">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground"/>{item.email} · {item.status}
        </p>)}
      </div>}
      {!isAdmin?<p className="text-sm text-muted-foreground">HQ Admin approval is required before sending invitations.</p>:<>
        {eligible.length===0?<p className="text-sm text-muted-foreground">Add a named prospect contact with an email in Copilot before inviting anyone.</p>:<>
          <div className="space-y-1"><Label htmlFor="partner-invite-contact">Verified prospect contact</Label>
            <Select value={contactId} onValueChange={v=>{setContactId(v);setConfirmed(false)}}>
              <SelectTrigger id="partner-invite-contact"><SelectValue placeholder="Choose one contact…"/></SelectTrigger>
              <SelectContent>{eligible.map(c=><SelectItem key={c.id} value={c.id}>{c.name} · {c.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {alreadyInvited&&<p role="status" className="text-sm text-muted-foreground">An invitation has already been requested for this person.</p>}
          <label className="flex gap-2 text-sm items-start">
            <input type="checkbox" aria-label="I authorize this specific partner invitation"
              checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
            I checked this person's email, obtained permission to invite them, and approve the restricted starting role. Further rights require separate HQ authorization.
          </label>
          <Button disabled={!selected||!confirmed||alreadyInvited||sending} onClick={send}>
            <MailPlus className="mr-2 h-4 w-4"/>{sending?"Sending…":"Send individual invitation"}
          </Button>
        </>}
      </>}
      <div className="rounded-lg border p-3 flex gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0"/>
        <span>TEST email delivery is disabled by default until the invitation service and approved TEST redirect URL are explicitly configured. Previewing this panel sends nothing.</span>
      </div>
    </CardContent>
  </Card>;
}

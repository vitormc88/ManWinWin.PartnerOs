import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send,ShieldCheck,GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIncomingLeads } from "@/hooks/useIncomingLeads";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const isPartnerTrainee = (roles:string[]) =>
  roles.some(role=>["partner_connector","partner_reseller_trainee","partner_implementer_trainee"].includes(role));

export function PartnerReferralWorkspace(){
  const {profile}=useAuth();
  const qc=useQueryClient();
  const {data:leads=[],isLoading}=useIncomingLeads();
  const [company,setCompany]=useState("");
  const [contact,setContact]=useState("");
  const [email,setEmail]=useState("");
  const [country,setCountry]=useState("");
  const [notes,setNotes]=useState("");
  const [sending,setSending]=useState(false);
  const valid=company.trim().length>=2&&contact.trim().length>=2
    &&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())&&/^[A-Z]{2}$/.test(country.trim().toUpperCase());

  const submit=async()=>{
    if(!valid||sending)return;
    setSending(true);
    try{
      const {error}=await supabase.rpc("pg_submit_partner_referral" as any,{
        p_company_name:company.trim(),p_contact_name:contact.trim(),
        p_email:email.trim(),p_country:country.trim().toUpperCase(),p_notes:notes.trim()||null,
      });
      if(error)throw error;
      toast.success("Referral submitted to HQ for qualification.");
      setCompany("");setContact("");setEmail("");setCountry("");setNotes("");
      await qc.invalidateQueries({queryKey:["incoming_leads"]});
    }catch(e){toast.error(e instanceof Error?e.message:"Could not submit referral");}
    finally{setSending(false);}
  };

  return <div className="space-y-5 pb-10">
    <div className="space-y-1"><h1 className="text-2xl font-semibold">My Referrals</h1>
      <p className="text-sm text-muted-foreground">Share qualified customer introductions with HQ. You do not need to prepare quotes, manage client accounts, or operate the full commercial pipeline.</p>
    </div>
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2">
      <Send className="h-5 w-5"/>New qualified introduction</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="ref-company">Customer company *</Label>
          <Input id="ref-company" value={company} onChange={e=>setCompany(e.target.value)}/></div>
        <div className="space-y-1"><Label htmlFor="ref-country">Country code (e.g., MY) *</Label>
          <Input id="ref-country" maxLength={2} value={country} onChange={e=>setCountry(e.target.value.toUpperCase())}/></div>
        <div className="space-y-1"><Label htmlFor="ref-contact">Customer contact *</Label>
          <Input id="ref-contact" value={contact} onChange={e=>setContact(e.target.value)}/></div>
        <div className="space-y-1"><Label htmlFor="ref-email">Customer email *</Label>
          <Input id="ref-email" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="ref-notes">Why is this a relevant introduction?</Label>
          <Textarea id="ref-notes" rows={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}
            placeholder="Customer context, pain point, contact permission, next recommended action…"/></div>
        <div className="sm:col-span-2">
          <Button disabled={!valid||sending||!profile?.partner_id} onClick={submit}>
            <Send className="mr-2 h-4 w-4"/>{sending?"Submitting…":"Submit to HQ"}
          </Button>
        </div>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="text-base">My partner referrals</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4"/>
          Visible referrals are restricted by the server to your partner company. Updates and decisions remain with HQ.
        </p>
        {isLoading&&<p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading&&leads.length===0&&<p className="text-sm text-muted-foreground">No referrals submitted yet.</p>}
        {leads.map(lead=><div key={lead.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
          <div><p className="font-medium text-sm">{lead.company_name||"Unnamed company"}</p>
            <p className="text-xs text-muted-foreground">{lead.country||"—"} · {lead.contact_name||"No contact"}</p></div>
          <span className="text-xs text-muted-foreground">{lead.status}</span>
        </div>)}
      </CardContent>
    </Card>
    <p className="text-xs text-muted-foreground flex items-center gap-1"><GraduationCap className="h-4 w-4"/>Learn discovery, qualification and value messaging in the existing Partner Academy.</p>
  </div>;
}

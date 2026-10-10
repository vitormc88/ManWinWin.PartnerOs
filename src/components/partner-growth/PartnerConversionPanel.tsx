import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ArrowRight, ShieldCheck, AlertTriangle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { PartnerInvitationPanel } from "@/components/partner-growth/PartnerInvitationPanel";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerProspect } from "@/hooks/usePartnerGrowth";
import type { ActivationPlan } from "@/hooks/usePartnerActivation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type LegalIdentity = {
  legal_name: string; registration_number: string; registered_address: string; signatory_name: string;
};
const emptyIdentity: LegalIdentity = {
  legal_name: "", registration_number: "", registered_address: "", signatory_name: "",
};

/** The UI is advisory: the SQL RPC repeats every gate under an HQ Admin check. */
export function conversionPreflight(
  prospect: PartnerProspect,
  plan: ActivationPlan | null | undefined,
  contactsCount: number,
): string[] {
  if (prospect.converted_partner_id) return [];
  const blockers: string[] = [];
  if (prospect.recruitment_stage !== "Signed" || !prospect.signed_verified_by ||
      !prospect.signed_verified_at || !prospect.agreement_reference || !prospect.agreement_signed_on)
    blockers.push("Signed agreement must be verified by HQ Admin");
  if (plan?.legal_review_status !== "approved" || !plan.legal_reviewed_by || !plan.legal_reviewed_at)
    blockers.push("HQ legal review is still pending");
  if (plan?.readiness_status !== "ready_for_handoff" || !plan.handoff_approved_by ||
      !plan.handoff_approved_at || !plan.hq_activation_owner)
    blockers.push("Handoff has not been approved by HQ");
  if (!plan?.target_model || plan.target_model !== prospect.proposed_partner_type)
    blockers.push("Activation model must match the signed partnership model");
  if ((plan?.kickoff_objective?.trim().length ?? 0) < 5 ||
      (plan?.first_value_milestone?.trim().length ?? 0) < 5)
    blockers.push("Kickoff objective and first-value milestone are required");
  if (contactsCount === 0) blockers.push("A named primary contact is required");
  if (prospect.proposed_partner_type === "Strategic Alliance")
    blockers.push("Strategic Alliances require a dedicated approval pathway");
  return blockers;
}

export function legalIdentityComplete(identity: LegalIdentity): boolean {
  return identity.legal_name.trim().length >= 3
    && identity.registration_number.trim().length >= 3
    && identity.registered_address.trim().length >= 8
    && identity.signatory_name.trim().length >= 3;
}

export function PartnerConversionPanel({
  prospect, plan, isAdmin, contactsCount,
}: {
  prospect: PartnerProspect; plan: ActivationPlan | null | undefined; isAdmin: boolean; contactsCount: number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState<LegalIdentity>(emptyIdentity);
  const [confirmed, setConfirmed] = useState(false);
  const [errorText, setErrorText] = useState("");
  const blockers = conversionPreflight(prospect, plan, contactsCount);
  const convertedId = prospect.converted_partner_id;

  const { data: receipt } = useQuery({
    queryKey: ["partner-growth", "conversion-receipt", prospect.id],
    enabled: !!convertedId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_conversion_receipts" as any)
        .select("partner_id,converted_at,partnership_model")
        .eq("prospect_id", prospect.id).maybeSingle();
      if (error) throw error;
      return data as unknown as {partner_id: string; converted_at: string; partnership_model: string} | null;
    },
  });

  const convert = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("pg_convert_prospect" as any, {
        p_prospect_id: prospect.id,
        p_legal_name: identity.legal_name.trim(),
        p_registration_number: identity.registration_number.trim(),
        p_registered_address: identity.registered_address.trim(),
        p_signatory_name: identity.signatory_name.trim(),
        p_confirmed: confirmed,
      } as any);
      if (error) throw error;
      if (typeof data !== "string" || !data) throw new Error("No partner ID returned from the server");
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["partner-growth"] }),
        qc.invalidateQueries({ queryKey: ["partners"] }),
      ]);
      setOpen(false);
      setConfirmed(false);
      setIdentity(emptyIdentity);
      setErrorText("");
      toast.success("Official partner created. No invitations or access rights were issued.");
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : "Conversion failed";
      setErrorText(message);
      toast.error(message);
    },
  });

  if (convertedId) return <div className="space-y-4"><Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base">
      <CheckCircle2 className="h-5 w-5 text-emerald-600"/>Official Partner Created
    </CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">The signed prospect is linked to the official partner record. Invitation and Academy activation are separate steps.</p>
      {receipt && <p className="text-xs text-muted-foreground">
        HQ conversion recorded {new Date(receipt.converted_at).toLocaleString()} · {receipt.partnership_model}
      </p>}
      <Button asChild variant="outline"><Link to={`/partners/${convertedId}`}>
        Open operational partner <ArrowRight className="ml-2 h-4 w-4"/>
      </Link></Button>
    </CardContent>
  </Card>;

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base">
      <Building2 className="h-5 w-5"/>Official Partner Conversion
    </CardTitle>
      <p className="text-sm text-muted-foreground">Creates an official partner record only. Access, invitations, commercial autonomy and Academy progress remain unchanged.</p>
    </CardHeader>
    <CardContent className="space-y-3">
      {blockers.length > 0 && <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm font-medium">Not ready to convert</p>
        {blockers.map(blocker => <p key={blocker} className="text-sm text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600"/>{blocker}
        </p>)}
      </div>}
      {!isAdmin && <p className="text-sm text-muted-foreground">Only HQ Admin can perform the final conversion.</p>}
      {isAdmin && <Dialog open={open} onOpenChange={v => {setOpen(v);if(!v) {setConfirmed(false);setErrorText("");}}}>
        <DialogTrigger asChild>
          <Button disabled={blockers.length > 0} variant={blockers.length?"outline":"default"}>
            <ShieldCheck className="mr-2 h-4 w-4"/>Prepare conversion
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert to Official Partner</DialogTitle>
            <DialogDescription>Confirm legal identity against the signed original. This action is irreversible without HQ intervention.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium">{prospect.company_name} · {prospect.country}</p>
              <p>Partner type: {prospect.proposed_partner_type}</p>
              <p>Signed agreement: {prospect.agreement_reference}</p>
              <p>HQ activation owner: {plan?.hq_activation_owner ? "Assigned" : "Missing"}</p>
            </div>
            <div className="space-y-1"><Label htmlFor="conversion-legal-name">Registered legal name</Label>
              <Input id="conversion-legal-name" value={identity.legal_name} autoComplete="organization"
                onChange={e=>setIdentity(s=>({...s,legal_name:e.target.value}))}/></div>
            <div className="space-y-1"><Label htmlFor="conversion-registration">Business registration number</Label>
              <Input id="conversion-registration" value={identity.registration_number}
                onChange={e=>setIdentity(s=>({...s,registration_number:e.target.value}))}/></div>
            <div className="space-y-1"><Label htmlFor="conversion-address">Registered company address</Label>
              <Input id="conversion-address" value={identity.registered_address}
                onChange={e=>setIdentity(s=>({...s,registered_address:e.target.value}))}/></div>
            <div className="space-y-1"><Label htmlFor="conversion-signatory">Authorized signatory</Label>
              <Input id="conversion-signatory" value={identity.signatory_name}
                onChange={e=>setIdentity(s=>({...s,signatory_name:e.target.value}))}/></div>
            <label className="flex items-start gap-2 text-sm">
              <input aria-label="Confirm verified legal identity and no automatic access" type="checkbox" className="mt-1"
                checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
              I verified these company details against the signed agreement. I understand that no invitations, credentials, Academy certifications or additional commercial rights will be issued.
            </label>
            {errorText && <p role="alert" className="text-sm text-destructive">{errorText}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={()=>setOpen(false)} disabled={convert.isPending}>Cancel</Button>
            <Button disabled={!legalIdentityComplete(identity)||!confirmed||convert.isPending}
              onClick={()=>convert.mutate()}>
              {convert.isPending?"Converting…":"Convert to Official Partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </CardContent>
  </Card>;
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePartners } from "@/hooks/usePartners";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStageProbability } from "@/data/pipeline-stages";
import type { IncomingLead } from "@/hooks/useIncomingLeads";

const JOB_ROLE_OPTIONS = [
  "Maintenance Manager",
  "Plant Manager",
  "General Manager",
  "IT Manager",
  "Unknown",
];
const ASSET_RANGE_OPTIONS = ["1–100", "101–250", "+250"];
const TEAM_SIZE_OPTIONS = ["1–3", "4 or more", "Unknown"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: IncomingLead;
}

export function ConvertToOpportunityDialog({ open, onOpenChange, lead }: Props) {
  const navigate = useNavigate();
  const { isHQ, profile } = useAuth();
  const userPartnerId = !isHQ ? profile?.partner_id : null;
  const { data: partners = [] } = usePartners();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    contact_person_name: lead.contact_name || "",
    company_name: lead.company_name || "",
    partner_id: lead.linked_partner_id || userPartnerId || "",
    assigned_to: "",
    country: lead.country || "",
    lead_source: lead.lead_source || "HQ (Inbound)",
    contact_email: lead.email || "",
    contact_phone: lead.phone || "",
    job_role: lead.job_role || "",
    sector: lead.sector || "",
    asset_range: lead.asset_range || "",
    maintenance_team_size: lead.maintenance_team_size || "",
    notes: lead.notes || "",
    expected_value: "",
  });

  const { data: partnerUsers = [] } = usePartnerUsers(form.partner_id || null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.company_name) {
      toast.error("Company Name is required");
      return;
    }
    setCreating(true);
    try {
      const assignedUser = partnerUsers.find((u) => u.id === form.assigned_to);
      const { data: deal, error } = await supabase
        .from("deals")
        .insert({
          company_name: form.company_name,
          contact_person_name: form.contact_person_name || null,
          partner_id: userPartnerId || form.partner_id || null,
          country: form.country || null,
          industry: form.sector || null,
          stage: "Open Lead",
          expected_value: form.expected_value ? parseFloat(form.expected_value) : 0,
          probability: getStageProbability("Open Lead"),
          assigned_user_id: assignedUser?.id || null,
          assigned_salesperson: assignedUser?.full_name || null,
          lead_source: form.lead_source || "HQ (Inbound)",
          notes: form.notes || null,
          status: "Open",
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          job_role: form.job_role || null,
          sector: form.sector || null,
          asset_range: form.asset_range || null,
          maintenance_team_size: form.maintenance_team_size || null,
          register_date: new Date().toISOString().split("T")[0],
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Link lead to created deal
      const { error: updateErr } = await supabase
        .from("incoming_leads")
        .update({ converted_to_deal_id: deal.id, status: "Qualified" } as any)
        .eq("id", lead.id);

      if (updateErr) throw updateErr;

      toast.success("Lead converted to opportunity");
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["incoming_leads"] });
      queryClient.invalidateQueries({ queryKey: ["incoming_lead", lead.id] });
      onOpenChange(false);
      navigate(`/deals/${deal.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to convert lead");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Opportunity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Ownership */}
          <div className="grid grid-cols-2 gap-4">
            {isHQ ? (
              <div>
                <Label>Linked Partner</Label>
                <Select
                  value={form.partner_id || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, partner_id: v === "none" ? "" : v, assigned_to: "" }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Linked Partner</Label>
                <Input value={partners.find((p) => p.id === userPartnerId)?.company_name || "Your Partner"} disabled />
              </div>
            )}
            <div>
              <Label>Assigned To</Label>
              <Select
                value={form.assigned_to || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v === "none" ? "" : v }))}
                disabled={!form.partner_id && !userPartnerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!form.partner_id && !userPartnerId ? "Select a partner first" : "Select user"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {partnerUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lead details */}
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Name</Label><Input value={form.contact_person_name} onChange={(e) => setForm((f) => ({ ...f, contact_person_name: e.target.value }))} /></div>
            <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Country</Label><CountryCombobox value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} /></div>
            <div>
              <Label>Lead Source</Label>
              <Select value={form.lead_source} onValueChange={(v) => setForm((f) => ({ ...f, lead_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Partner (Outbound)">Partner (Outbound)</SelectItem>
                  <SelectItem value="HQ (Inbound)">HQ (Inbound)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Job Role</Label>
              <Select value={form.job_role || "none"} onValueChange={(v) => setForm((f) => ({ ...f, job_role: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {JOB_ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sector</Label>
              <SectorSelect value={form.sector} onChange={(v) => setForm((f) => ({ ...f, sector: v }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>No. of Assets</Label>
              <Select value={form.asset_range || "none"} onValueChange={(v) => setForm((f) => ({ ...f, asset_range: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {ASSET_RANGE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Maintenance Team</Label>
              <Select value={form.maintenance_team_size || "none"} onValueChange={(v) => setForm((f) => ({ ...f, maintenance_team_size: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {TEAM_SIZE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Expected Value (€)</Label>
            <Input
              type="number"
              value={form.expected_value}
              onChange={(e) => setForm((f) => ({ ...f, expected_value: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Converting..." : "Create Opportunity"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

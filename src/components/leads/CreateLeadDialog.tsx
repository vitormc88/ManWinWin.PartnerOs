import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { usePartners } from "@/hooks/usePartners";
import { usePartnerUsers } from "@/hooks/usePartnerUsers";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStageProbability } from "@/data/pipeline-stages";

const JOB_ROLE_OPTIONS = [
  "Maintenance Manager",
  "Plant Manager",
  "General Manager",
  "IT Manager",
  "Unknown",
];
const ASSET_RANGE_OPTIONS = ["1–100", "101–250", "+250"];
const TEAM_SIZE_OPTIONS = ["1–3", "4 or more", "Unknown"];

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill and lock the partner field */
  lockedPartnerId?: string;
  lockedPartnerName?: string;
}

const defaultForm = {
  contact_person_name: "",
  company_name: "",
  partner_id: "",
  assigned_to: "",
  country: "",
  lead_source: "Partner (Outbound)",
  contact_email: "",
  contact_phone: "",
  job_role: "",
  sector: "",
  asset_range: "",
  maintenance_team_size: "",
  notes: "",
};

export function CreateLeadDialog({ open, onOpenChange, lockedPartnerId, lockedPartnerName }: CreateLeadDialogProps) {
  const { isHQ, profile } = useAuth();
  const userPartnerId = !isHQ ? profile?.partner_id : null;
  const effectivePartnerId = lockedPartnerId || userPartnerId || "";

  const [form, setForm] = useState({ ...defaultForm, partner_id: effectivePartnerId });
  const [creating, setCreating] = useState(false);
  const { data: partners = [] } = usePartners();
  const { data: partnerUsers = [] } = usePartnerUsers(form.partner_id || userPartnerId || null);
  const queryClient = useQueryClient();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({ ...defaultForm, partner_id: effectivePartnerId });
    }
  }, [open, effectivePartnerId]);

  const handleCreate = async () => {
    if (!form.company_name) { toast.error("Company Name is required"); return; }
    setCreating(true);
    try {
      const assignedUser = partnerUsers.find(u => u.id === form.assigned_to);
      const { data: created, error } = await supabase.from("deals").insert({
        company_name: form.company_name,
        contact_person_name: form.contact_person_name || null,
        partner_id: lockedPartnerId || userPartnerId || form.partner_id || null,
        country: form.country || null,
        industry: form.sector || null,
        stage: "Open Lead",
        expected_value: 0,
        probability: getStageProbability("Open Lead"),
        assigned_user_id: assignedUser?.id || null,
        assigned_salesperson: assignedUser?.full_name || null,
        lead_source: form.lead_source || "Partner (Outbound)",
        notes: form.notes || null,
        status: "Open",
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        job_role: form.job_role || null,
        sector: form.sector || null,
        asset_range: form.asset_range || null,
        maintenance_team_size: form.maintenance_team_size || null,
        register_date: new Date().toISOString().split("T")[0],
      } as any).select("id").single();
      if (error) throw error;
      if (created?.id) {
        try {
          const { logSystemActivity } = await import("@/lib/activity-log");
          logSystemActivity(created.id, "Lead created", `Lead "${form.company_name}" was created${assignedUser?.full_name ? ` and assigned to ${assignedUser.full_name}` : ""}.`);
        } catch { /* noop */ }
      }
      toast.success("Lead created successfully");
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("permission denied")) {
        toast.error("You do not have permission to create leads.");
      } else {
        toast.error(msg || "Failed to create lead");
      }
    } finally { setCreating(false); }
  };

  const isPartnerLocked = !!lockedPartnerId || !!userPartnerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Ownership */}
          <div className="grid grid-cols-2 gap-4">
            {isPartnerLocked ? (
              <div>
                <Label>Linked Partner</Label>
                <Input
                  value={lockedPartnerName || partners.find(p => p.id === (lockedPartnerId || userPartnerId))?.company_name || "Your Partner"}
                  disabled
                />
              </div>
            ) : (
              <div>
                <Label>Linked Partner</Label>
                <Select value={form.partner_id || "none"} onValueChange={v => setForm(f => ({ ...f, partner_id: v === "none" ? "" : v, assigned_to: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Assigned To</Label>
              <Select
                value={form.assigned_to || "none"}
                onValueChange={v => setForm(f => ({ ...f, assigned_to: v === "none" ? "" : v }))}
                disabled={!form.partner_id && !userPartnerId && !lockedPartnerId}
              >
                <SelectTrigger><SelectValue placeholder={!form.partner_id && !userPartnerId && !lockedPartnerId ? "Select a partner first" : "Select user"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {partnerUsers.length === 0 && (form.partner_id || userPartnerId || lockedPartnerId) && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No users available for this partner</div>
                  )}
                  {partnerUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lead details */}
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Name</Label><Input value={form.contact_person_name} onChange={e => setForm(f => ({ ...f, contact_person_name: e.target.value }))} placeholder="Contact person name" /></div>
            <div><Label>Company Name *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company name" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Country</Label><CountryCombobox value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} /></div>
            <div>
              <Label>Lead Source</Label>
              <Select value={form.lead_source} onValueChange={v => setForm(f => ({ ...f, lead_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Partner (Outbound)">Partner (Outbound)</SelectItem>
                  <SelectItem value="HQ (Inbound)">HQ (Inbound)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Job Role</Label>
              <Select value={form.job_role || "none"} onValueChange={v => setForm(f => ({ ...f, job_role: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {JOB_ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sector</Label>
              <SectorSelect value={form.sector} onChange={v => setForm(f => ({ ...f, sector: v }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>No. of Assets</Label>
              <Select value={form.asset_range || "none"} onValueChange={v => setForm(f => ({ ...f, asset_range: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {ASSET_RANGE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Maintenance Team</Label>
              <Select value={form.maintenance_team_size || "none"} onValueChange={v => setForm(f => ({ ...f, maintenance_team_size: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {TEAM_SIZE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create Lead"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

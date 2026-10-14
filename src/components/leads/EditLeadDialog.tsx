import { useState } from "react";
import { useUpdateIncomingLead, type IncomingLead } from "@/hooks/useIncomingLeads";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { JOB_ROLE_OPTIONS } from "@/data/client-field-options";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fields = ["company_name", "contact_name", "email", "phone", "country", "job_role", "sector"] as const;
type BasicFields = Record<(typeof fields)[number], string>;

/** Local draft: Cancel never writes; Save sends only changed basic fields. */
export function EditLeadDialog({ lead, canEdit, onClose }: { lead: IncomingLead; canEdit: boolean; onClose: () => void }) {
  const [form, setForm] = useState<BasicFields>(() => Object.fromEntries(fields.map(key => [key, lead[key] || ""])) as BasicFields);
  const [error, setError] = useState("");
  const update = useUpdateIncomingLead();
  const blocked = !canEdit || !!lead.converted_to_deal_id;
  const legacyRole = !!form.job_role && !JOB_ROLE_OPTIONS.some(option => option === form.job_role);
  const changes = Object.fromEntries(fields.filter(key => form[key] !== (lead[key] || "")).map(key => [key, form[key].trim() || null]));
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked || update.isPending) return;
    if (!form.company_name.trim()) { setError("Company name is required."); return; }
    if (!Object.keys(changes).length) { onClose(); return; }
    setError("");
    update.mutate({ id: lead.id, requireUnconverted: true, ...changes }, {
      onSuccess: () => { toast.success("Lead details updated"); onClose(); },
      onError: () => setError("Could not save. Check your permissions or whether this lead was converted, then refresh and try again."),
    });
  };
  return (
    <Dialog open onOpenChange={open => { if (!open && !update.isPending) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit lead</DialogTitle><DialogDescription>Correct the basic details. Ownership, qualification and linked opportunities are not changed.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={blocked || update.isPending} className="space-y-4">
            {([ ["company_name", "Company name", "text"], ["contact_name", "Contact name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"] ] as const).map(([key, label, type]) => (
              <div key={key}><Label htmlFor={`edit-lead-${key}`}>{label}{key === "company_name" ? " *" : ""}</Label><Input id={`edit-lead-${key}`} type={type} required={key === "company_name"} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></div>
            ))}
            <div><Label>Country</Label><CountryCombobox value={form.country} onChange={country => setForm(f => ({ ...f, country }))} /></div>
            <div>
              <Label htmlFor="edit-lead-job_role">Job role</Label>
              <Select value={form.job_role || "none"} disabled={blocked || update.isPending} onValueChange={value => setForm(f => ({ ...f, job_role: value === "none" ? "" : value }))}>
                <SelectTrigger id="edit-lead-job_role"><SelectValue placeholder="Select job role..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {legacyRole && <SelectItem value={form.job_role}>{form.job_role} (current value)</SelectItem>}
                  {JOB_ROLE_OPTIONS.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="edit-lead-sector">Sector</Label><SectorSelect id="edit-lead-sector" value={form.sector} disabled={blocked || update.isPending} onChange={sector => setForm(f => ({ ...f, sector }))} /></div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {blocked && <p role="alert" className="text-sm text-muted-foreground">This lead cannot be edited here. Converted leads must be corrected in their opportunity.</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={blocked || update.isPending || !Object.keys(changes).length}>{update.isPending ? "Saving…" : "Save changes"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

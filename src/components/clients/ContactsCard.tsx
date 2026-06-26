import { useState } from "react";
import { Plus, Pencil, Trash2, Star, Mail, Phone, Smartphone, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useClientContacts, useCreateContact, useUpdateContact, useDeleteContact,
} from "@/hooks/useClients";

interface ContactForm {
  id?: string;
  contact_name: string;
  role_function: string;
  email: string;
  phone: string;
  mobile: string;
  notes: string;
  is_primary: boolean;
}

const empty: ContactForm = {
  contact_name: "", role_function: "", email: "", phone: "", mobile: "", notes: "", is_primary: false,
};

export function ContactsCard({ clientId }: { clientId: string }) {
  const { data: contacts = [], refetch } = useClientContacts(clientId);
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContactForm>(empty);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Primary first, then name
  const sorted = [...contacts].sort((a: any, b: any) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.contact_name || "").localeCompare(b.contact_name || "");
  });

  const openCreate = () => { setForm(empty); setOpen(true); };
  const openEdit = (c: any) => {
    setForm({
      id: c.id,
      contact_name: c.contact_name || "",
      role_function: c.role_function || "",
      email: c.email || "",
      phone: c.phone || "",
      mobile: c.mobile || "",
      notes: c.notes || "",
      is_primary: !!c.is_primary,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.contact_name.trim()) { toast.error("Contact name required"); return; }
    try {
      // If marking primary, clear primary on other contacts first
      if (form.is_primary) {
        await supabase
          .from("client_contacts")
          .update({ is_primary: false })
          .eq("client_id", clientId)
          .neq("id", form.id ?? "00000000-0000-0000-0000-000000000000");
      }
      const payload = {
        contact_name: form.contact_name.trim(),
        role_function: form.role_function.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        mobile: form.mobile.trim() || null,
        notes: form.notes.trim() || null,
        is_primary: form.is_primary,
      } as any;
      if (form.id) {
        await updateContact.mutateAsync({ id: form.id, client_id: clientId, ...payload });
        toast.success("Contact updated");
      } else {
        await createContact.mutateAsync({ client_id: clientId, ...payload });
        toast.success("Contact added");
      }
      setOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save contact");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContact.mutateAsync({ id, clientId });
      toast.success("Contact removed");
      setDeletingId(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  const handleMakePrimary = async (id: string) => {
    try {
      await supabase.from("client_contacts").update({ is_primary: false }).eq("client_id", clientId);
      await updateContact.mutateAsync({ id, client_id: clientId, is_primary: true } as any);
      toast.success("Primary contact updated");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update primary");
    }
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">Contacts</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {contacts.length === 0 ? "No contacts yet" : `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
        </Button>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Add the people responsible for this client at the customer side.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {sorted.map((c: any) => (
              <li key={c.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">{c.contact_name}</span>
                    {c.is_primary && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 bg-amber-50 text-amber-700">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Primary
                      </Badge>
                    )}
                    {c.role_function && (
                      <Badge variant="secondary" className="text-[10px] font-normal">{c.role_function}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                        <Mail className="h-3 w-3" /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                    {c.mobile && (
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="h-3 w-3" /> {c.mobile}
                      </span>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!c.is_primary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMakePrimary(c.id)}
                      title="Mark as primary"
                      className="h-7 w-7 p-0"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)} className="h-7 w-7 p-0" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(c.id)}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Role / Function</Label>
              <Input value={form.role_function} onChange={e => setForm(f => ({ ...f, role_function: e.target.value }))} className="h-8 text-sm" placeholder="e.g. IT Manager, Maintenance Lead" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Mobile</Label>
                <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-sm" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.is_primary} onCheckedChange={v => setForm(f => ({ ...f, is_primary: v }))} />
              <Label className="text-xs">Primary contact for this client</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createContact.isPending || updateContact.isPending}>
              {form.id ? "Save changes" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This contact will be permanently removed from the client. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && handleDelete(deletingId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

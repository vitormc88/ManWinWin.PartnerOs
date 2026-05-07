import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { getAppRedirectUrl } from "@/lib/app-url";

import { ROLE_OPTIONS, roleType } from "@/lib/permissions";
import { useRoleTemplates } from "@/hooks/useRoleTemplates";
import { MODULE_LABELS } from "@/lib/module-access";

const ROLES = ROLE_OPTIONS;

export function UserCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("partner_sales");
  const [partnerId, setPartnerId] = useState("none");
  const [saving, setSaving] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const qc = useQueryClient();

  const { data: partners } = useQuery({
    queryKey: ["partners-select"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, company_name").order("company_name");
      return data || [];
    },
  });

  const isPartnerRole = role.startsWith("partner_");

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setRole("partner_sales");
    setPartnerId("none");
    setManualMode(false);
    setPassword("");
    setConfirmPassword("");
  };

  const handleCreate = async () => {
    if (!fullName.trim()) { toast.error("Full name is required"); return; }
    if (!email.trim()) { toast.error("Email is required"); return; }
    if (isPartnerRole && partnerId === "none") { toast.error("Partner is required for partner users"); return; }

    if (manualMode) {
      if (!password) { toast.error("Password is required"); return; }
      if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
      if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role,
        partner_id: isPartnerRole && partnerId !== "none" ? partnerId : null,
        is_hq: !isPartnerRole,
      };

      if (manualMode) {
        payload.mode = "manual";
        payload.password = password;
      } else {
        payload.mode = "invite";
        payload.redirectTo = getAppRedirectUrl("/reset-password");
      }

      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (manualMode) {
        toast.success(`User ${email} created successfully. They can log in immediately.`, { duration: 5000, icon: <KeyRound className="h-4 w-4" /> });
      } else {
        toast.success(`Invitation sent to ${email}. The user will receive an email to set their password.`, { duration: 6000, icon: <Mail className="h-4 w-4" /> });
      }

      qc.invalidateQueries({ queryKey: ["users-management"] });
      resetForm();
      onClose();
    } catch (e: any) {
      const message = e?.message || "Failed to create user";
      if (message.toLowerCase().includes("already") || message.toLowerCase().includes("exists")) {
        toast.error("A user with this email already exists");
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { resetForm(); onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create New User
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {manualMode ? "Manual Creation" : "Email Invitation"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {manualMode
                  ? "Set password directly — user can log in immediately"
                  : "Send invite email — user sets their own password"}
              </p>
            </div>
            <Switch checked={manualMode} onCheckedChange={setManualMode} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name *</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@company.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Role *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Type: {roleType(role) === "hq" ? "HQ" : "Partner"} (auto-derived)
              </p>
            </div>
            {isPartnerRole && (
              <div>
                <Label>Linked Partner *</Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Partner</SelectItem>
                    {partners?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <RolePreview role={role} />

          {/* Password fields for manual mode */}
          {manualMode && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <Label>Confirm Password *</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              {manualMode ? (
                <>
                  <KeyRound className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    The user will be created with status <strong>Active</strong> and can log in immediately with the password you set.
                  </p>
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    An invitation email will be sent to the user with a secure link to set their password.
                    The user's status will be <strong>Pending</strong> until they complete the setup.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { resetForm(); onClose(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {manualMode ? (
                <>
                  <KeyRound className="h-4 w-4 mr-2" />
                  {saving ? "Creating..." : "Create User"}
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  {saving ? "Sending Invite..." : "Send Invitation"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RolePreview({ role }: { role: string }) {
  const { data: templates } = useRoleTemplates();
  const rows = (templates ?? []).filter((t) => t.role === role && t.access_level !== "no_access");
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        This role currently has no module access in the template.
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium mb-2">Role permissions preview</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {rows.map((r) => (
          <div key={r.module_key} className="flex items-center justify-between">
            <span className="text-muted-foreground">{MODULE_LABELS[r.module_key as keyof typeof MODULE_LABELS] ?? r.module_key}</span>
            <span className="font-medium capitalize">{r.access_level.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateUser, useUpdateUserRole, useUserPermissions, useSavePermissions, MODULE_KEYS_LIST, MODULE_LABELS, type UserProfile, type ModulePermission } from "@/hooks/useUsers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Shield, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ROLE_OPTIONS, roleType } from "@/lib/permissions";
import { useEffectivePermissions, useResetUserToTemplate } from "@/hooks/useRoleTemplates";

const ROLES = ROLE_OPTIONS;

const ACCESS_LEVELS = [
  { value: "no_access", label: "No Access" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
  { value: "admin", label: "Admin" },
];

export function UserEditDialog({ user, open, onClose }: { user: UserProfile | null; open: boolean; onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [partnerId, setPartnerId] = useState("none");
  const [isActive, setIsActive] = useState(true);
  const [role, setRole] = useState("partner_sales");
  const [permTab, setPermTab] = useState("profile");
  const [perms, setPerms] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const updateUser = useUpdateUser();
  const updateRole = useUpdateUserRole();
  const savePerms = useSavePermissions();
  const resetTemplate = useResetUserToTemplate();
  const { data: existingPerms } = useUserPermissions(open ? user?.id : undefined);
  const { data: effective } = useEffectivePermissions(open ? user?.id : undefined);
  const { data: partners } = useQuery({
    queryKey: ["partners-select"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, company_name").order("company_name");
      return data || [];
    },
  });

  // Reset form state when user changes
  useEffect(() => {
    if (user && open) {
      setFullName(user.full_name || "");
      setPartnerId(user.partner_id || "none");
      setIsActive(user.is_active ?? true);
      setRole(user.roles[0] || "partner_sales");
      setPermTab("profile");
    }
  }, [user?.id, open]);

  // Sync permissions when loaded
  useEffect(() => {
    if (existingPerms) {
      const map: Record<string, string> = {};
      existingPerms.forEach(p => { map[p.module_key] = p.access_level; });
      setPerms(map);
    }
  }, [existingPerms]);

  if (!user) return null;

  const isPartnerRole = role.startsWith("partner_");

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (isPartnerRole && partnerId === "none") {
      toast.error("Partner is required for partner users");
      return;
    }

    setSaving(true);
    try {
      await updateUser.mutateAsync({
        userId: user.id,
        updates: {
          full_name: fullName.trim(),
          partner_id: isPartnerRole && partnerId !== "none" ? partnerId : null,
          is_hq: !isPartnerRole,
          is_active: isActive,
        },
      });
      if (role !== user.roles[0]) {
        await updateRole.mutateAsync({ userId: user.id, role });
      }
      onClose();
    } catch (e: any) {
      // error already toasted by mutation
    } finally {
      setSaving(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Only persist values that differ from the inherited template — those become overrides
      const permissions: ModulePermission[] = MODULE_KEYS_LIST.flatMap(k => {
        const inherited = effective?.find(e => e.module_key === k)?.template_level ?? "no_access";
        const current = perms[k] ?? inherited;
        if (current === inherited) return [];
        return [{ module_key: k, access_level: current }];
      });
      await savePerms.mutateAsync({ userId: user.id, permissions });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Edit User — {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={permTab} onValueChange={setPermTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="profile">Profile & Role</TabsTrigger>
            <TabsTrigger value="permissions">Module Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Full Name *</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user.email || ""} disabled className="opacity-60" />
              </div>
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
              </div>
              {isPartnerRole && (
                <div className="col-span-2">
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
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active Status</p>
                <p className="text-xs text-muted-foreground">Inactive users cannot log in</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            {(() => {
              const overrideCount = (existingPerms ?? []).length;
              const usingTemplate = overrideCount === 0;
              return (
                <div className={`rounded-md border p-3 text-sm ${usingTemplate ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {usingTemplate ? "Using role template" : `Custom permissions override active (${overrideCount})`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Effective access is shown next to each module. Inherited values come from the role template.
                      </p>
                    </div>
                    {!usingTemplate && (
                      <Button size="sm" variant="outline" onClick={() => user && resetTemplate.mutate(user.id)}>
                        <RotateCcw className="h-4 w-4 mr-2" /> Reset to role template
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              {MODULE_KEYS_LIST.map(key => {
                const eff = effective?.find((e) => e.module_key === key);
                const inherited = (eff?.template_level ?? "no_access");
                const current = perms[key] ?? inherited;
                const isOverride = current !== inherited;
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{MODULE_LABELS[key]}</span>
                      <span className="text-[11px] text-muted-foreground">
                        Inherited: <span className="capitalize">{inherited.replace("_", " ")}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverride && <Badge variant="outline" className="bg-warning/10 text-warning-foreground">Override</Badge>}
                      <Select value={current} onValueChange={v => setPerms(prev => ({ ...prev, [key]: v }))}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACCESS_LEVELS.map(a => (
                            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={handleSavePermissions} disabled={saving}>
                {saving ? "Saving..." : "Save custom permissions"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUsers, useUpdateUser, useUpdateUserRole, useUserPermissions, useSavePermissions, MODULE_KEYS_LIST, MODULE_LABELS, type UserProfile, type ModulePermission } from "@/hooks/useUsers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Search, UserPlus, Edit, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { Navigate } from "react-router-dom";

const ROLES = [
  { value: "hq_admin", label: "HQ Admin" },
  { value: "hq_standard", label: "HQ Standard" },
  { value: "partner_manager", label: "Partner Manager" },
  { value: "partner_admin", label: "Partner Admin" },
  { value: "partner_sales", label: "Partner Sales" },
  { value: "partner_readonly", label: "Partner Read Only" },
];

const ACCESS_LEVELS = [
  { value: "no_access", label: "No Access" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
  { value: "admin", label: "Admin" },
];

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    hq_admin: "bg-primary/10 text-primary border-primary/20",
    hq_standard: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    partner_manager: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    partner_admin: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    partner_sales: "bg-green-500/10 text-green-600 border-green-500/20",
    partner_readonly: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={colors[role] || "bg-muted text-muted-foreground"}>
      {role.replace(/_/g, " ")}
    </Badge>
  );
}

function UserEditDialog({ user, open, onClose }: { user: UserProfile | null; open: boolean; onClose: () => void }) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [partnerId, setPartnerId] = useState(user?.partner_id || "none");
  const [isHq, setIsHq] = useState(user?.is_hq ?? false);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [role, setRole] = useState(user?.roles[0] || "partner_sales");
  const [permTab, setPermTab] = useState("profile");
  const [perms, setPerms] = useState<Record<string, string>>({});

  const updateUser = useUpdateUser();
  const updateRole = useUpdateUserRole();
  const savePerms = useSavePermissions();
  const { data: existingPerms } = useUserPermissions(user?.id);
  const { data: partners } = useQuery({
    queryKey: ["partners-select"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, company_name").order("company_name");
      return data || [];
    },
  });

  // Sync state when user or perms change
  useState(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPhone(user.phone || "");
      setPartnerId(user.partner_id || "none");
      setIsHq(user.is_hq ?? false);
      setIsActive(user.is_active ?? true);
      setRole(user.roles[0] || "partner_sales");
    }
  });

  useState(() => {
    if (existingPerms) {
      const map: Record<string, string> = {};
      existingPerms.forEach(p => { map[p.module_key] = p.access_level; });
      setPerms(map);
    }
  });

  if (!user) return null;

  const isPartnerRole = role.startsWith("partner_");

  const handleSaveProfile = async () => {
    await updateUser.mutateAsync({
      userId: user.id,
      updates: {
        full_name: fullName,
        phone: phone || null,
        partner_id: isPartnerRole && partnerId !== "none" ? partnerId : null,
        is_hq: !isPartnerRole,
        is_active: isActive,
      },
    });
    if (role !== user.roles[0]) {
      await updateRole.mutateAsync({ userId: user.id, role });
    }
    onClose();
  };

  const handleSavePermissions = async () => {
    const permissions: ModulePermission[] = MODULE_KEYS_LIST.map(k => ({
      module_key: k,
      access_level: perms[k] || "no_access",
    }));
    await savePerms.mutateAsync({ userId: user.id, permissions });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
                <Label>Full Name</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user.email || ""} disabled className="opacity-60" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
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
                  <Label>Linked Partner</Label>
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
              <Button onClick={handleSaveProfile} disabled={updateUser.isPending || updateRole.isPending}>
                Save Profile
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            <p className="text-sm text-muted-foreground">Define what this user can access in each module.</p>
            <div className="space-y-2">
              {MODULE_KEYS_LIST.map(key => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">{MODULE_LABELS[key]}</span>
                  <Select value={perms[key] || "no_access"} onValueChange={v => setPerms(prev => ({ ...prev, [key]: v }))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_LEVELS.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const all: Record<string, string> = {};
                  MODULE_KEYS_LIST.forEach(k => { all[k] = "admin"; });
                  setPerms(all);
                }}>Grant All</Button>
                <Button size="sm" variant="outline" onClick={() => setPerms({})}>Revoke All</Button>
              </div>
              <Button onClick={handleSavePermissions} disabled={savePerms.isPending}>
                Save Permissions
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const { isAdmin } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const updateUser = useUpdateUser();

  if (!isAdmin) return <Navigate to="/" replace />;

  const filtered = (users || []).filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.partner_name?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleActive = async (user: UserProfile) => {
    await updateUser.mutateAsync({
      userId: user.id,
      updates: { is_active: !user.is_active },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles and module permissions</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Badge variant="secondary">{filtered.length} users</Badge>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
            ) : filtered.map(user => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={user.is_hq ? "bg-primary/5 text-primary" : "bg-amber-500/5 text-amber-600"}>
                    {user.is_hq ? "HQ" : "Partner"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.roles.length > 0 ? user.roles.map(r => <RoleBadge key={r} role={r} />) : <span className="text-xs text-muted-foreground">No role</span>}
                </TableCell>
                <TableCell className="text-sm">{user.partner_name || "—"}</TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "default" : "secondary"} className={user.is_active ? "bg-green-500/10 text-green-600 border-green-500/20" : ""}>
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditUser(user)} title="Edit user">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => toggleActive(user)} title={user.is_active ? "Deactivate" : "Activate"}>
                      {user.is_active ? <ShieldX className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserEditDialog user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
    </div>
  );
}

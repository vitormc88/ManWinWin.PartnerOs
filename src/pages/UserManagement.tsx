import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUsers, useUpdateUser, type UserProfile } from "@/hooks/useUsers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, UserPlus, Edit, ShieldCheck, ShieldX, Mail, RotateCw } from "lucide-react";
import { Navigate } from "react-router-dom";
import { RoleBadge } from "@/components/users/RoleBadge";
import { UserEditDialog } from "@/components/users/UserEditDialog";
import { UserCreateDialog } from "@/components/users/UserCreateDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAppRedirectUrl } from "@/lib/app-url";

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") {
    return (
      <Badge variant="default" className="bg-success/10 text-success border-success/20">
        Active
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="secondary" className="bg-warning/15 text-warning-foreground border-warning/30">
        Pending
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      {status || "Unknown"}
    </Badge>
  );
}

export default function UserManagement() {
  const { isAdmin } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
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

  const resendInvite = async (user: UserProfile) => {
    if (!user.email) return;
    setResending(user.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          action: "resend_invite",
          email: user.email,
          redirectTo: getAppRedirectUrl("/reset-password"),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitation resent to ${user.email}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to resend invitation");
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles and module permissions</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
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
                  <Badge variant="outline" className={user.is_hq ? "bg-primary/5 text-primary" : "bg-warning/10 text-warning-foreground"}>
                    {user.is_hq ? "HQ" : "Partner"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.roles.length > 0 ? user.roles.map(r => <RoleBadge key={r} role={r} />) : <span className="text-xs text-muted-foreground">No role</span>}
                </TableCell>
                <TableCell className="text-sm">{user.partner_name || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={user.invitation_status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {user.invitation_status === "pending" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => resendInvite(user)}
                        disabled={resending === user.id}
                        title="Resend invitation"
                      >
                        {resending === user.id ? (
                          <RotateCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4 text-info" />
                        )}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => setEditUser(user)} title="Edit user">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => toggleActive(user)} title={user.is_active ? "Deactivate" : "Activate"}>
                      {user.is_active ? <ShieldX className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-success" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserEditDialog user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
      <UserCreateDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

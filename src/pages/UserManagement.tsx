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
import { getPublishedResetPasswordUrl } from "@/lib/app-url";
import { matchesUserFilters } from "@/lib/ux-discovery";

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") {
    return (
      <Badge variant="default" className="bg-success/10 text-success border-success/20">
        Invitation: active
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="secondary" className="bg-warning/15 text-warning-foreground border-warning/30">
        Invitation pending
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      Invitation: {status || "unknown"}
    </Badge>
  );
}

export default function UserManagement() {
  const { isAdmin } = useAuth();
  const { data: users, isLoading, isError, refetch } = useUsers();
  const [search, setSearch] = useState("");
  const [roleFilter,setRoleFilter] = useState('all');
  const [partnerFilter,setPartnerFilter] = useState('all');
  const [statusFilter,setStatusFilter] = useState('all');
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const updateUser = useUpdateUser();

  if (!isAdmin) return <Navigate to="/" replace />;

  const filtered = (users || []).filter(u => matchesUserFilters(u,{role:roleFilter,partner:partnerFilter,status:statusFilter}) && (
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.partner_name?.toLowerCase().includes(search.toLowerCase())
  ));
  const roleOptions = [...new Set((users ?? []).flatMap(u=>u.roles))].sort();
  const partnerOptions = [...new Map((users ?? []).filter(u=>u.partner_id).map(u=>[u.partner_id!,u.partner_name || 'Unknown partner'])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));

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
          redirectTo: getPublishedResetPasswordUrl(),
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search users" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select aria-label="Filter by role" className="border rounded-md bg-background p-2 text-sm" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">All roles</option>{roleOptions.map(role=><option key={role} value={role}>{role.replace(/_/g,' ')}</option>)}</select>
        <select aria-label="Filter by partner or HQ" className="border rounded-md bg-background p-2 text-sm" value={partnerFilter} onChange={e=>setPartnerFilter(e.target.value)}><option value="all">All partners & HQ</option><option value="hq">HQ</option><option value="unassigned">Partner user · unassigned</option>{partnerOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Filter by account status" className="border rounded-md bg-background p-2 text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All account statuses</option><option value="active">Active accounts</option><option value="inactive">Inactive accounts</option><option value="pending">Pending invitation</option></select>
        <Button variant="ghost" onClick={()=>{setSearch('');setRoleFilter('all');setPartnerFilter('all');setStatusFilter('all')}}>Clear filters</Button>
        <Badge variant="secondary">{filtered.length} of {users?.length ?? 0} users</Badge>
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
            ) : isError ? (
              <TableRow><TableCell colSpan={7}><p role="alert">Unable to load users. No account changes have been made.</p><Button variant="outline" onClick={()=>void refetch()}>Retry</Button></TableCell></TableRow>
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
                  <Badge variant={user.is_active === true ? 'outline' : 'secondary'}>{user.is_active === true ? 'Active account' : user.is_active === false ? 'Inactive account' : 'Account status unknown'}</Badge>{' '}
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

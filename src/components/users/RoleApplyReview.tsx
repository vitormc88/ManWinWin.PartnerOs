import { useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { useApplyRoleTemplate } from '@/hooks/useRoleTemplates';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

/** Mounted only inside the HQ-admin settings page. Read-only until Apply. */
export function RoleApplyReview({ role, label, disabled }: { role: string; label: string; disabled: boolean }) {
  const [overwrite,setOverwrite] = useState(false);
  const { data: users, isLoading, isError } = useUsers();
  const apply = useApplyRoleTemplate();
  const candidates = (users ?? []).filter(user=>user.roles.includes(role));
  return <AlertDialog onOpenChange={open=>{if(open)setOverwrite(false)}}>
    <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled || apply.isPending}>Review application to existing users</Button></AlertDialogTrigger>
    <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
      <AlertDialogHeader><AlertDialogTitle>Review saved template — {label}</AlertDialogTitle><AlertDialogDescription>This uses the saved template, not unsaved edits. Existing custom overrides are preserved by default. Users without overrides inherit the saved template automatically. Selecting overwrite removes overrides for every account holding this role, including inactive accounts and accounts with multiple roles.</AlertDialogDescription></AlertDialogHeader>
      {isLoading ? <p role="status">Loading accounts with this role…</p> : isError ? <p role="alert">Could not load the affected account list. Close and retry before applying.</p> : <div className="text-sm space-y-2"><p className="font-medium">{candidates.length} accounts with this role in the loaded directory</p><ul className="max-h-40 overflow-auto list-disc pl-5">{candidates.map(user=><li key={user.id}>{user.full_name || user.email || 'Unnamed account'} · {user.partner_name || (user.is_hq ? 'HQ' : 'No partner')} · {user.is_active===true?'Active':'Inactive / unconfirmed'}</li>)}</ul><p className="text-muted-foreground">This previews scope, not the count of changed permissions. Individual overrides and other roles affect effective access. Review Module Permissions on the user’s profile for effective levels.</p></div>}
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={overwrite} onCheckedChange={value=>setOverwrite(value===true)} />Remove custom overrides for accounts with this role</label>
      {overwrite && <p role="alert" className="text-sm text-destructive">Custom exceptions will be removed. Other assigned roles still contribute to effective access. Role assignments are not changed.</p>}
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={disabled || isLoading || isError || !users || apply.isPending} onClick={()=>apply.mutate({role,overwriteOverrides:overwrite})}>{overwrite?'Apply and remove overrides':'Apply preserving overrides'}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

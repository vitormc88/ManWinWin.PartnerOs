import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useExplorerSettings,type ExplorerMode} from '@/hooks/useExplorerSettings';
import {useUsers} from '@/hooks/useUsers';
export default function CustomerExplorerSettings(){
 const settings=useExplorerSettings();
 const users=useUsers();
 const [mode,setMode]=useState<ExplorerMode>('hq');
 const [pilots,setPilots]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(settings.data){setMode(settings.data.mode);setPilots(settings.data.pilot_user_ids);}},[settings.data]);
 if(settings.isLoading)return <p role="status">Loading Explorer settings…</p>;
 if(settings.error||!settings.data)return <p role="alert">Explorer settings are unavailable or your account does not have administration permission.</p>;
 const save=async()=>{setBusy(true);setError('');setMessage('');try{await settings.configure(mode,pilots);setMessage('Explorer settings saved. Database access rules are now in effect.');}catch(e){setError(e instanceof Error?e.message:'Unable to save settings.');}finally{setBusy(false);}};
 return <section className="space-y-5 rounded-xl border p-6"><div><h1 className="text-xl font-semibold">Customer Explorer</h1><p className="mt-2 text-sm text-muted-foreground">Visibility is enforced in the database. User Management permissions still apply to every account.</p></div>
 {settings.data.sync_failed_at&&<p role="alert" className="rounded border p-3">Explorer synchronization was stopped after an error. Other client operations were preserved. Correct the source problem before re-enabling; saving an enabled mode rebuilds and verifies the directory.</p>}
 <label className="block text-sm">Availability<select aria-label="Explorer availability" className="mt-2 block rounded border bg-background p-2" value={mode} onChange={e=>setMode(e.target.value as ExplorerMode)}><option value="off">Disabled</option><option value="hq">HQ only</option><option value="pilot">HQ + selected test partners</option><option value="all">All eligible partners</option></select></label>
 {mode==='pilot'&&<fieldset className="space-y-2"><legend>Selected partner accounts</legend>{users.error&&<p role="alert">Unable to load partner accounts.</p>}{(users.data||[]).filter(u=>u.is_active&&!u.is_hq&&u.partner_id&&u.invitation_status!=='pending').map(u=><label key={u.id} className="flex gap-2 text-sm"><input type="checkbox" checked={pilots.includes(u.id)} onChange={e=>setPilots(e.target.checked?[...pilots,u.id]:pilots.filter(id=>id!==u.id))}/>{u.full_name||'Unnamed account'} · {u.partner_name}</label>)}</fieldset>}
 {mode==='all'&&<p className="text-sm">This opens the directory to active partner accounts with Customer Explorer permission. It does not grant editing rights or override individual access restrictions.</p>}
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <button className="rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy||(mode==='pilot'&&pilots.length===0)} onClick={save}>{busy?'Saving…':'Save Explorer settings'}</button>
 <div className="border-t pt-4 text-sm"><p>Customer sectors, HQ customers and visibility are managed in the directory. Role defaults are managed under Roles &amp; Permissions; individual exceptions under User Management.</p><Link className="mt-3 inline-block text-primary underline" to="/customer-explorer">Open customer directory</Link></div>
 </section>;
}

import { CustomerExplorer } from "@/components/customer-explorer/CustomerExplorer";
import { useCustomerExplorer, useDirectoryWrites } from "@/hooks/useCustomerExplorer";
import { useExplorerAccess } from "@/hooks/useExplorerAccess";
import { useState } from "react";
import { DirectoryManager } from "@/components/customer-explorer/DirectoryManager";

export default function CustomerExplorerPage() {
  const access=useExplorerAccess();
  const canRead=!access.isError&&access.data?.read===true;
  const canManage=canRead&&access.data?.manage===true;
  const [manage,setManage]=useState(false);
  const writes=useDirectoryWrites();
  const { data, isLoading, error, refetch } = useCustomerExplorer(canManage,canRead);
  if (access.isLoading || (canRead&&isLoading)) return <div role="status" className="p-10 text-center text-muted-foreground">Loading the customer network…</div>;
  if (!canRead) return <div role="alert" className="p-10">Customer Explorer has not been enabled for your account.</div>;
  if (error) return <div role="alert" className="rounded-xl border p-8"><h1 className="text-xl font-semibold">Customer network unavailable</h1><p className="my-3 text-sm text-muted-foreground">Your session may have expired or the directory has not been enabled for this environment.</p><button onClick={() => refetch()} className="text-primary">Try again</button></div>;
  if(manage&&canManage)return <DirectoryManager rows={data||[]} {...writes} onClose={()=>setManage(false)}/>;
  return <><div className="ce-admin-actions">{canManage&&<button onClick={()=>setManage(true)}>Manage directory</button>}</div><CustomerExplorer clients={(data || []).filter(r=>r.visible)} onRefresh={() => refetch()} /></>;
}

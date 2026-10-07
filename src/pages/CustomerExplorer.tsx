import { CustomerExplorer } from "@/components/customer-explorer/CustomerExplorer";
import { useCustomerExplorer } from "@/hooks/useCustomerExplorer";

export default function CustomerExplorerPage() {
  const { data, isLoading, error, refetch } = useCustomerExplorer();
  if (isLoading) return <div role="status" className="p-10 text-center text-muted-foreground">Loading the customer network…</div>;
  if (error) return <div role="alert" className="rounded-xl border p-8"><h1 className="text-xl font-semibold">Customer network unavailable</h1><p className="my-3 text-sm text-muted-foreground">Your session may have expired or the directory has not been enabled for this environment.</p><button onClick={() => refetch()} className="text-primary">Try again</button></div>;
  return <CustomerExplorer clients={data || []} onRefresh={() => refetch()} />;
}

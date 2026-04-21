import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Trash2, Plus, FileX } from "lucide-react";
import { useLeadProposals, useDeleteProposal } from "@/hooks/useProposals";
import { downloadProposalDocx } from "@/lib/proposal-docx";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/proposal-i18n";
import { toast } from "sonner";
import { useState } from "react";
import { CreateProposalDialog } from "./CreateProposalDialog";

interface Props {
  leadId: string;
  defaultClientName: string;
  defaultCountry?: string | null;
}

const statusVariant = (s: string): any => {
  if (s === "Won") return "success";
  if (s === "Lost") return "destructive";
  if (s === "Sent") return "default";
  if (s === "Ready") return "secondary";
  return "outline";
};

export function ProposalsTab({ leadId, defaultClientName, defaultCountry }: Props) {
  const { data: proposals = [], isLoading } = useLeadProposals(leadId);
  const del = useDeleteProposal();
  const [showCreate, setShowCreate] = useState(false);

  const reDownload = async (id: string) => {
    const { data: prop } = await supabase.from("proposals").select("*").eq("id", id).single();
    const { data: items } = await supabase
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", id)
      .order("sort_order");
    if (!prop || !items) {
      toast.error("Could not load proposal");
      return;
    }
    await downloadProposalDocx(prop as any, items as any);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Proposals ({proposals.length})</h3>
          <p className="text-xs text-muted-foreground">ManWinWin Professional commercial proposals</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Generate Proposal
        </Button>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : proposals.length === 0 ? (
          <div className="p-12 text-center">
            <FileX className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No proposals yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Click "Generate Proposal" to create the first one</p>
          </div>
        ) : (
          <div className="divide-y">
            {proposals.map((p) => (
              <div key={p.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors group">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {p.client_name} — Plan {p.plan} ({p.hosting})
                        </p>
                        <Badge variant={statusVariant(p.status)} className="text-[10px]">{p.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">v{p.version}</Badge>
                        <Badge variant="outline" className="text-[10px]">{p.language}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(p.created_at).toLocaleDateString("en-GB")} · Year 1:{" "}
                        <strong>{formatEuro(Number(p.total_year_1) || 0, p.language as any)}</strong> · Recurring:{" "}
                        {formatEuro(Number(p.total_recurring) || 0, p.language as any)} / yr
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => reDownload(p.id)}>
                      <Download className="h-3.5 w-3.5 mr-1" />DOCX
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this proposal?")) del.mutate(p.id);
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateProposalDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        leadId={leadId}
        defaultClientName={defaultClientName}
        defaultCountry={defaultCountry}
      />
    </div>
  );
}

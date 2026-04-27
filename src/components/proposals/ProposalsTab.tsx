import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Trash2, Plus, FileX, Printer, Copy, Pencil } from "lucide-react";
import { useLeadProposals, useDeleteProposal, useDuplicateProposal } from "@/hooks/useProposals";
import { downloadProposalDocx } from "@/lib/proposal-docx";
import { printProposal } from "@/lib/proposal-print";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/proposal-i18n";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreateProposalDialog } from "./CreateProposalDialog";
import type { Proposal, ProposalItem } from "@/types/proposal";

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
  const dup = useDuplicateProposal();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingProposal, setEditingProposal] = useState<(Proposal & { items?: ProposalItem[] }) | null>(null);

  const loadProposalAndItems = async (id: string) => {
    const { data: prop } = await supabase.from("proposals").select("*").eq("id", id).single();
    const { data: items } = await supabase
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", id)
      .order("sort_order");
    if (!prop || !items) {
      toast.error("Could not load proposal");
      return null;
    }
    return { prop, items };
  };

  /** Bump status to Ready when a document is generated from a Draft. */
  const promoteToReadyIfDraft = async (prop: any) => {
    if (prop?.status === "Draft") {
      await supabase
        .from("proposals")
        .update({ status: "Ready", generated_at: new Date().toISOString() })
        .eq("id", prop.id);
      qc.invalidateQueries({ queryKey: ["proposals"] });
    }
  };

  const reDownload = async (id: string) => {
    const res = await loadProposalAndItems(id);
    if (!res) return;
    await downloadProposalDocx(res.prop as any, res.items as any);
    await promoteToReadyIfDraft(res.prop);
  };

  const printPdf = async (id: string) => {
    const res = await loadProposalAndItems(id);
    if (!res) return;
    printProposal(res.prop as any, res.items as any);
    await promoteToReadyIfDraft(res.prop);
  };

  const duplicate = async (id: string) => {
    try {
      const created = await dup.mutateAsync(id);
      const res = await loadProposalAndItems(created.id);
      if (res) setEditingProposal({ ...(res.prop as Proposal), items: res.items as ProposalItem[] });
      toast.success(`Duplicated as v${created.version} (Draft)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to duplicate");
    }
  };

  const editProposal = async (id: string) => {
    const res = await loadProposalAndItems(id);
    if (!res) return;
    setEditingProposal({ ...(res.prop as Proposal), items: res.items as ProposalItem[] });
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
            {proposals.map((p) => {
              const isBusiness = (p as any).product_family === "Business";
              const proposalMode: string | null = (p as any).proposal_mode || null;
              const licenseModel: string | null = (p as any).license_model || null;
              const deployment: string | null = (p as any).deployment || null;
              const modeLabel = isBusiness
                ? proposalMode === "compare_keepit_useit"
                  ? "Compare KeepIT vs UseIT"
                  : proposalMode === "keepit_only" || licenseModel === "keepit"
                  ? "KeepIT"
                  : proposalMode === "useit_only" || licenseModel === "useit"
                  ? "UseIT"
                  : null
                : null;
              return (
              <div key={p.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors group">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {p.client_name}
                          {isBusiness
                            ? ` — Business (${deployment === "on_premise" ? "On-Premise" : "SaaS"})`
                            : ` — Plan ${p.plan} (${p.hosting})`}
                        </p>
                        <Badge variant={statusVariant(p.status)} className="text-[10px]">{p.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">v{p.version}</Badge>
                        <Badge variant="outline" className="text-[10px]">{p.language}</Badge>
                        {isBusiness && (
                          <Badge variant="secondary" className="text-[10px]">Business</Badge>
                        )}
                        {modeLabel && (
                          <Badge variant="outline" className="text-[10px]">{modeLabel}</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(p.created_at).toLocaleDateString("en-GB")} · Year 1:{" "}
                        <strong>{formatEuro(Number(p.total_year_1) || 0, p.language as any)}</strong> · Recurring:{" "}
                        {formatEuro(Number(p.total_recurring) || 0, p.language as any)} / yr
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isBusiness && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => printPdf(p.id)} title="Print / Save as PDF">
                          <Printer className="h-3.5 w-3.5 mr-1" />PDF
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => reDownload(p.id)} title="Download DOCX">
                          <Download className="h-3.5 w-3.5 mr-1" />DOCX
                        </Button>
                      </>
                    )}
                    {isBusiness && (
                      <span className="text-[10px] text-muted-foreground italic px-2">
                        Document export coming soon
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => editProposal(p.id)} title="Edit proposal">
                      <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicate(p.id)}
                      disabled={dup.isPending}
                      title="Duplicate as new version"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />Duplicate
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this proposal?")) del.mutate({ id: p.id, leadId });
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              );
            })}
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

      <CreateProposalDialog
        open={!!editingProposal}
        onOpenChange={(open) => {
          if (!open) setEditingProposal(null);
        }}
        leadId={leadId}
        defaultClientName={defaultClientName}
        defaultCountry={defaultCountry}
        editingProposal={editingProposal}
      />
    </div>
  );
}

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Mail, Phone, User as UserIcon, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useClientContacts } from "@/hooks/useClients";
import {
  buildCommercialSummary,
  deriveTopAttention,
  pickPrimaryContact,
  type UrgencyTone,
} from "@/lib/client-overview";
import type { ResolvedRenewal } from "@/lib/renewal-resolution";

interface Props {
  clientId: string;
  client: any;
  intelligence?: { recurring_arr?: number | null; year1_value?: number | null; active_contract_count?: number | null } | null;
  resolvedRenewal?: ResolvedRenewal | null;
  contractStatus?: string | null;
  hasLicense?: boolean;
  readOnly?: boolean;
  onOpenTab?: (tab: string) => void;
  onViewContacts?: () => void;
}

const fmtCurrency = (n: number) => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `€${Math.round(n)}`;
  }
};

function toneClass(tone: UrgencyTone) {
  switch (tone) {
    case "critical":
      return "text-destructive";
    case "warning":
      return "text-amber-700";
    case "calm":
      return "text-emerald-700";
    default:
      return "text-muted-foreground";
  }
}

export function ClientOverviewPanel({
  clientId,
  client,
  intelligence,
  resolvedRenewal,
  contractStatus,
  hasLicense = true,
  readOnly = false,
  onOpenTab,
  onViewContacts,
}: Props) {
  const { data: contacts = [] } = useClientContacts(clientId);
  const primary = pickPrimaryContact(contacts as any[]);
  const remaining = Math.max((contacts?.length || 0) - 1, 0);

  const summary = buildCommercialSummary({
    intelligence,
    resolvedRenewal,
    contractStatus,
    activeContractCount: intelligence?.active_contract_count ?? null,
  });

  const attention = deriveTopAttention({
    resolvedRenewal,
    hasLicense,
    hasContacts: (contacts?.length || 0) > 0,
    clientStatus: client?.status,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* Primary contact */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-primary" /> Primary contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!primary ? (
            <p className="text-sm text-muted-foreground">No contacts yet</p>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground break-words">{primary.contact_name || "Unnamed contact"}</p>
                {primary.role_function && (
                  <p className="text-xs text-muted-foreground break-words">{primary.role_function}</p>
                )}
              </div>
              {primary.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 break-all">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {primary.email}
                </p>
              )}
              {(primary.phone || primary.mobile) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 break-all">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {primary.phone || primary.mobile}
                </p>
              )}
              {remaining > 0 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onViewContacts}>
                  <Users className="h-3.5 w-3.5 mr-1" /> View all ({remaining} more)
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Compact commercial summary */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Commercial position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Row label="Contract status" value={summary.contractLabel} />
          <Row
            label="Recurring revenue (ARR)"
            value={
              summary.arrZeroWithYear1 ? (
                <span className="text-foreground">
                  No recurring revenue recorded
                </span>
              ) : (
                `${fmtCurrency(summary.arr)} / year`
              )
            }
          />
          {(summary.arrZeroWithYear1 || summary.year1 > 0) && (
            <Row label="Year 1 value" value={fmtCurrency(summary.year1)} />
          )}
          <Row
            label="Next renewal"
            value={
              <span className="text-right">
                <span className="text-foreground">{summary.renewalLabel}</span>
                <span className={`block text-[11px] ${toneClass(summary.urgency.tone)}`}>{summary.urgency.label}</span>
              </span>
            }
          />
          <div className="pt-1 text-[11px] text-muted-foreground">
            Details in{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => onOpenTab?.("licensing")}>
              Licensing
            </button>{" "}
            and{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => onOpenTab?.("contract")}>
              Contract
            </button>
            .
          </div>
        </CardContent>
      </Card>

      {/* Needs attention */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Needs attention</CardTitle>
        </CardHeader>
        <CardContent>
          {!attention ? (
            <div className="flex items-start gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No immediate action required.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`h-4 w-4 mt-0.5 shrink-0 ${attention.severity === "critical" ? "text-destructive" : "text-amber-600"}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground break-words">{attention.title}</p>
                  <p className="text-xs text-muted-foreground break-words">{attention.detail}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">{attention.severity}</Badge>
              {!readOnly && attention.route && attention.actionLabel && (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => onOpenTab?.(attention.route!.replace("?tab=", ""))}
                  >
                    {attention.actionLabel}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

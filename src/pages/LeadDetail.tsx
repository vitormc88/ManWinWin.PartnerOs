import { useParams, useNavigate } from "react-router-dom";
import { useIncomingLead, useUpdateIncomingLead, useDeleteIncomingLead, LEAD_STATUSES } from "@/hooks/useIncomingLeads";
import { usePartners } from "@/hooks/usePartners";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Building2, Trash2, Save } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useIncomingLead(id);
  const { data: partners = [] } = usePartners();
  const updateLead = useUpdateIncomingLead();
  const deleteLead = useDeleteIncomingLead();
  const { profile, isHQ, isAdmin } = useAuth();

  const isPartnerUser = profile?.is_hq !== true;
  const isHQUser = isHQ || isAdmin;
  const activePartners = partners.filter(p => p.is_active);

  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [partnerId, setPartnerId] = useState<string>("__hq__");
  const [routingReason, setRoutingReason] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (lead) {
      setStatus(lead.status || "New");
      setNotes(lead.notes || "");
      setPartnerId(lead.linked_partner_id || "__hq__");
      setRoutingReason(lead.routing_reason || "");
      setDirty(false);
    }
  }, [lead]);

  const handleSave = () => {
    if (!lead) return;
    const resolvedPartnerId = partnerId === "__hq__" ? null : partnerId;
    const ownerType = resolvedPartnerId ? "partner" : "HQ";

    const base = {
      id: lead.id,
      status,
      notes,
    };

    const updates = isHQUser
      ? { ...base, linked_partner_id: resolvedPartnerId, lead_owner_type: ownerType, routing_reason: routingReason }
      : base;

    updateLead.mutate(updates as any, {
      onSuccess: () => {
        toast.success("Lead updated");
        setDirty(false);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleDelete = () => {
    if (!lead) return;
    deleteLead.mutate(lead.id, {
      onSuccess: () => {
        toast.success("Lead deleted");
        navigate("/incoming-leads");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "New": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "Assigned": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "In Review": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "Contacted": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "Qualified": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "Rejected": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading lead…</div>;
  }

  if (!lead) {
    return <div className="p-6 text-muted-foreground">Lead not found.</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/incoming-leads")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{lead.company_name || "Unnamed Lead"}</h1>
            <p className="text-sm text-muted-foreground">
              Created {format(new Date(lead.created_at), "dd MMM yyyy 'at' HH:mm")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColor(lead.status || "New")}>{lead.status || "New"}</Badge>
          {lead.partners ? (
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3 w-3" />
              {lead.partners.company_name}
            </Badge>
          ) : (
            <Badge variant="outline">HQ</Badge>
          )}
        </div>
      </div>

      {/* Section 1: Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <InfoField label="Company Name" value={lead.company_name} />
            <InfoField label="Contact Name" value={lead.contact_name} />
            <InfoField label="Email" value={lead.email} />
            <InfoField label="Phone" value={lead.phone} />
            <InfoField label="Country" value={lead.country} />
            <InfoField label="Job Role" value={lead.job_role} />
            <InfoField label="Lead Source" value={lead.lead_source} />
            <InfoField label="SharpSpring ID" value={lead.sharpspring_id} />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Qualification Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qualification Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <InfoField label="Asset Range" value={lead.asset_range} />
            <InfoField label="Maintenance Team Size" value={lead.maintenance_team_size} />
            <InfoField label="Sector" value={lead.sector} />
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Assigned Partner</Label>
              {isHQUser ? (
                <Select
                  value={partnerId}
                  onValueChange={(v) => { setPartnerId(v); setDirty(true); }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select partner…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__hq__">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">HQ</Badge>
                        No partner (HQ owned)
                      </span>
                    </SelectItem>
                    {activePartners
                      .sort((a, b) => a.company_name.localeCompare(b.company_name))
                      .map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.company_name} {p.country ? `(${p.country})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 font-medium">
                  {lead.partners ? lead.partners.company_name : "HQ"}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Owner Type</Label>
              <p className="mt-1 font-medium">
                {partnerId && partnerId !== "__hq__" ? "Partner" : "HQ"}
              </p>
            </div>
          </div>
          {isHQUser && (
            <div>
              <Label className="text-xs text-muted-foreground">Routing Reason</Label>
              <Input
                className="mt-1"
                value={routingReason}
                onChange={(e) => { setRoutingReason(e.target.value); setDirty(true); }}
                placeholder="Why was this lead routed this way?"
              />
            </div>
          )}
          {!isHQUser && lead.routing_reason && (
            <div>
              <Label className="text-xs text-muted-foreground">Routing Reason</Label>
              <p className="mt-1 text-sm">{lead.routing_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Internal Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Internal Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => { setStatus(v); setDirty(true); }}
            >
              <SelectTrigger className="mt-1 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              className="mt-1"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              placeholder="Add notes about this lead…"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || updateLead.isPending}>
          <Save className="h-4 w-4 mr-1" />
          Save Changes
        </Button>
        {isAdmin && (
          <Button variant="destructive" onClick={handleDelete} disabled={deleteLead.isPending}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Lead
          </Button>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

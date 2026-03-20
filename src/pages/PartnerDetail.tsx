import { useParams, Link } from "react-router-dom";
import { partners } from "@/data/mock-data";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, MapPin, Calendar, TrendingUp, Users, DollarSign } from "lucide-react";

const statusVariant = {
  Active: "success" as const,
  Inactive: "ghost" as const,
  Ghosting: "destructive" as const,
  Negotiation: "warning" as const,
};

const healthVariant = {
  Excellent: "success" as const,
  Good: "info" as const,
  "At Risk": "warning" as const,
  Critical: "destructive" as const,
};

export default function PartnerDetail() {
  const { id } = useParams();
  const partner = partners.find((p) => p.id === id);

  if (!partner) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Partner not found</p>
        <Link to="/partners" className="text-primary text-sm mt-2 inline-block hover:underline">
          ← Back to Partners
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-reveal-up">
        <Link
          to="/partners"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Partners
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{partner.company}</h1>
              <Badge variant={statusVariant[partner.status]}>{partner.status}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{partner.country}</span>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Since {partner.startDate}</span>
              <Badge variant="outline" className="font-normal">{partner.level}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={healthVariant[partner.healthScore]} className="text-sm px-3 py-1">
              Health: {partner.engagementScore}/100
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-reveal-up stagger-1">
        <div className="bg-card rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="text-sm font-medium">Revenue</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">€{partner.revenue.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">Pipeline</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">€{partner.pipeline.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Clients</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{partner.clients}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm animate-reveal-up stagger-2">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-foreground">Contacts</h3>
        </div>
        <div className="divide-y">
          {partner.contacts.map((c, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.role}</p>
              </div>
              <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Mail className="h-3.5 w-3.5" />
                {c.email}
              </a>
            </div>
          ))}
        </div>
      </div>

      {partner.healthScore === "Critical" || partner.healthScore === "At Risk" ? (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-5 animate-reveal-up stagger-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            ⚠️ Smart Insight
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {partner.healthScore === "Critical"
              ? `This partner hasn't been active since ${partner.lastActivity}. Consider scheduling a re-engagement call or reviewing the partnership terms.`
              : `Engagement is declining. Last activity was ${partner.lastActivity}. A proactive check-in may prevent churn.`}
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-muted-foreground animate-reveal-up stagger-4">
        <span>Assigned to: <strong className="text-foreground">{partner.manager}</strong></span>
        <span>·</span>
        <span>Last activity: {partner.lastActivity}</span>
      </div>
    </div>
  );
}

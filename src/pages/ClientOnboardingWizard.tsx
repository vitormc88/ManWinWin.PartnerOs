// Sprint E.1 — Single-Flow Client Onboarding Wizard
// One page, 5 steps, autosave to localStorage, no modals.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check, ChevronLeft, ChevronRight, Plus, Trash2, User as UserIcon,
  Save, Loader2, Building2, Users, Boxes, FileText, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePartners } from "@/hooks/usePartners";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types & draft
// ─────────────────────────────────────────────────────────────
type Family = "" | "Business" | "Professional";
const VARIANTS: Record<string, string[]> = {
  Business: ["UseIT", "KeepIT"],
  Professional: ["Professional 1", "Professional 2", "Professional 3"],
};

type ContactForm = {
  contact_name: string; role_function: string; email: string;
  phone: string; mobile: string; is_primary: boolean;
};

type Draft = {
  step: number;
  client: {
    client_code: string; commercial_name: string; short_name: string;
    country: string; sector: string; partner_id: string;
    status: string; industry: string; address: string; vat: string; notes: string;
  };
  contacts: ContactForm[];
  license: {
    family: Family; variant: string;
    deployment_type: string; version: string;
    backoffice_users: number; web_accesses: number;
    module_ids: string[]; plugin_ids: string[];
  };
  contract: {
    contract_value: number; currency: string;
    billing_frequency: string; start_date: string; renewal_date: string;
    notice_period_days: number;
    sat_active: boolean; sat_start_date: string; sat_end_date: string;
    auto_renew: boolean;
  };
};

const emptyContact: ContactForm = {
  contact_name: "", role_function: "", email: "", phone: "", mobile: "", is_primary: true,
};

const initialDraft: Draft = {
  step: 0,
  client: {
    client_code: "", commercial_name: "", short_name: "", country: "", sector: "",
    partner_id: "", status: "Active", industry: "", address: "", vat: "", notes: "",
  },
  contacts: [{ ...emptyContact }],
  license: {
    family: "", variant: "", deployment_type: "SaaS", version: "",
    backoffice_users: 0, web_accesses: 0, module_ids: [], plugin_ids: [],
  },
  contract: {
    contract_value: 0, currency: "EUR", billing_frequency: "Annual",
    start_date: new Date().toISOString().slice(0, 10),
    renewal_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    notice_period_days: 60,
    sat_active: true, sat_start_date: new Date().toISOString().slice(0, 10), sat_end_date: "",
    auto_renew: true,
  },
};

const DRAFT_KEY = "clients:onboardingDraft:v1";

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return initialDraft;
    return { ...initialDraft, ...JSON.parse(raw) } as Draft;
  } catch { return initialDraft; }
}

// ─────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────
const STEPS = [
  { key: "client", label: "Client", icon: Building2 },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "license", label: "Licenses", icon: Boxes },
  { key: "contract", label: "Contract", icon: FileText },
  { key: "review", label: "Review", icon: ListChecks },
] as const;

// ─────────────────────────────────────────────────────────────
// Catalogs
// ─────────────────────────────────────────────────────────────
function useCatalog(table: "modules_catalog" | "plugins_catalog") {
  return useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as any).select("id, code, name, category").eq("is_active", true).order("name");
      if (error) throw error;
      return ((data || []) as unknown) as { id: string; code: string; name: string; category: string | null }[];
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function ClientOnboardingWizard() {
  const navigate = useNavigate();
  const { isHQ, profile } = useAuth();
  const userPartnerId = !isHQ ? (profile?.partner_id ?? null) : null;
  const { data: partners = [] } = usePartners();
  const { data: modules = [] } = useCatalog("modules_catalog");
  const { data: plugins = [] } = useCatalog("plugins_catalog");

  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("saved");
  const [submitting, setSubmitting] = useState(false);

  // Autosave (debounced)
  useEffect(() => {
    setSavingState("saving");
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSavingState("saved");
      } catch { setSavingState("idle"); }
    }, 600);
    return () => clearTimeout(t);
  }, [draft]);

  const step = draft.step;
  const setStep = (n: number) => setDraft(d => ({ ...d, step: Math.max(0, Math.min(4, n)) }));

  // Validation per step
  const canContinue = useMemo(() => {
    const c = draft.client;
    if (step === 0) return !!(c.client_code.trim() && c.commercial_name.trim() && c.country && c.sector && (isHQ || userPartnerId));
    if (step === 1) return draft.contacts.every(ct => ct.contact_name.trim().length > 0);
    if (step === 2) return !!(draft.license.family && draft.license.variant);
    if (step === 3) return !!(draft.contract.start_date && draft.contract.renewal_date && draft.contract.contract_value >= 0);
    return true;
  }, [draft, step, isHQ, userPartnerId]);

  // ── Mutations: finish ─────────────────────────────────────
  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const partnerId = userPartnerId || draft.client.partner_id || null;
      // 1. Client
      const { data: client, error: cErr } = await supabase.from("clients").insert({
        client_code: draft.client.client_code.trim(),
        commercial_name: draft.client.commercial_name.trim(),
        short_name: draft.client.short_name?.trim() || null,
        country: draft.client.country || null,
        sector: draft.client.sector || null,
        partner_id: partnerId,
        partner_uuid: partnerId,
        license_type: draft.license.variant ? `${draft.license.family} ${draft.license.variant}` : null,
        status: draft.client.status || "Active",
        address: draft.client.address || null,
        observations: [draft.client.vat ? `VAT: ${draft.client.vat}` : "", draft.client.notes].filter(Boolean).join("\n") || null,
      } as any).select().single();
      if (cErr) throw cErr;

      // 2. Contacts
      const contactsPayload = draft.contacts
        .filter(ct => ct.contact_name.trim())
        .map(ct => ({
          client_id: client.id,
          contact_name: ct.contact_name.trim(),
          role_function: ct.role_function?.trim() || null,
          email: ct.email?.trim() || null,
          phone: ct.phone?.trim() || null,
          mobile: ct.mobile?.trim() || null,
          is_primary: ct.is_primary,
        }));
      if (contactsPayload.length) {
        // Ensure only one primary
        let primarySet = false;
        contactsPayload.forEach(c => {
          if (c.is_primary && !primarySet) { primarySet = true; }
          else { c.is_primary = false; }
        });
        if (!primarySet) contactsPayload[0].is_primary = true;
        const { error: ctErr } = await supabase.from("client_contacts").insert(contactsPayload as any);
        if (ctErr) throw ctErr;
      }

      // 3. License
      const product = draft.license.variant
        ? `${draft.license.family} ${draft.license.variant}`
        : draft.license.family || null;
      const { data: license, error: lErr } = await supabase.from("licenses").insert({
        client_id: client.id,
        product,
        version: draft.license.version || null,
        deployment_type: draft.license.deployment_type || null,
        backoffice_users: draft.license.backoffice_users || 0,
        web_accesses: draft.license.web_accesses || 0,
        sat_active: draft.contract.sat_active,
        sat_start_date: draft.contract.sat_start_date || null,
        sat_end_date: draft.contract.sat_end_date || null,
        license_start_date: draft.contract.start_date || null,
        license_end_date: draft.contract.renewal_date || null,
        currency: draft.contract.currency,
        billing_frequency: draft.contract.billing_frequency,
        recurring_contract_value: draft.contract.contract_value || 0,
      } as any).select().single();
      if (lErr) throw lErr;

      // 4. Modules + plugins → licensed_modules
      const modulesPayload = [
        ...draft.license.module_ids.map(id => {
          const m = modules.find(x => x.id === id);
          return m ? { license_id: license.id, module_name: m.name, module_id: id, item_type: "module", enabled: true } : null;
        }),
        ...draft.license.plugin_ids.map(id => {
          const p = plugins.find(x => x.id === id);
          return p ? { license_id: license.id, module_name: p.name, plugin_id: id, item_type: "plugin", enabled: true } : null;
        }),
      ].filter(Boolean) as any[];
      if (modulesPayload.length) {
        const { error: mErr } = await supabase.from("licensed_modules").insert(modulesPayload);
        if (mErr) throw mErr;
      }

      // 5. Contract (manual_legacy)
      const { data: contract, error: kErr } = await supabase.from("contracts").insert({
        client_id: client.id,
        contract_start_date: draft.contract.start_date || null,
        contract_end_date: draft.contract.renewal_date || null,
        notice_period_days: draft.contract.notice_period_days || null,
        contract_value: draft.contract.contract_value || 0,
        total_value: draft.contract.contract_value || 0,
        currency: draft.contract.currency,
        billing_notes: null,
        contract_mode: "manual_legacy",
        is_imported: false,
      } as any).select().single();
      if (kErr) throw kErr;

      // 6. Recurring contract line
      if (draft.contract.contract_value > 0) {
        await supabase.from("contract_lines" as any).insert({
          contract_id: contract.id,
          client_id: client.id,
          line_type: "license",
          description: product ? `${product} — annual recurring` : "Annual recurring license",
          related_license_id: license.id,
          amount: draft.contract.contract_value,
          currency: draft.contract.currency,
          billing_frequency: draft.contract.billing_frequency,
          start_date: draft.contract.start_date || null,
          end_date: draft.contract.renewal_date || null,
        } as any);
      }

      // 7. Annual renewal
      await supabase.from("renewals").insert({
        client_id: client.id,
        partner_id: partnerId,
        partner_uuid: partnerId,
        contract_id: contract.id,
        license_id: license.id,
        renewal_type: "Contract",
        renewal_date: draft.contract.renewal_date,
        status: "Scheduled",
        estimated_value: draft.contract.contract_value || 0,
        billing_frequency: draft.contract.billing_frequency,
        notice_period_days: draft.contract.notice_period_days || null,
        target_type: "contract",
        target_id: contract.id,
      } as any);

      // Done
      localStorage.removeItem(DRAFT_KEY);
      toast.success("Client onboarded successfully");
      navigate(`/clients/${client.id}`);
    } catch (e: any) {
      console.error("Onboarding failed:", e);
      toast.error(e?.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers for nested updates
  const updClient = (p: Partial<Draft["client"]>) => setDraft(d => ({ ...d, client: { ...d.client, ...p } }));
  const updLicense = (p: Partial<Draft["license"]>) => setDraft(d => ({ ...d, license: { ...d.license, ...p } }));
  const updContract = (p: Partial<Draft["contract"]>) => setDraft(d => ({ ...d, contract: { ...d.contract, ...p } }));
  const updContact = (i: number, p: Partial<ContactForm>) =>
    setDraft(d => ({ ...d, contacts: d.contacts.map((c, idx) => idx === i ? { ...c, ...p } : c) }));
  const addContact = () =>
    setDraft(d => ({ ...d, contacts: [...d.contacts, { ...emptyContact, is_primary: false }] }));
  const removeContact = (i: number) =>
    setDraft(d => ({ ...d, contacts: d.contacts.filter((_, idx) => idx !== i) || [emptyContact] }));

  const toggleId = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

  const resetDraft = () => {
    if (!confirm("Discard the current draft and start over?")) return;
    localStorage.removeItem(DRAFT_KEY);
    setDraft(initialDraft);
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1100px] mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sticky top-0 z-20 bg-background/95 backdrop-blur py-4 -mx-4 px-4 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onboard Client</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create the full record in one continuous flow.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {savingState === "saving" ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
          ) : (
            <span className="inline-flex items-center gap-1"><Save className="h-3 w-3" /> Saved</span>
          )}
          <Button variant="ghost" size="sm" onClick={resetDraft}>Discard draft</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/clients")}>Exit</Button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between gap-2 mb-8">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              className={cn(
                "flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors text-left",
                active && "border-primary bg-primary/5",
                done && "border-emerald-300 bg-emerald-50/60 cursor-pointer hover:bg-emerald-50",
                !active && !done && "border-border/60 bg-muted/20 text-muted-foreground",
              )}
            >
              <span className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium",
                done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="text-sm font-medium truncate">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6 space-y-5">
          {/* ─── Step 0: Client ─── */}
          {step === 0 && (
            <div className="space-y-5 animate-reveal-up">
              <div>
                <h2 className="text-base font-semibold">Client identity</h2>
                <p className="text-xs text-muted-foreground">Only the essentials. Advanced fields can be set later.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Client Code *</Label><Input value={draft.client.client_code} onChange={e => updClient({ client_code: e.target.value })} placeholder="e.g. CL-001" /></div>
                <div><Label>Commercial Name *</Label><Input value={draft.client.commercial_name} onChange={e => updClient({ commercial_name: e.target.value })} /></div>
                <div><Label>Short Name</Label><Input value={draft.client.short_name} onChange={e => updClient({ short_name: e.target.value })} /></div>
                <div><Label>Country *</Label><CountryCombobox value={draft.client.country} onChange={v => updClient({ country: v })} /></div>
                <div><Label>Sector *</Label><SectorSelect value={draft.client.sector} onChange={v => updClient({ sector: v })} /></div>
                {isHQ ? (
                  <div>
                    <Label>Linked Partner</Label>
                    <Select value={draft.client.partner_id || "none"} onValueChange={v => updClient({ partner_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="HQ Direct" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">HQ Direct</SelectItem>
                        {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Linked Partner</Label>
                    <Input value={partners.find(p => p.id === userPartnerId)?.company_name || "Your Partner"} disabled />
                  </div>
                )}
                <div><Label>Status</Label>
                  <Select value={draft.client.status} onValueChange={v => updClient({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>VAT</Label><Input value={draft.client.vat} onChange={e => updClient({ vat: e.target.value })} /></div>
                <div className="col-span-2"><Label>Address</Label><Input value={draft.client.address} onChange={e => updClient({ address: e.target.value })} /></div>
                <div className="col-span-2"><Label>Internal Notes</Label><Textarea rows={2} value={draft.client.notes} onChange={e => updClient({ notes: e.target.value })} /></div>
              </div>
            </div>
          )}

          {/* ─── Step 1: Contacts ─── */}
          {step === 1 && (
            <div className="space-y-4 animate-reveal-up">
              <div>
                <h2 className="text-base font-semibold">Contacts</h2>
                <p className="text-xs text-muted-foreground">Add the people you'll be working with at the customer side.</p>
              </div>
              <div className="space-y-3">
                {draft.contacts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-4 bg-muted/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        Contact {i + 1}
                        {c.is_primary && <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">Primary</Badge>}
                      </div>
                      {draft.contacts.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeContact(i)} className="text-destructive h-7">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Name *</Label><Input value={c.contact_name} onChange={e => updContact(i, { contact_name: e.target.value })} /></div>
                      <div><Label className="text-xs">Role / Function</Label><Input value={c.role_function} onChange={e => updContact(i, { role_function: e.target.value })} placeholder="e.g. IT Manager" /></div>
                      <div><Label className="text-xs">Email</Label><Input type="email" value={c.email} onChange={e => updContact(i, { email: e.target.value })} /></div>
                      <div><Label className="text-xs">Phone</Label><Input value={c.phone} onChange={e => updContact(i, { phone: e.target.value })} /></div>
                      <div><Label className="text-xs">Mobile</Label><Input value={c.mobile} onChange={e => updContact(i, { mobile: e.target.value })} /></div>
                      <div className="flex items-end gap-2">
                        <Switch checked={c.is_primary} onCheckedChange={v => {
                          // Only one primary
                          setDraft(d => ({
                            ...d,
                            contacts: d.contacts.map((cc, idx) => ({ ...cc, is_primary: idx === i ? v : (v ? false : cc.is_primary) })),
                          }));
                        }} />
                        <Label className="text-xs">Primary contact</Label>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addContact}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add another contact
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2: License ─── */}
          {step === 2 && (
            <div className="space-y-5 animate-reveal-up">
              <div>
                <h2 className="text-base font-semibold">License configuration</h2>
                <p className="text-xs text-muted-foreground">Define the product the client is using.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>License Family *</Label>
                  <Select value={draft.license.family || ""} onValueChange={v => updLicense({ family: v as Family, variant: "" })}>
                    <SelectTrigger><SelectValue placeholder="Select family" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Business">Business</SelectItem>
                      <SelectItem value="Professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Variant *</Label>
                  <Select value={draft.license.variant || ""} onValueChange={v => updLicense({ variant: v })} disabled={!draft.license.family}>
                    <SelectTrigger><SelectValue placeholder={draft.license.family ? "Select variant" : "Pick a family first"} /></SelectTrigger>
                    <SelectContent>
                      {(VARIANTS[draft.license.family] || []).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Deployment</Label>
                  <Select value={draft.license.deployment_type} onValueChange={v => updLicense({ deployment_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SaaS">SaaS</SelectItem>
                      <SelectItem value="On-Premise">On-Premise</SelectItem>
                      <SelectItem value="Hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Version</Label><Input value={draft.license.version} onChange={e => updLicense({ version: e.target.value })} placeholder="e.g. 7.5" /></div>
                <div><Label>Business Objects (Backoffice users)</Label><Input type="number" min={0} value={draft.license.backoffice_users} onChange={e => updLicense({ backoffice_users: Number(e.target.value) })} /></div>
                <div><Label>Web Users</Label><Input type="number" min={0} value={draft.license.web_accesses} onChange={e => updLicense({ web_accesses: Number(e.target.value) })} /></div>
              </div>

              <div>
                <Label className="text-sm font-medium">Modules</Label>
                <p className="text-xs text-muted-foreground mb-2">{draft.license.module_ids.length} selected</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-auto rounded-md border border-border/60 p-2 bg-muted/10">
                  {modules.length === 0 && <span className="text-xs text-muted-foreground">No modules in catalog.</span>}
                  {modules.map(m => {
                    const on = draft.license.module_ids.includes(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => updLicense({ module_ids: toggleId(draft.license.module_ids, m.id) })}
                        className={cn("text-xs text-left rounded px-2 py-1.5 border transition-colors",
                          on ? "border-primary bg-primary/10 text-foreground" : "border-border/60 bg-background hover:bg-muted/40")}>
                        {on && <Check className="inline h-3 w-3 mr-1 text-primary" />}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Plugins</Label>
                <p className="text-xs text-muted-foreground mb-2">{draft.license.plugin_ids.length} selected</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-auto rounded-md border border-border/60 p-2 bg-muted/10">
                  {plugins.length === 0 && <span className="text-xs text-muted-foreground">No plugins in catalog.</span>}
                  {plugins.map(p => {
                    const on = draft.license.plugin_ids.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => updLicense({ plugin_ids: toggleId(draft.license.plugin_ids, p.id) })}
                        className={cn("text-xs text-left rounded px-2 py-1.5 border transition-colors",
                          on ? "border-primary bg-primary/10 text-foreground" : "border-border/60 bg-background hover:bg-muted/40")}>
                        {on && <Check className="inline h-3 w-3 mr-1 text-primary" />}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Contract ─── */}
          {step === 3 && (
            <div className="space-y-5 animate-reveal-up">
              <div>
                <h2 className="text-base font-semibold">Contract & renewal</h2>
                <p className="text-xs text-muted-foreground">A single annual recurring agreement. Lines can be refined later.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Annual Contract Value</Label><Input type="number" min={0} step="0.01" value={draft.contract.contract_value} onChange={e => updContract({ contract_value: Number(e.target.value) })} /></div>
                <div>
                  <Label>Currency</Label>
                  <Select value={draft.contract.currency} onValueChange={v => updContract({ currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="BRL">BRL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Billing Frequency</Label>
                  <Select value={draft.contract.billing_frequency} onValueChange={v => updContract({ billing_frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Annual">Annual</SelectItem>
                      <SelectItem value="Semi-Annual">Semi-Annual</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notice Days</Label><Input type="number" min={0} value={draft.contract.notice_period_days} onChange={e => updContract({ notice_period_days: Number(e.target.value) })} /></div>
                <div><Label>Start Date *</Label><Input type="date" value={draft.contract.start_date} onChange={e => updContract({ start_date: e.target.value })} /></div>
                <div><Label>Renewal Date *</Label><Input type="date" value={draft.contract.renewal_date} onChange={e => updContract({ renewal_date: e.target.value })} /></div>
              </div>

              <div className="rounded-lg border border-border/60 p-4 bg-muted/10 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.contract.sat_active} onCheckedChange={v => updContract({ sat_active: v })} />
                  <Label className="text-sm">S&AT active</Label>
                </div>
                {draft.contract.sat_active && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">S&AT Start</Label><Input type="date" value={draft.contract.sat_start_date} onChange={e => updContract({ sat_start_date: e.target.value })} /></div>
                    <div><Label className="text-xs">S&AT End (optional)</Label><Input type="date" value={draft.contract.sat_end_date} onChange={e => updContract({ sat_end_date: e.target.value })} placeholder="Ongoing" /></div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={draft.contract.auto_renew} onCheckedChange={v => updContract({ auto_renew: v })} />
                  <Label className="text-sm">Auto-renew yearly</Label>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 4: Review ─── */}
          {step === 4 && (
            <div className="space-y-4 animate-reveal-up">
              <div>
                <h2 className="text-base font-semibold">Review & finish</h2>
                <p className="text-xs text-muted-foreground">Click any section to jump back and edit.</p>
              </div>

              {([
                { i: 0, title: "Client", lines: [
                  `${draft.client.client_code} — ${draft.client.commercial_name}`,
                  `${draft.client.country || "—"} • ${draft.client.sector || "—"}`,
                  isHQ ? (draft.client.partner_id ? partners.find(p => p.id === draft.client.partner_id)?.company_name : "HQ Direct") : (partners.find(p => p.id === userPartnerId)?.company_name || "Your Partner"),
                ]},
                { i: 1, title: `${draft.contacts.filter(c => c.contact_name.trim()).length} Contact${draft.contacts.length === 1 ? "" : "s"}`, lines:
                  draft.contacts.filter(c => c.contact_name.trim()).map(c => `${c.contact_name}${c.is_primary ? " (Primary)" : ""}${c.role_function ? ` — ${c.role_function}` : ""}`)
                },
                { i: 2, title: "License", lines: [
                  draft.license.variant ? `${draft.license.family} / ${draft.license.variant}` : "—",
                  `${draft.license.backoffice_users} BO • ${draft.license.web_accesses} WEB`,
                  `${draft.license.module_ids.length} Modules • ${draft.license.plugin_ids.length} Plugins`,
                  `Deployment: ${draft.license.deployment_type}${draft.license.version ? ` • v${draft.license.version}` : ""}`,
                ]},
                { i: 3, title: "Contract", lines: [
                  `${draft.contract.currency} ${draft.contract.contract_value.toLocaleString()} / year`,
                  `${draft.contract.start_date} → ${draft.contract.renewal_date}`,
                  `Billing: ${draft.contract.billing_frequency} • Notice: ${draft.contract.notice_period_days} days`,
                  draft.contract.sat_active ? `S&AT active${draft.contract.sat_end_date ? ` until ${draft.contract.sat_end_date}` : " (ongoing)"}` : "S&AT inactive",
                  draft.contract.auto_renew ? "Auto-renew yearly" : "Manual renewal",
                ]},
              ] as const).map(section => (
                <button key={section.i} type="button" onClick={() => setStep(section.i)}
                  className="w-full text-left rounded-lg border border-border/60 p-4 hover:border-primary hover:bg-primary/5 transition-colors">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                    <Check className="h-4 w-4 text-emerald-500" /> {section.title}
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5 ml-6">
                    {section.lines.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </button>
              ))}

              <Button size="lg" className="w-full mt-2" onClick={handleFinish} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating client…</> : "Finish Import"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer nav */}
      {step < 4 && (
        <div className="flex items-center justify-between mt-5">
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep(step + 1)} disabled={!canContinue}>
            Continue <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

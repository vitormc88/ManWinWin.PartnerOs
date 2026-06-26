import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Building2, FileText, KeyRound, Star, Pencil, Save, X, Plus, Trash2, Users, CalendarDays, Shield, Clock, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountryCombobox } from "@/components/clients/CountryCombobox";
import { SectorSelect } from "@/components/clients/SectorSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useClient, useUpdateClient, useArchiveClient,
  useClientContacts, useCreateContact, useDeleteContact,
  useClientLicenses, useCreateLicense, useUpdateLicense, useDeleteLicense,
  useClientContracts, useCreateContract, useUpdateContract,
  useCreateNote, useCreateCredential,
} from "@/hooks/useClients";
import { ContractBreakdown } from "@/components/clients/ContractBreakdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { differenceInDays, parseISO } from "date-fns";
import { loadClientsListState } from "@/lib/clients-list-state";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/* ─── helpers ─── */
function FieldRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text", placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm" disabled={disabled} />
    </div>
  );
}

/* ─── renewal status logic ─── */
function getRenewalInfo(endDate: string | null) {
  if (!endDate) return { status: "unknown", label: "No Date", days: null, color: "bg-muted text-muted-foreground" };
  const days = differenceInDays(parseISO(endDate), new Date());
  if (days < 0) return { status: "expired", label: "Expired", days, color: "bg-destructive/10 text-destructive border-destructive/20" };
  if (days <= 30) return { status: "due_soon", label: "Due Soon", days, color: "bg-orange-50 text-orange-700 border-orange-200" };
  if (days <= 90) return { status: "upcoming", label: "Upcoming", days, color: "bg-blue-50 text-blue-700 border-blue-200" };
  return { status: "normal", label: "Normal", days, color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

const RenewalIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "expired": return <XCircle className="h-4 w-4 text-destructive" />;
    case "due_soon": return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    case "upcoming": return <Clock className="h-4 w-4 text-blue-600" />;
    case "normal": return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
  }
};

/* ─── License two-level model ─── */
type LicenseFamily = "Business" | "Professional";

const VARIANT_OPTIONS: Record<LicenseFamily, { value: string; label: string }[]> = {
  Business: [
    { value: "Business UseIT", label: "UseIT" },
    { value: "Business KeepIT", label: "KeepIT" },
  ],
  Professional: [
    { value: "Professional 1", label: "Professional 1" },
    { value: "Professional 2", label: "Professional 2" },
    { value: "Professional 3", label: "Professional 3" },
  ],
};

function parseLicenseProduct(product: string | null | undefined): { family: LicenseFamily | ""; variant: string } {
  if (!product) return { family: "", variant: "" };
  if (product.startsWith("Business")) return { family: "Business", variant: product };
  if (product.startsWith("Professional")) return { family: "Professional", variant: product };
  return { family: "", variant: product };
}

function getVariantLabel(variant: string): string {
  if (variant === "Business UseIT") return "UseIT";
  if (variant === "Business KeepIT") return "KeepIT";
  return variant;
}

function isValidLicenseProduct(product: string | null | undefined): boolean {
  if (!product) return false;
  const validValues = ["Business UseIT", "Business KeepIT", "Professional 1", "Professional 2", "Professional 3"];
  return validValues.includes(product);
}

const PROFESSIONAL_MODULES: Record<string, string[]> = {
  "Professional 1": ["Maintenance Module"],
  "Professional 2": ["Maintenance Module", "Stock Management", "Purchase Orders"],
  "Professional 3": ["Maintenance Module", "Stock Management", "Purchase Orders", "Workflow", "SLA", "Advanced Reports", "Import Tool", "API"],
};

const CORE_MODULES = ["Maintenance Module", "Maintenance Requests", "Stock Management", "Purchase Orders"];
const PLUGIN_MODULES = ["SLA", "Workflow", "Advanced Reports", "Import Tool", "API"];
const ALL_MODULES = [...CORE_MODULES, ...PLUGIN_MODULES];

function getLicenseDefaults(variant: string) {
  const isPro = variant.startsWith("Professional");
  const isUseIT = variant === "Business UseIT";
  return {
    backoffice_users: isPro ? 1 : 3,
    web_accesses: 1,
    sat_active: isUseIT,
    api_access: variant === "Professional 3",
    database_type: isPro ? "SaaS" : "On-Premise",
  };
}

/* ─── main component ─── */
export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useClient(id);
  const { data: contacts = [] } = useClientContacts(id);
  const { data: licenses = [] } = useClientLicenses(id);
  const { data: contracts = [] } = useClientContracts(id);
  const updateClient = useUpdateClient();
  const archiveClient = useArchiveClient();
  const createContact = useCreateContact();
  const deleteContact = useDeleteContact();
  const createLicense = useCreateLicense();
  const updateLicense = useUpdateLicense();
  const deleteLicense = useDeleteLicense();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const createNote = useCreateNote();
  const createCredential = useCreateCredential();

  const { data: notes = [] } = useQuery({
    queryKey: ["client_notes", id],
    queryFn: async () => { if (!id) return []; const { data, error } = await supabase.from("client_notes").select("*").eq("client_id", id).order("created_at", { ascending: false }); if (error) throw error; return data; },
    enabled: !!id,
  });
  const { data: credentials = [] } = useQuery({
    queryKey: ["client_credentials", id],
    queryFn: async () => { if (!id) return []; const { data, error } = await supabase.from("client_credentials").select("*").eq("client_id", id); if (error) throw error; return data; },
    enabled: !!id,
  });

  // Filter out invalid/broken licenses
  const validLicenses = useMemo(() => licenses.filter(l => isValidLicenseProduct(l.product)), [licenses]);

  const { data: modules = [] } = useQuery({
    queryKey: ["licensed_modules", id, validLicenses],
    queryFn: async () => { if (!validLicenses.length) return []; const ids = validLicenses.map(l => l.id); const { data, error } = await supabase.from("licensed_modules").select("*").in("license_id", ids); if (error) throw error; return data; },
    enabled: validLicenses.length > 0,
  });

  // Derived data
  const primaryLicense = validLicenses[0] || null;
  const primaryContract = contracts[0] || null;
  const renewalEndDate = primaryContract?.contract_end_date || primaryLicense?.license_end_date || null;
  const renewalInfo = useMemo(() => getRenewalInfo(renewalEndDate), [renewalEndDate]);

  // Parsed license info
  const licenseProduct = primaryLicense?.product || "";
  const { family: licenseFamily, variant: licenseVariant } = useMemo(() => parseLicenseProduct(licenseProduct), [licenseProduct]);
  const isProfessional = licenseFamily === "Professional";
  const isBusiness = licenseFamily === "Business";
  const hasValidLicense = !!primaryLicense && isValidLicenseProduct(primaryLicense.product);

  // Edit states
  const [editingClient, setEditingClient] = useState(false);
  const [clientForm, setClientForm] = useState<Record<string, any>>({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ contact_name: "", role_function: "", phone: "", mobile: "", email: "", notes: "" });
  const [showAddLicense, setShowAddLicense] = useState(false);
  const [licenseForm, setLicenseForm] = useState<Record<string, any>>({});
  const [editingLicenseId, setEditingLicenseId] = useState<string | null>(null);
  const [licEditForm, setLicEditForm] = useState<Record<string, any>>({});
  const [showAddContract, setShowAddContract] = useState(false);
  const [contractFormData, setContractFormData] = useState<Record<string, any>>({});
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [conEditForm, setConEditForm] = useState<Record<string, any>>({});
  const [newNote, setNewNote] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [showAddCred, setShowAddCred] = useState(false);
  const [credForm, setCredForm] = useState({ system_url: "", username: "", login: "", password_secret: "", environment_type: "Production", admin_notes: "" });

  // Module editing state
  const [editingModules, setEditingModules] = useState(false);
  const [moduleEdits, setModuleEdits] = useState<Record<string, boolean>>({});

  // ─── Workspace navigation (prev/next, tab persistence, prefetch, unsaved guard) ───
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = useCallback(
    (tab: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const listState = useMemo(() => loadClientsListState(), []);
  const orderedIds = listState?.orderedIds ?? [];
  const filterChips = listState?.filterChips ?? [];
  const currentIndex = id ? orderedIds.indexOf(id) : -1;
  const prevId = currentIndex > 0 ? orderedIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < orderedIds.length - 1 ? orderedIds[currentIndex + 1] : null;

  // Unsaved-changes detection across editors
  const isDirty =
    editingClient ||
    editingLicenseId !== null ||
    editingContractId !== null ||
    editingModules ||
    showAddContact ||
    showAddLicense ||
    showAddContract ||
    showAddCred ||
    newNote.trim().length > 0;

  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  const [pendingBack, setPendingBack] = useState(false);

  const goToClient = useCallback(
    (targetId: string) => {
      const tab = searchParams.get("tab");
      navigate(`/clients/${targetId}${tab ? `?tab=${tab}` : ""}`);
    },
    [navigate, searchParams],
  );

  const requestNavigate = useCallback(
    (targetId: string) => {
      if (isDirty) {
        setPendingNavId(targetId);
      } else {
        goToClient(targetId);
      }
    },
    [isDirty, goToClient],
  );

  const requestBack = useCallback(() => {
    if (isDirty) setPendingBack(true);
    else navigate("/clients");
  }, [isDirty, navigate]);

  // Prefetch neighbor clients for instant navigation
  useEffect(() => {
    const prefetch = (cid: string | null) => {
      if (!cid) return;
      queryClient.prefetchQuery({
        queryKey: ["client", cid],
        queryFn: async () => {
          const { data, error } = await supabase.from("clients").select("*").eq("id", cid).single();
          if (error) throw error;
          return data;
        },
      });
    };
    prefetch(prevId);
    prefetch(nextId);
  }, [prevId, nextId, queryClient]);

  // Keyboard navigation (arrows when not focused in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        requestNavigate(prevId);
      } else if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        requestNavigate(nextId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prevId, nextId, requestNavigate]);

  // Warn on browser unload while editing
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  if (isLoading) return <div className="max-w-4xl mx-auto py-20 text-center text-muted-foreground">Loading...</div>;
  if (!client) return (
    <div className="max-w-4xl mx-auto py-20 text-center">
      <p className="text-muted-foreground">Client not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/clients")}>Back to Clients</Button>
    </div>
  );

  /* ─── handlers ─── */
  const startEditClient = () => {
    setClientForm({
      commercial_name: client.commercial_name, short_name: client.short_name || "", client_code: client.client_code,
      phone: client.phone || "", email: client.email || "", website: client.website || "",
      address: client.address || "", city: client.city || "", country: client.country || "",
      sector: client.sector || "", status: client.status, is_premium: client.is_premium,
      cloud_onpremise: client.cloud_onpremise || "On-Premise",
      has_custom_reports: client.has_custom_reports, manager_owner: client.manager_owner || "",
      account_manager: client.account_manager || "",
    });
    setEditingClient(true);
  };
  const saveClient = async () => {
    try { await updateClient.mutateAsync({ id: client.id, ...clientForm }); toast.success("Client updated"); setEditingClient(false); }
    catch (e: any) { toast.error(e?.message || "Failed to update"); }
  };

  const handleAddContact = async () => {
    if (!contactForm.contact_name) { toast.error("Contact name required"); return; }
    try { await createContact.mutateAsync({ ...contactForm, client_id: client.id }); toast.success("Contact added"); setShowAddContact(false); setContactForm({ contact_name: "", role_function: "", phone: "", mobile: "", email: "", notes: "" }); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  // License family/variant helpers for forms
  const handleFamilyChange = (family: LicenseFamily, formSetter: (fn: (f: Record<string, any>) => Record<string, any>) => void) => {
    const firstVariant = VARIANT_OPTIONS[family][0].value;
    const defaults = getLicenseDefaults(firstVariant);
    formSetter(f => ({
      ...f,
      _family: family,
      product: firstVariant,
      license_model: family,
      database_type: defaults.database_type,
      backoffice_users: defaults.backoffice_users,
      web_accesses: defaults.web_accesses,
      sat_active: defaults.sat_active,
      api_access: defaults.api_access,
    }));
  };

  const handleVariantChange = (variant: string, formSetter: (fn: (f: Record<string, any>) => Record<string, any>) => void) => {
    const defaults = getLicenseDefaults(variant);
    const family = variant.startsWith("Professional") ? "Professional" : "Business";
    formSetter(f => ({
      ...f,
      product: variant,
      license_model: family,
      database_type: defaults.database_type,
      backoffice_users: defaults.backoffice_users,
      web_accesses: defaults.web_accesses,
      sat_active: defaults.sat_active,
      api_access: defaults.api_access,
    }));
  };

  const handleAddLicense = async () => {
    if (!licenseForm.product || !isValidLicenseProduct(licenseForm.product)) {
      toast.error("Please select a valid License Family and Variant");
      return;
    }
    try {
      await createLicense.mutateAsync({
        client_id: client.id,
        product: licenseForm.product,
        version: licenseForm.version || null,
        license_model: licenseForm.license_model || null,
        database_type: licenseForm.database_type || null,
        periodicity: licenseForm.periodicity || null,
        license_start_date: licenseForm.license_start_date || null,
        license_end_date: licenseForm.license_end_date || null,
        backoffice_users: licenseForm.backoffice_users ?? 0,
        web_accesses: licenseForm.web_accesses ?? 0,
        sat_active: licenseForm.sat_active ?? false,
        api_access: licenseForm.api_access ?? false,
      });
      await updateClient.mutateAsync({ id: client.id, license_type: licenseForm.product, cloud_onpremise: licenseForm.database_type });
      toast.success("License created");
      setShowAddLicense(false);
      setLicenseForm({});
    } catch (e: any) { toast.error(e?.message || "Failed to create license"); }
  };

  const openAddLicenseWithDefaults = () => {
    const family: LicenseFamily = "Business";
    const variant = "Business UseIT";
    const defaults = getLicenseDefaults(variant);
    setLicenseForm({
      _family: family,
      product: variant,
      version: "8.0",
      license_model: family,
      periodicity: "Annual",
      database_type: defaults.database_type,
      backoffice_users: defaults.backoffice_users,
      web_accesses: defaults.web_accesses,
      sat_active: defaults.sat_active,
      api_access: defaults.api_access,
      license_start_date: "",
      license_end_date: "",
    });
    setShowAddLicense(true);
  };

  const startEditLicense = (lic: any) => {
    const { family } = parseLicenseProduct(lic.product);
    setLicEditForm({
      _family: family,
      product: lic.product || "",
      version: lic.version || "",
      database_type: lic.database_type || "",
      license_model: lic.license_model || "",
      periodicity: lic.periodicity || "",
      license_start_date: lic.license_start_date || "",
      license_end_date: lic.license_end_date || "",
      sat_active: lic.sat_active,
      sat_end_date: lic.sat_end_date || "",
      backoffice_users: lic.backoffice_users ?? 0,
      web_accesses: lic.web_accesses ?? 0,
      api_access: lic.api_access,
    });
    setEditingLicenseId(lic.id);
  };

  const saveLicense = async () => {
    if (!editingLicenseId) return;
    if (!licEditForm.product || !isValidLicenseProduct(licEditForm.product)) {
      toast.error("Please select a valid License Family and Variant");
      return;
    }
    try {
      const { _family, sat_end_date, ...rest } = licEditForm;
      await updateLicense.mutateAsync({
        id: editingLicenseId,
        ...rest,
        sat_end_date: sat_end_date || null,
      });
      if (licEditForm.product) {
        await updateClient.mutateAsync({ id: client.id, license_type: licEditForm.product, cloud_onpremise: licEditForm.database_type || client.cloud_onpremise });
      }
      toast.success("License updated");
      setEditingLicenseId(null);
    } catch (e: any) { toast.error(e?.message || "Failed to update license"); }
  };

  const handleDeleteLicense = async (licenseId: string) => {
    try {
      await deleteLicense.mutateAsync({ id: licenseId, clientId: client.id });
      // If no more valid licenses, clear client-level license_type
      const remaining = validLicenses.filter(l => l.id !== licenseId);
      if (remaining.length === 0) {
        await updateClient.mutateAsync({ id: client.id, license_type: null, cloud_onpremise: null });
      }
      toast.success("License configuration deleted");
      setEditingLicenseId(null);
    } catch (e: any) { toast.error(e?.message || "Failed to delete license"); }
  };

  // Module save logic
  const startEditModules = () => {
    const current: Record<string, boolean> = {};
    ALL_MODULES.forEach(mod => {
      const isActiveInDB = modules.some(m => m.module_name === mod && m.enabled);
      const isPreset = isProfessional && (PROFESSIONAL_MODULES[licenseVariant] || []).includes(mod);
      current[mod] = isActiveInDB || isPreset;
    });
    setModuleEdits(current);
    setEditingModules(true);
  };

  const saveModules = async () => {
    if (!primaryLicense) return;
    try {
      for (const mod of ALL_MODULES) {
        const existing = modules.find(m => m.module_name === mod && m.license_id === primaryLicense.id);
        const enabled = moduleEdits[mod] ?? false;
        if (existing) {
          await supabase.from("licensed_modules").update({ enabled }).eq("id", existing.id);
        } else {
          await supabase.from("licensed_modules").insert({ license_id: primaryLicense.id, module_name: mod, enabled });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["licensed_modules"] });
      toast.success("Modules updated");
      setEditingModules(false);
    } catch (e: any) { toast.error(e?.message || "Failed to save modules"); }
  };

  const handleAddContract = async () => {
    try { await createContract.mutateAsync({ ...contractFormData, client_id: client.id }); toast.success("Contract created"); setShowAddContract(false); setContractFormData({}); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const startEditContract = (co: any) => {
    setConEditForm({ contract_start_date: co.contract_start_date || "", contract_end_date: co.contract_end_date || "", notice_period_days: co.notice_period_days ?? 30, contract_value: co.contract_value ?? 0, invoiced_value: co.invoiced_value ?? 0, hosting_value: co.hosting_value ?? 0, sat_value: co.sat_value ?? 0, mww_web_value: co.mww_web_value ?? 0, total_value: co.total_value ?? 0, num_installments: co.num_installments ?? 1, renewal_increase_pct: co.renewal_increase_pct ?? 0, currency: co.currency || "EUR", price_table_reference: co.price_table_reference || "", billing_notes: co.billing_notes || "", observations: co.observations || "" });
    setEditingContractId(co.id);
  };
  const saveContract = async () => {
    if (!editingContractId) return;
    try { await updateContract.mutateAsync({ id: editingContractId, ...conEditForm }); toast.success("Contract updated"); setEditingContractId(null); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) { toast.error("Note content required"); return; }
    try { await createNote.mutateAsync({ client_id: client.id, content: newNote, note_type: newNoteType }); toast.success("Note added"); setNewNote(""); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handleAddCred = async () => {
    try { await createCredential.mutateAsync({ ...credForm, client_id: client.id }); toast.success("Credential saved"); setShowAddCred(false); setCredForm({ system_url: "", username: "", login: "", password_secret: "", environment_type: "Production", admin_notes: "" }); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handleArchive = async () => {
    try { await archiveClient.mutateAsync(client.id); toast.success("Client archived"); navigate("/clients"); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  // Module helpers for licensing tab
  const activeModuleNames = modules.filter(m => m.enabled).map(m => m.module_name);
  const presetModules = isProfessional ? (PROFESSIONAL_MODULES[licenseVariant] || []) : [];
  const deploymentDisplay = primaryLicense?.database_type || client.cloud_onpremise || (isProfessional ? "SaaS" : "—");

  // License Family/Variant form rendering helper
  const renderLicenseFamilyVariantFields = (form: Record<string, any>, setter: (fn: (f: Record<string, any>) => Record<string, any>) => void) => {
    const currentFamily = (form._family || "") as LicenseFamily | "";
    return (
      <>
        <div>
          <Label className="text-xs">License Family *</Label>
          <Select value={currentFamily} onValueChange={(v) => handleFamilyChange(v as LicenseFamily, setter)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select family..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Business">Business</SelectItem>
              <SelectItem value="Professional">Professional</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">License Variant *</Label>
          <Select
            value={form.product || ""}
            onValueChange={(v) => handleVariantChange(v, setter)}
            disabled={!currentFamily}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select variant..." /></SelectTrigger>
            <SelectContent>
              {currentFamily && VARIANT_OPTIONS[currentFamily as LicenseFamily]?.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </>
    );
  };

  // Module rendering helper with Modules/Plugins separation
  const renderModuleSection = (title: string, moduleList: string[]) => {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">{title}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {moduleList.map(mod => {
            const isPreset = isProfessional && presetModules.includes(mod);
            const isOptionalAddon = mod === "Maintenance Requests";

            if (editingModules) {
              const checked = moduleEdits[mod] ?? false;
              const isLocked = isProfessional && isPreset && !isOptionalAddon;
              return (
                <div key={mod} className={`flex items-center gap-3 rounded-lg border p-3 ${checked ? "border-primary/30 bg-primary/5" : "border-border/60"}`}>
                  <Checkbox
                    checked={isLocked ? true : checked}
                    disabled={isLocked}
                    onCheckedChange={(v) => setModuleEdits(prev => ({ ...prev, [mod]: !!v }))}
                    className="data-[state=checked]:bg-primary"
                  />
                  <div>
                    <span className="text-sm font-medium">{mod}</span>
                    {isLocked && <p className="text-[10px] text-muted-foreground">Included in {licenseVariant}</p>}
                    {isOptionalAddon && <p className="text-[10px] text-muted-foreground">Optional add-on</p>}
                  </div>
                </div>
              );
            }

            const isActive = activeModuleNames.includes(mod) || isPreset;
            return (
              <div key={mod} className={`flex items-center gap-3 rounded-lg border p-3 ${isActive ? "border-primary/30 bg-primary/5" : "border-border/60"}`}>
                <Checkbox checked={isActive} disabled className="data-[state=checked]:bg-primary" />
                <div>
                  <span className="text-sm font-medium">{mod}</span>
                  {isPreset && <p className="text-[10px] text-muted-foreground">Included in {licenseVariant}</p>}
                  {isOptionalAddon && <p className="text-[10px] text-muted-foreground">Optional add-on</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Workspace navigation header */}
      <div className="animate-reveal-up space-y-3 pb-4 border-b border-border/40">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                onClick={(e) => { e.preventDefault(); requestBack(); }}
                href="/clients"
                className="cursor-pointer"
              >
                Clients
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">{client.commercial_name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Prev / Title / Next */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => prevId && requestNavigate(prevId)}
              disabled={!prevId}
              aria-label="Previous client (←)"
              title="Previous client (←)"
              className="shrink-0"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <div className="min-w-0 flex-1 px-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight truncate">{client.commercial_name}</h1>
                {client.is_premium && <Badge variant="outline" className="border-amber-300 text-amber-600 bg-amber-50 gap-1"><Star className="h-3 w-3" /> Premium</Badge>}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mt-0.5 flex-wrap">
                <span className="font-mono">{client.client_code}</span>
                <span className="opacity-50">·</span>
                <span>{client.country || "—"}</span>
                {client.sector && <><span className="opacity-50">·</span><span>{client.sector}</span></>}
                {(client as any)?.partner?.name && <><span className="opacity-50">·</span><span>{(client as any).partner.name}</span></>}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => nextId && requestNavigate(nextId)}
              disabled={!nextId}
              aria-label="Next client (→)"
              title="Next client (→)"
              className="shrink-0"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={client.status === "Active" ? "default" : "secondary"}>{client.status}</Badge>
            {licenses && licenses.length === 0 && client.status === "Active" && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 gap-1">
                <AlertTriangle className="h-3 w-3" /> Missing license configuration
              </Badge>
            )}
            {client.status !== "Archived" && (
              <Button variant="outline" size="sm" onClick={handleArchive} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Archive</Button>
            )}
          </div>
        </div>

        {/* Position + filter context */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {currentIndex >= 0 && orderedIds.length > 0 ? (
            <span className="font-medium text-foreground/80">
              Client {currentIndex + 1} of {orderedIds.length}
            </span>
          ) : (
            <span>Open from the Clients list to enable prev / next navigation</span>
          )}
          {filterChips.length > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span>Filtered by</span>
              {filterChips.map(chip => (
                <Badge key={chip.key} variant="secondary" className="text-[10px] font-normal">{chip.label}</Badge>
              ))}
            </>
          )}
          {currentIndex >= 0 && orderedIds.length > 0 && filterChips.length === 0 && (
            <>
              <span className="opacity-50">·</span>
              <span>Showing all active clients</span>
            </>
          )}
          <span className="opacity-50">·</span>
          <span className="text-[10px] text-muted-foreground/70">Use ← / → to navigate</span>
        </div>
      </div>

      {/* Unsaved-changes guard */}
      <AlertDialog
        open={pendingNavId !== null || pendingBack}
        onOpenChange={(open) => { if (!open) { setPendingNavId(null); setPendingBack(false); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Save your changes before continuing, or discard them to leave this client. Cancel to stay and keep editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingNavId(null); setPendingBack(false); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = pendingNavId;
                const back = pendingBack;
                setPendingNavId(null);
                setPendingBack(false);
                if (target) goToClient(target);
                else if (back) navigate("/clients");
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-reveal-up" style={{ animationDelay: "80ms" }}>
        <TabsList className="grid w-full grid-cols-5 h-10">
          <TabsTrigger value="overview" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="licensing" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" /> Licensing</TabsTrigger>
          <TabsTrigger value="contract" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Contract</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Notes</TabsTrigger>
          <TabsTrigger value="credentials" className="gap-1.5 text-xs"><KeyRound className="h-3.5 w-3.5" /> Credentials</TabsTrigger>
        </TabsList>

        {/* ═══════════════════ OVERVIEW TAB ═══════════════════ */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Left column: Client Info + Contacts */}
            <div className="lg:col-span-2 space-y-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Client Information</CardTitle>
                {!editingClient && <Button variant="ghost" size="sm" onClick={startEditClient}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>}
              </CardHeader>
              <CardContent>
                {editingClient ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <EditField label="Commercial Name" value={clientForm.commercial_name} onChange={v => setClientForm(f => ({...f, commercial_name: v}))} />
                      <EditField label="Short Name" value={clientForm.short_name} onChange={v => setClientForm(f => ({...f, short_name: v}))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <EditField label="Phone" value={clientForm.phone} onChange={v => setClientForm(f => ({...f, phone: v}))} />
                      <EditField label="Email" value={clientForm.email} onChange={v => setClientForm(f => ({...f, email: v}))} />
                    </div>
                    <EditField label="Website" value={clientForm.website} onChange={v => setClientForm(f => ({...f, website: v}))} />
                    <EditField label="Address" value={clientForm.address} onChange={v => setClientForm(f => ({...f, address: v}))} />
                    <div className="grid grid-cols-2 gap-3">
                      <EditField label="City" value={clientForm.city} onChange={v => setClientForm(f => ({...f, city: v}))} />
                      <div><Label className="text-xs">Country</Label><CountryCombobox value={clientForm.country} onChange={v => setClientForm(f => ({...f, country: v}))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Sector</Label><SectorSelect value={clientForm.sector} onChange={v => setClientForm(f => ({...f, sector: v}))} /></div>
                      <EditField label="Manager / Owner" value={clientForm.manager_owner} onChange={v => setClientForm(f => ({...f, manager_owner: v}))} />
                    </div>
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex items-center gap-2"><Switch checked={clientForm.is_premium} onCheckedChange={v => setClientForm(f => ({...f, is_premium: v}))} /><Label className="text-xs">Premium</Label></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingClient(false)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                      <Button size="sm" onClick={saveClient} disabled={updateClient.isPending}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div className="space-y-0">
                      <FieldRow label="Client Code" value={client.client_code} mono />
                      <FieldRow label="Commercial Name" value={client.commercial_name} />
                      <FieldRow label="Short Name" value={client.short_name} />
                      <FieldRow label="Phone" value={client.phone} />
                      <FieldRow label="Email" value={client.email} />
                      <FieldRow label="Website" value={client.website} />
                    </div>
                    <div className="space-y-0">
                      <FieldRow label="Address" value={client.address} />
                      <FieldRow label="City" value={client.city} />
                      <FieldRow label="Country" value={client.country} />
                      <FieldRow label="Sector" value={client.sector} />
                      <FieldRow label="Partner" value={(client as any)?.partner?.name || "HQ Direct"} />
                      <FieldRow label="Manager / Owner" value={client.manager_owner} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          {/* Contacts */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Contacts ({contacts.length})</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAddContact(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No contacts. <button onClick={() => setShowAddContact(true)} className="text-primary hover:underline">Add first contact</button></p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {contacts.map(ct => (
                    <div key={ct.id} className="rounded-lg border border-border/60 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{ct.contact_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{ct.role_function}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => { try { await deleteContact.mutateAsync({ id: ct.id, clientId: client.id }); toast.success("Contact removed"); } catch { toast.error("Failed"); } }}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {ct.phone && <span>📞 {ct.phone}</span>}
                        {ct.mobile && <span>📱 {ct.mobile}</span>}
                        {ct.email && <span>✉️ {ct.email}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </div>

            {/* Right column: License Summary + Renewal + Flags */}
            <div className="space-y-4">
              {/* License Summary */}
              <Card className="border-border bg-card shadow-md">
                <CardHeader className="pb-2 border-b border-border/40">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> License Summary</CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  {hasValidLicense ? (
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Family</span>
                        <Badge variant="outline" className="text-xs font-medium">{licenseFamily}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Variant</span>
                        <Badge variant="secondary" className="text-xs">{isProfessional ? licenseVariant : getVariantLabel(licenseVariant)}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Deployment</span>
                        <Badge variant="secondary" className="text-xs">{isProfessional ? "SaaS" : deploymentDisplay}</Badge>
                      </div>
                      <div className="border-t border-border/40 pt-3 mt-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Users</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-md bg-muted/60 p-2.5 text-center">
                            <p className="text-xl font-bold text-foreground">{primaryLicense?.backoffice_users ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">BackOffice</p>
                          </div>
                          <div className="rounded-md bg-muted/60 p-2.5 text-center">
                            <p className="text-xl font-bold text-foreground">{primaryLicense?.web_accesses ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">Web/Mobile</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-border/40 pt-3 mt-1 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">S&AT Active</span>
                          <Badge variant={primaryLicense?.sat_active ? "default" : "secondary"} className="text-[10px]">{primaryLicense?.sat_active ? "Yes" : "No"}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">API Access</span>
                          <Badge variant={primaryLicense?.api_access ? "default" : "secondary"} className="text-[10px]">{primaryLicense?.api_access ? "Yes" : "No"}</Badge>
                        </div>
                      </div>
                      {renewalEndDate && (
                        <div className="border-t border-border/40 pt-3 mt-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Renewal Date</span>
                            <span className="text-xs font-semibold text-foreground">{renewalEndDate}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center space-y-3">
                      <p className="text-sm text-muted-foreground">No license configuration yet</p>
                      <Button size="sm" variant="outline" onClick={openAddLicenseWithDefaults}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add License Configuration
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Renewal Status */}
              <Card className={`shadow-md ${renewalInfo.status === "expired" ? "border-destructive/40" : renewalInfo.status === "due_soon" ? "border-orange-300" : "border-border"}`}>
                <CardHeader className="pb-2 border-b border-border/40">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Renewal</CardTitle>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Start Date</span>
                    <span className="text-sm">{primaryContract?.contract_start_date || primaryLicense?.license_start_date || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">End Date</span>
                    <span className="text-sm font-medium">{renewalEndDate || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Days Remaining</span>
                    <span className="text-sm font-bold">{renewalInfo.days !== null ? (renewalInfo.days < 0 ? `${Math.abs(renewalInfo.days)} overdue` : renewalInfo.days) : "—"}</span>
                  </div>
                  <div className="pt-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${renewalInfo.color}`}>
                      <RenewalIcon status={renewalInfo.status} />
                      {renewalInfo.label}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Flags */}
              <Card className="border-border shadow-md">
                <CardHeader className="pb-2 border-b border-border/40">
                  <CardTitle className="text-sm font-semibold">Flags</CardTitle>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                  {[
                    { label: "S&AT Active", value: primaryLicense?.sat_active ?? false, note: isProfessional ? "Always active for Professional SaaS" : (licenseVariant === "Business UseIT" ? "Always active for UseIT" : undefined) },
                    { label: "Custom Reports", value: client.has_custom_reports },
                    { label: "Premium", value: client.is_premium },
                  ].map(flag => (
                    <div key={flag.label} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                      <div>
                        <span className="text-sm text-foreground">{flag.label}</span>
                        {flag.note && <p className="text-[10px] text-muted-foreground">{flag.note}</p>}
                      </div>
                      <Badge variant={flag.value ? "default" : "secondary"} className="text-[10px]">{flag.value ? "Yes" : "No"}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════ LICENSING TAB ═══════════════════ */}
        <TabsContent value="licensing" className="space-y-5 mt-5">
          {/* License Config */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">License Configuration</CardTitle>
              <Button size="sm" onClick={openAddLicenseWithDefaults}><Plus className="h-4 w-4 mr-1.5" /> Add License</Button>
            </CardHeader>
            <CardContent>
              {validLicenses.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">No license configuration yet</p>
                  <Button size="sm" variant="outline" onClick={openAddLicenseWithDefaults}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add License Configuration
                  </Button>
                </div>
              ) : validLicenses.map(lic => {
                const { family: licFam, variant: licVar } = parseLicenseProduct(lic.product);
                return (
                <div key={lic.id} className="space-y-4 border-b border-border/40 last:border-0 pb-4 last:pb-0 mb-4 last:mb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{licFam}</Badge>
                      <Badge variant="secondary">{getVariantLabel(licVar)}</Badge>
                      <Badge variant="secondary" className="text-xs">{lic.version || "—"}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {editingLicenseId === lic.id ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEditingLicenseId(null)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                          <Button size="sm" onClick={saveLicense} disabled={updateLicense.isPending}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => startEditLicense(lic)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this license configuration?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone. The license configuration and all associated modules will be permanently removed.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteLicense(lic.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>

                  {editingLicenseId === lic.id ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {renderLicenseFamilyVariantFields(licEditForm, setLicEditForm)}
                      <EditField label="Version" value={licEditForm.version} onChange={v => setLicEditForm(f => ({...f, version: v}))} />
                      <div>
                        <Label className="text-xs">Deployment</Label>
                        <Select
                          value={licEditForm.database_type || "On-Premise"}
                          onValueChange={v => setLicEditForm(f => ({...f, database_type: v}))}
                          disabled={licEditForm._family === "Professional"}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SaaS">SaaS</SelectItem>
                            <SelectItem value="On-Premise">On-Premise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Periodicity</Label>
                        <Select value={licEditForm.periodicity || "Annual"} onValueChange={v => setLicEditForm(f => ({...f, periodicity: v}))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Monthly">Monthly</SelectItem>
                            <SelectItem value="Quarterly">Quarterly</SelectItem>
                            <SelectItem value="Annual">Annual</SelectItem>
                            <SelectItem value="Perpetual">Perpetual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <EditField label="License Start" value={licEditForm.license_start_date} onChange={v => setLicEditForm(f => ({...f, license_start_date: v}))} type="date" />
                      <EditField label="License End" value={licEditForm.license_end_date} onChange={v => setLicEditForm(f => ({...f, license_end_date: v}))} type="date" />
                      <EditField label="BackOffice Users" value={String(licEditForm.backoffice_users)} onChange={v => setLicEditForm(f => ({...f, backoffice_users: parseInt(v)||0}))} type="number" />
                      <EditField label="Web Accesses" value={String(licEditForm.web_accesses)} onChange={v => setLicEditForm(f => ({...f, web_accesses: parseInt(v)||0}))} type="number" />
                      <div className="flex items-center gap-2 pt-5"><Switch checked={licEditForm.sat_active} onCheckedChange={v => setLicEditForm(f => ({...f, sat_active: v}))} /><Label className="text-xs">S&AT Active</Label></div>
                      <div className="flex items-center gap-2 pt-5"><Switch checked={licEditForm.api_access} onCheckedChange={v => setLicEditForm(f => ({...f, api_access: v}))} /><Label className="text-xs">API Access</Label></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                      <div className="space-y-0">
                        <FieldRow label="License Family" value={licFam} />
                        <FieldRow label="Variant" value={licVar ? getVariantLabel(licVar) : "—"} />
                        <FieldRow label="Deployment" value={lic.database_type} />
                        <FieldRow label="License Start" value={lic.license_start_date} />
                        <FieldRow label="License End" value={lic.license_end_date} />
                      </div>
                      <div className="space-y-0">
                        <FieldRow label="Periodicity" value={lic.periodicity} />
                        <FieldRow label="S&AT Active" value={lic.sat_active ? "Yes" : "No"} />
                        <FieldRow label="S&AT End Date" value={lic.sat_end_date} />
                        <FieldRow label="BackOffice Users" value={lic.backoffice_users} />
                        <FieldRow label="Web Accesses" value={lic.web_accesses} />
                        <FieldRow label="API Access" value={lic.api_access ? "Yes" : "No"} />
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </CardContent>
          </Card>

          {/* Modules & Plugins — separated into two sections */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Modules & Plugins</CardTitle>
                {isProfessional && <p className="text-xs text-muted-foreground mt-1">Auto-filled based on {licenseVariant}. Maintenance Requests is an optional add-on.</p>}
                {isBusiness && <p className="text-xs text-muted-foreground mt-1">Business licenses allow flexible module and plugin selection.</p>}
                {!hasValidLicense && <p className="text-xs text-muted-foreground mt-1">Add a license configuration to manage modules.</p>}
              </div>
              {primaryLicense && !editingModules && (
                <Button variant="ghost" size="sm" onClick={startEditModules}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
              )}
              {editingModules && (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditingModules(false)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                  <Button size="sm" onClick={saveModules}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!hasValidLicense ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No license configuration. Add one to manage modules and plugins.</p>
              ) : (
                <div className="space-y-6">
                  {renderModuleSection("Modules", CORE_MODULES)}
                  {renderModuleSection("Plugins", PLUGIN_MODULES)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ CONTRACT TAB ═══════════════════ */}
        <TabsContent value="contract" className="space-y-5 mt-5">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setContractFormData({ currency: "EUR", notice_period_days: 30 }); setShowAddContract(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Contract</Button>
          </div>
          {contracts.length === 0 ? (
            <Card className="border-border/60 shadow-sm"><CardContent className="py-12 text-center text-muted-foreground">No contracts. <button onClick={() => setShowAddContract(true)} className="text-primary hover:underline">Create first contract</button></CardContent></Card>
          ) : contracts.map(co => (
            <Card key={co.id} className="border-border/60 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Contract — {co.contract_start_date} to {co.contract_end_date} <Badge variant="secondary" className="ml-2 text-xs">{co.currency}</Badge></CardTitle>
                {editingContractId === co.id ? (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditingContractId(null)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" onClick={saveContract} disabled={updateContract.isPending}><Save className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => startEditContract(co)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                )}
              </CardHeader>
              <CardContent>
                {editingContractId === co.id ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <EditField label="Start Date" value={conEditForm.contract_start_date} onChange={v => setConEditForm(f => ({...f, contract_start_date: v}))} type="date" />
                    <EditField label="End Date" value={conEditForm.contract_end_date} onChange={v => setConEditForm(f => ({...f, contract_end_date: v}))} type="date" />
                    <EditField label="Notice Days" value={String(conEditForm.notice_period_days)} onChange={v => setConEditForm(f => ({...f, notice_period_days: parseInt(v)||30}))} type="number" />
                    <EditField label="Contract Value (€)" value={String(conEditForm.contract_value)} onChange={v => setConEditForm(f => ({...f, contract_value: parseFloat(v)||0}))} type="number" />
                    <EditField label="Invoiced (€)" value={String(conEditForm.invoiced_value)} onChange={v => setConEditForm(f => ({...f, invoiced_value: parseFloat(v)||0}))} type="number" />
                    <EditField label="Hosting (€)" value={String(conEditForm.hosting_value)} onChange={v => setConEditForm(f => ({...f, hosting_value: parseFloat(v)||0}))} type="number" />
                    <EditField label="SAT (€)" value={String(conEditForm.sat_value)} onChange={v => setConEditForm(f => ({...f, sat_value: parseFloat(v)||0}))} type="number" />
                    <EditField label="MWW Web (€)" value={String(conEditForm.mww_web_value)} onChange={v => setConEditForm(f => ({...f, mww_web_value: parseFloat(v)||0}))} type="number" />
                    <EditField label="Total (€)" value={String(conEditForm.total_value)} onChange={v => setConEditForm(f => ({...f, total_value: parseFloat(v)||0}))} type="number" />
                    <EditField label="Installments" value={String(conEditForm.num_installments)} onChange={v => setConEditForm(f => ({...f, num_installments: parseInt(v)||1}))} type="number" />
                    <EditField label="Increase %" value={String(conEditForm.renewal_increase_pct)} onChange={v => setConEditForm(f => ({...f, renewal_increase_pct: parseFloat(v)||0}))} type="number" />
                    <EditField label="Price Table Ref" value={conEditForm.price_table_reference} onChange={v => setConEditForm(f => ({...f, price_table_reference: v}))} />
                    <div className="col-span-full"><Label className="text-xs">Billing Notes</Label><Textarea value={conEditForm.billing_notes} onChange={e => setConEditForm(f => ({...f, billing_notes: e.target.value}))} rows={2} className="text-sm" /></div>
                    <div className="col-span-full"><Label className="text-xs">Observations</Label><Textarea value={conEditForm.observations} onChange={e => setConEditForm(f => ({...f, observations: e.target.value}))} rows={3} className="text-sm" /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div className="space-y-0">
                      <FieldRow label="Price Table" value={co.price_table_reference} mono />
                      <FieldRow label="Start Date" value={co.contract_start_date} />
                      <FieldRow label="End Date" value={co.contract_end_date} />
                      <FieldRow label="Notice Period" value={co.notice_period_days ? `${co.notice_period_days} days` : "—"} />
                      <FieldRow label="Installments" value={co.num_installments} />
                      <FieldRow label="Renewal Increase" value={co.renewal_increase_pct ? `${co.renewal_increase_pct}%` : "—"} />
                    </div>
                    <div className="space-y-0">
                      <FieldRow label="Contract Value" value={`€${Number(co.contract_value || 0).toLocaleString()}`} />
                      <FieldRow label="Invoiced Value" value={`€${Number(co.invoiced_value || 0).toLocaleString()}`} />
                      <FieldRow label="Hosting Value" value={co.hosting_value ? `€${Number(co.hosting_value).toLocaleString()}` : "—"} />
                      <FieldRow label="SAT Value" value={co.sat_value ? `€${Number(co.sat_value).toLocaleString()}` : "—"} />
                      <FieldRow label="Total Value" value={<span className="font-semibold">€{Number(co.total_value || 0).toLocaleString()}</span>} />
                    </div>
                  </div>
                )}
                {co.observations && !editingContractId && (
                  <div className="mt-4"><p className="text-xs font-medium text-muted-foreground mb-1">Observations</p><p className="text-sm text-foreground">{co.observations}</p></div>
                )}
                {editingContractId !== co.id && (
                  <ContractBreakdown contractId={co.id} legacyTotal={co.total_value} currency={co.currency} />
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ═══════════════════ NOTES TAB ═══════════════════ */}
        <TabsContent value="notes" className="mt-5">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {client.observations && (
                <div className="rounded-lg bg-secondary/50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Legacy Observations</p>
                  <p className="text-sm text-foreground">{client.observations}</p>
                </div>
              )}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex gap-2">
                  <Select value={newNoteType} onValueChange={setNewNoteType}>
                    <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." rows={3} className="text-sm" />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleAddNote} disabled={createNote.isPending}><Plus className="h-3.5 w-3.5 mr-1" /> Add Note</Button>
                </div>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((n: any) => (
                    <div key={n.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{n.note_type}</Badge>
                          {n.created_by && <span className="text-[10px] text-muted-foreground">by {n.created_by}</span>}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-sm text-foreground">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ CREDENTIALS TAB ═══════════════════ */}
        <TabsContent value="credentials" className="mt-5">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">System Credentials</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAddCred(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </CardHeader>
            <CardContent>
              {credentials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No credentials stored. <button onClick={() => setShowAddCred(true)} className="text-primary hover:underline">Add credentials</button></p>
              ) : (
                <div className="space-y-4">
                  {credentials.map((cr: any) => (
                    <div key={cr.id} className="border rounded-lg p-4 space-y-2">
                      <FieldRow label="System URL" value={cr.system_url} />
                      <FieldRow label="Username" value={cr.username} />
                      <FieldRow label="Login" value={cr.login} />
                      <FieldRow label="Environment" value={cr.environment_type} />
                      {cr.admin_notes && <FieldRow label="Admin Notes" value={cr.admin_notes} />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ DIALOGS ═══════════════════ */}
      {/* Add Contact */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <EditField label="Name *" value={contactForm.contact_name} onChange={v => setContactForm(f => ({...f, contact_name: v}))} />
            <EditField label="Role / Function" value={contactForm.role_function} onChange={v => setContactForm(f => ({...f, role_function: v}))} />
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Phone" value={contactForm.phone} onChange={v => setContactForm(f => ({...f, phone: v}))} />
              <EditField label="Mobile" value={contactForm.mobile} onChange={v => setContactForm(f => ({...f, mobile: v}))} />
            </div>
            <EditField label="Email" value={contactForm.email} onChange={v => setContactForm(f => ({...f, email: v}))} />
            <div><Label className="text-xs">Notes</Label><Textarea value={contactForm.notes} onChange={e => setContactForm(f => ({...f, notes: e.target.value}))} rows={2} className="text-sm" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAddContact(false)}>Cancel</Button><Button onClick={handleAddContact} disabled={createContact.isPending}>{createContact.isPending ? "Adding..." : "Add Contact"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add License */}
      <Dialog open={showAddLicense} onOpenChange={setShowAddLicense}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add License</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              {renderLicenseFamilyVariantFields(licenseForm, setLicenseForm)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Version" value={licenseForm.version || ""} onChange={v => setLicenseForm(f => ({...f, version: v}))} />
              <div>
                <Label className="text-xs">Deployment</Label>
                <Select
                  value={licenseForm.database_type || "On-Premise"}
                  onValueChange={v => setLicenseForm(f => ({...f, database_type: v}))}
                  disabled={licenseForm._family === "Professional"}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SaaS">SaaS</SelectItem>
                    <SelectItem value="On-Premise">On-Premise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Periodicity</Label>
                <Select value={licenseForm.periodicity || "Annual"} onValueChange={v => setLicenseForm(f => ({...f, periodicity: v}))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                    <SelectItem value="Annual">Annual</SelectItem>
                    <SelectItem value="Perpetual">Perpetual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Start Date" value={licenseForm.license_start_date || ""} onChange={v => setLicenseForm(f => ({...f, license_start_date: v}))} type="date" />
              <EditField label="End Date" value={licenseForm.license_end_date || ""} onChange={v => setLicenseForm(f => ({...f, license_end_date: v}))} type="date" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="BackOffice Users" value={String(licenseForm.backoffice_users ?? 0)} onChange={v => setLicenseForm(f => ({...f, backoffice_users: parseInt(v)||0}))} type="number" />
              <EditField label="Web Accesses" value={String(licenseForm.web_accesses ?? 0)} onChange={v => setLicenseForm(f => ({...f, web_accesses: parseInt(v)||0}))} type="number" />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><Switch checked={licenseForm.sat_active ?? false} onCheckedChange={v => setLicenseForm(f => ({...f, sat_active: v}))} /><Label className="text-xs">S&AT Active</Label></div>
              <div className="flex items-center gap-2"><Switch checked={licenseForm.api_access ?? false} onCheckedChange={v => setLicenseForm(f => ({...f, api_access: v}))} /><Label className="text-xs">API Access</Label></div>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAddLicense(false)}>Cancel</Button><Button onClick={handleAddLicense} disabled={createLicense.isPending}>{createLicense.isPending ? "Creating..." : "Create License"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Contract */}
      <Dialog open={showAddContract} onOpenChange={setShowAddContract}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Contract</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Start Date" value={contractFormData.contract_start_date || ""} onChange={v => setContractFormData(f => ({...f, contract_start_date: v}))} type="date" />
              <EditField label="End Date" value={contractFormData.contract_end_date || ""} onChange={v => setContractFormData(f => ({...f, contract_end_date: v}))} type="date" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Contract Value (€)" value={String(contractFormData.contract_value || 0)} onChange={v => setContractFormData(f => ({...f, contract_value: parseFloat(v)||0}))} type="number" />
              <EditField label="Total Value (€)" value={String(contractFormData.total_value || 0)} onChange={v => setContractFormData(f => ({...f, total_value: parseFloat(v)||0}))} type="number" />
            </div>
            <EditField label="Notice Days" value={String(contractFormData.notice_period_days || 30)} onChange={v => setContractFormData(f => ({...f, notice_period_days: parseInt(v)||30}))} type="number" />
            <div><Label className="text-xs">Observations</Label><Textarea value={contractFormData.observations || ""} onChange={e => setContractFormData(f => ({...f, observations: e.target.value}))} rows={3} className="text-sm" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAddContract(false)}>Cancel</Button><Button onClick={handleAddContract} disabled={createContract.isPending}>{createContract.isPending ? "Creating..." : "Create Contract"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Credential */}
      <Dialog open={showAddCred} onOpenChange={setShowAddCred}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Credentials</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <EditField label="System URL" value={credForm.system_url} onChange={v => setCredForm(f => ({...f, system_url: v}))} />
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Username" value={credForm.username} onChange={v => setCredForm(f => ({...f, username: v}))} />
              <EditField label="Login" value={credForm.login} onChange={v => setCredForm(f => ({...f, login: v}))} />
            </div>
            <EditField label="Password / Secret" value={credForm.password_secret} onChange={v => setCredForm(f => ({...f, password_secret: v}))} type="password" />
            <EditField label="Environment" value={credForm.environment_type} onChange={v => setCredForm(f => ({...f, environment_type: v}))} />
            <div><Label className="text-xs">Admin Notes</Label><Textarea value={credForm.admin_notes} onChange={e => setCredForm(f => ({...f, admin_notes: e.target.value}))} rows={2} className="text-sm" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAddCred(false)}>Cancel</Button><Button onClick={handleAddCred} disabled={createCredential.isPending}>{createCredential.isPending ? "Saving..." : "Save Credentials"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

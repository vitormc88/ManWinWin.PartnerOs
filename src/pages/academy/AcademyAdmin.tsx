import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAcademyMissions,
  useAcademyModules,
  useAcademyPhases,
  useDeleteAcademyRecord,
  useSaveAcademyRecord,
} from "@/hooks/useAcademy";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Table = "academy_phases" | "academy_modules" | "academy_missions" | "academy_resources";

type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "markdown" | "number" | "status" | "boolean" | "select";
  options?: string[];
};

const STATUSES = ["draft", "published", "archived"];

const FIELDS: Record<Table, Field[]> = {
  academy_phases: [
    { key: "title", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
  academy_modules: [
    { key: "title", label: "Title", type: "text" },
    { key: "slug", label: "Slug", type: "text" },
    { key: "phase_id", label: "Phase", type: "select" },
    { key: "short_description", label: "Short description", type: "textarea" },
    { key: "full_description", label: "Full description", type: "textarea" },
    { key: "estimated_duration_minutes", label: "Duration (min)", type: "number" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "version", label: "Version", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
  academy_missions: [
    { key: "title", label: "Title", type: "text" },
    { key: "slug", label: "Slug", type: "text" },
    { key: "module_id", label: "Module", type: "select" },
    { key: "mission_number", label: "Mission number", type: "number" },
    { key: "short_description", label: "Short description", type: "textarea" },
    { key: "estimated_duration_minutes", label: "Duration (min)", type: "number" },
    { key: "content_markdown", label: "Content (Markdown)", type: "markdown" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "is_required", label: "Required", type: "boolean" },
    { key: "is_locked", label: "Locked", type: "boolean" },
    { key: "version", label: "Version", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
  academy_resources: [
    { key: "title", label: "Title", type: "text" },
    { key: "module_id", label: "Module", type: "select" },
    { key: "resource_type", label: "Type", type: "select", options: ["link", "file", "markdown", "template", "checklist"] },
    { key: "content", label: "Content", type: "textarea" },
    { key: "file_path", label: "File reference", type: "text" },
    { key: "is_downloadable", label: "Downloadable", type: "boolean" },
    { key: "sort_order", label: "Order", type: "number" },
    { key: "status", label: "Status", type: "status" },
  ],
};

export default function AcademyAdmin() {
  const { canAdmin, isLoading } = useModuleAccess();
  const { data: phases = [] } = useAcademyPhases();
  const { data: modules = [] } = useAcademyModules();
  const { data: missions = [] } = useAcademyMissions();
  const { data: resources = [] } = useQuery({
    queryKey: ["academy", "resources", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_resources").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editing, setEditing] = useState<{ table: Table; record: Record<string, any> } | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!canAdmin("onboarding")) {
    return <p className="text-sm text-muted-foreground">You do not have permission to manage Academy content.</p>;
  }

  const selectOptions = (table: Table, key: string): Array<{ value: string; label: string }> => {
    if (key === "phase_id") return phases.map((p) => ({ value: p.id, label: p.title }));
    if (key === "module_id") return modules.map((m) => ({ value: m.id, label: m.title }));
    const field = FIELDS[table].find((f) => f.key === key);
    return (field?.options ?? []).map((o) => ({ value: o, label: o }));
  };

  const section = (table: Table, title: string, rows: any[], subtitle?: (r: any) => string) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Button size="sm" onClick={() => setEditing({ table, record: { status: "draft", sort_order: rows.length + 1 } })}>
          <Plus className="h-4 w-4 mr-1" />New
        </Button>
      </div>
      <div className="bg-card rounded-xl border shadow-sm divide-y">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle(r)}</p>}
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
            <Button variant="ghost" size="icon" onClick={() => setEditing({ table, record: r })}>
              <Pencil className="h-4 w-4" />
            </Button>
            <DeleteButton table={table} id={r.id} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/onboarding" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Partner Academy
      </Link>
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Academy content</h1>

      <Tabs defaultValue="phases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="missions">Missions</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>
        <TabsContent value="phases">{section("academy_phases", "Phases", phases)}</TabsContent>
        <TabsContent value="modules">
          {section("academy_modules", "Modules", modules, (m) => phases.find((p) => p.id === m.phase_id)?.title ?? "No phase")}
        </TabsContent>
        <TabsContent value="missions">
          {section("academy_missions", "Missions", missions, (m) => modules.find((x) => x.id === m.module_id)?.title ?? "")}
        </TabsContent>
        <TabsContent value="resources">
          {section("academy_resources", "Resources", resources as any[], (r: any) => r.resource_type)}
        </TabsContent>
      </Tabs>

      {editing && (
        <RecordDialog
          table={editing.table}
          record={editing.record}
          selectOptions={selectOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DeleteButton({ table, id }: { table: Table; id: string }) {
  const del = useDeleteAcademyRecord(table);
  return (
    <Button variant="ghost" size="icon" disabled={del.isPending} onClick={() => del.mutate(id)}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

function RecordDialog({
  table,
  record,
  selectOptions,
  onClose,
}: {
  table: Table;
  record: Record<string, any>;
  selectOptions: (table: Table, key: string) => Array<{ value: string; label: string }>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(record);
  const save = useSaveAcademyRecord(table);
  const fields = useMemo(() => FIELDS[table], [table]);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const onSave = () => {
    const payload: Record<string, any> = { ...(form.id ? { id: form.id } : {}) };
    fields.forEach((f) => {
      const raw = form[f.key];
      if (raw === undefined) return;
      payload[f.key] = f.type === "number" ? Number(raw) || 0 : raw;
    });
    save.mutate(payload, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit" : "New"} {table.replace("academy_", "").replace(/s$/, "")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.type === "textarea" || f.type === "markdown" ? (
                <Textarea
                  id={f.key}
                  rows={f.type === "markdown" ? 10 : 3}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={f.type === "markdown" ? "font-mono text-xs" : undefined}
                />
              ) : f.type === "boolean" ? (
                <div><Switch checked={!!form[f.key]} onCheckedChange={(v) => set(f.key, v)} /></div>
              ) : f.type === "status" || f.type === "select" ? (
                <Select value={form[f.key] ?? ""} onValueChange={(v) => set(f.key, v)}>
                  <SelectTrigger id={f.key}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(f.type === "status"
                      ? STATUSES.map((s) => ({ value: s, label: s }))
                      : selectOptions(table, f.key)
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={f.key}
                  type={f.type === "number" ? "number" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

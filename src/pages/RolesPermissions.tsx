import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_KEYS_LIST, MODULE_LABELS } from "@/lib/module-access";
import { ROLE_OPTIONS, type AccessLevel } from "@/lib/permissions";
import { useRoleTemplates, useSaveRoleTemplate, useApplyRoleTemplate } from "@/hooks/useRoleTemplates";
import { Save, RotateCcw, Users } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const LEVELS: AccessLevel[] = ["no_access", "view", "edit", "admin"];
const LEVEL_LABEL: Record<AccessLevel, string> = {
  no_access: "No Access",
  view: "View",
  edit: "Edit",
  admin: "Admin",
};

export default function RolesPermissions() {
  const { roles, isLoading } = useAuth();
  const isAdmin = roles.includes("hq_admin");
  const { data: templates } = useRoleTemplates();
  const save = useSaveRoleTemplate();
  const apply = useApplyRoleTemplate();
  const [activeRole, setActiveRole] = useState<string>("hq_admin");
  const [matrix, setMatrix] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [overwrite, setOverwrite] = useState(false);

  useEffect(() => {
    if (!templates) return;
    const m: Record<string, Record<string, AccessLevel>> = {};
    for (const t of templates) {
      m[t.role] ??= {};
      m[t.role][t.module_key] = t.access_level;
    }
    setMatrix(m);
  }, [templates]);

  const currentRow = matrix[activeRole] ?? {};
  const dirty = useMemo(() => {
    if (!templates) return false;
    return MODULE_KEYS_LIST.some((m) => {
      const stored = templates.find((t) => t.role === activeRole && t.module_key === m)?.access_level ?? "no_access";
      return (currentRow[m] ?? "no_access") !== stored;
    });
  }, [currentRow, templates, activeRole]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const setCell = (module: string, level: AccessLevel) => {
    setMatrix((prev) => ({ ...prev, [activeRole]: { ...(prev[activeRole] ?? {}), [module]: level } }));
  };

  const onSave = () =>
    save.mutate({
      role: activeRole,
      perms: MODULE_KEYS_LIST.map((m) => ({ module_key: m, access_level: currentRow[m] ?? "no_access" })),
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Roles & Permissions</CardTitle>
            <CardDescription>Default module access for each role. Users inherit these unless they have a custom override.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeRole} onValueChange={setActiveRole}>
          <TabsList className="flex flex-wrap h-auto">
            {ROLE_OPTIONS.map((r) => (
              <TabsTrigger key={r.value} value={r.value} className="gap-2">
                {r.label}
                {r.deprecated && <Badge variant="outline" className="text-[10px] py-0">deprecated</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>

          {ROLE_OPTIONS.map((r) => (
            <TabsContent key={r.value} value={r.value} className="space-y-3">
              <div className="rounded-md border divide-y">
                {MODULE_KEYS_LIST.map((m) => (
                  <div key={m} className="flex items-center justify-between p-3">
                    <span className="text-sm">{MODULE_LABELS[m]}</span>
                    <Select
                      value={(matrix[r.value]?.[m]) ?? "no_access"}
                      onValueChange={(v) => setCell(m, v as AccessLevel)}
                    >
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((lv) => (
                          <SelectItem key={lv} value={lv}>{LEVEL_LABEL[lv]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!templates}>
                      <Users className="h-4 w-4 mr-2" /> Apply to existing users
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apply template to existing {ROLE_OPTIONS.find((x) => x.value === activeRole)?.label} users?</AlertDialogTitle>
                      <AlertDialogDescription>
                        New users automatically inherit this template. Use this to push changes to existing users.
                        By default, custom per-user overrides are preserved.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} />
                      Also overwrite users that have custom overrides
                    </label>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => apply.mutate({ role: activeRole, overwriteOverrides: overwrite })}>
                        Apply
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button variant="outline" size="sm" onClick={() => {
                  // reset to stored
                  if (!templates) return;
                  const m: Record<string, AccessLevel> = {};
                  templates.filter((t) => t.role === activeRole).forEach((t) => (m[t.module_key] = t.access_level));
                  setMatrix((prev) => ({ ...prev, [activeRole]: m }));
                }}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Discard changes
                </Button>

                <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
                  <Save className="h-4 w-4 mr-2" /> Save Role Template
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

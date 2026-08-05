import { useMemo, useState } from "react";
import { Download, FileDown, Pencil, Plus, Upload, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAcademyMissions, useAcademyModules } from "@/hooks/useAcademy";
import { QuestionImportWizard } from "@/components/academy/QuestionImportWizard";
import {
  downloadTextFile,
  exportQuestions,
  generateQuestionTemplate,
  type ImportFormat,
} from "@/lib/academy-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AcademyState } from "@/components/academy/AcademyState";
import {
  useAcademyQuestions,
  useDeleteAcademyQuestion,
  useSaveAcademyQuestion,
  type AcademyQuestionRow,
} from "@/hooks/useAcademyCertification";
import {
  CERT_CATEGORIES,
  CERT_CATEGORY_LABELS,
  CERT_DIFFICULTIES,
  CERT_TYPES,
  CERT_TYPE_LABELS,
  type CertCategory,
  type CertQuestionType,
} from "@/lib/academy-certification";

type Draft = {
  id?: string;
  question_code: string;
  question_text: string;
  scenario_text: string;
  category: CertCategory;
  question_type: CertQuestionType;
  difficulty: string;
  weight: number;
  status: string;
  is_mandatory: boolean;
  explanation: string;
  optionsText: string;
  correctText: string;
};

const emptyDraft = (): Draft => ({
  question_code: "",
  question_text: "",
  scenario_text: "",
  category: "knowledge" as CertCategory,
  question_type: "single_choice" as CertQuestionType,
  difficulty: "medium",
  weight: 1,
  status: "draft",
  is_mandatory: false,
  explanation: "",
  optionsText: "",
  correctText: "",
});

const toDraft = (q: AcademyQuestionRow): Draft => ({
  id: q.id,
  question_code: q.question_code,
  question_text: q.question_text,
  scenario_text: q.scenario_text ?? "",
  category: q.category as CertCategory,
  question_type: q.question_type as CertQuestionType,
  difficulty: q.difficulty,
  weight: q.weight,
  status: q.status,
  is_mandatory: q.is_mandatory,
  explanation: q.explanation ?? "",
  optionsText: (Array.isArray(q.options_json) ? (q.options_json as string[]) : []).join("\n"),
  correctText: JSON.stringify(q.correct_answer_json ?? null, null, 2),
});

/**
 * Admin-only question bank for module certifications. Correct answers stay in
 * this surface — the learner-facing RPCs never return them.
 */
export function QuestionBankPanel({ moduleId }: { moduleId?: string }) {
  const query = useAcademyQuestions(moduleId);
  const modulesQuery = useAcademyModules();
  const missionsQuery = useAcademyMissions(moduleId);
  const save = useSaveAcademyQuestion();
  const remove = useDeleteAcademyQuestion();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AcademyQuestionRow | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const questions = query.data ?? [];
  const missions = (missionsQuery.data ?? []) as Array<{ id: string; title: string; slug: string }>;
  const moduleTitle =
    (modulesQuery.data ?? []).find((m) => m.id === moduleId)?.title ?? "Module";
  const missionTitleById = useMemo(
    () => Object.fromEntries(missions.map((m) => [m.id, m.title])),
    [missions]
  );
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions.filter((x) => x.status === "published")) {
      map.set(q.category, (map.get(q.category) ?? 0) + 1);
    }
    return map;
  }, [questions]);


  if (!moduleId)
    return <AcademyState kind="empty" title="Select a module to manage its question bank." />;
  if (query.isError)
    return <AcademyState kind="error" error={query.error} onRetry={() => query.refetch()} />;
  if (query.isLoading) return <AcademyState kind="loading" title="Loading question bank…" />;

  const commit = () => {
    if (!draft) return;
    let correct: unknown;
    try {
      correct = JSON.parse(draft.correctText);
    } catch {
      setJsonError("The correct answer must be valid JSON (string, array, or object).");
      return;
    }
    setJsonError(null);
    save.mutate(
      {
        id: draft.id,
        module_id: moduleId,
        question_code: draft.question_code.trim(),
        question_text: draft.question_text.trim(),
        scenario_text: draft.scenario_text.trim() || null,
        category: draft.category,
        question_type: draft.question_type,
        difficulty: draft.difficulty,
        weight: draft.weight,
        status: draft.status,
        is_mandatory: draft.is_mandatory,
        explanation: draft.explanation.trim() || null,
        options_json: draft.optionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        correct_answer_json: correct as never,
      },
      { onSuccess: () => setDraft(null) }
    );
  };

  const doExport = (format: ImportFormat, missionId?: string) => {
    const rows = missionId ? questions.filter((q) => q.mission_id === missionId) : questions;
    if (rows.length === 0) return;
    const content = exportQuestions(format, rows as never, { moduleTitle, missionTitleById });
    downloadTextFile(
      `academy-questions-${missionId ? "mission" : "module"}.${format}`,
      content,
      format === "json" ? "application/json" : "text/csv"
    );
  };

  const doTemplate = (format: ImportFormat, missionTitle?: string | null) => {
    downloadTextFile(
      `academy-question-template.${format}`,
      generateQuestionTemplate(format, { moduleTitle, missionTitle }),
      format === "json" ? "application/json" : "text/csv"
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {CERT_CATEGORIES.map((c) => (
            <Badge key={c} variant="outline" className="text-[11px]">
              {CERT_CATEGORY_LABELS[c]} · {byCategory.get(c) ?? 0} published
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <FileDown className="h-4 w-4 mr-1" />Generate template
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doTemplate("json")}>JSON — module</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doTemplate("csv")}>CSV — module</DropdownMenuItem>
              {missions.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => doTemplate("csv", m.title)}>
                  CSV — {m.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={questions.length === 0}>
                <Download className="h-4 w-4 mr-1" />Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("json")}>Entire module — JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv")}>Entire module — CSV</DropdownMenuItem>
              {missions.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => doExport("json", m.id)}>
                  {m.title} — JSON
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />Import questions
          </Button>
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4 mr-1" />New question
          </Button>
        </div>
      </div>

      <QuestionImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        context={{
          moduleId,
          moduleTitle,
          missions,
          existingCodes: questions.map((q) => q.question_code),
        }}
      />


      <div className="bg-card rounded-xl border shadow-sm divide-y">
        {questions.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No questions yet.</p>
        )}
        {questions.map((q) => (
          <div key={q.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                <span className="text-muted-foreground mr-2">{q.question_code}</span>
                {q.question_text}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  {CERT_CATEGORY_LABELS[q.category as CertCategory] ?? q.category}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {CERT_TYPE_LABELS[q.question_type as CertQuestionType] ?? q.question_type}
                </Badge>
                <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                <Badge variant="outline" className="text-[10px]">weight {q.weight}</Badge>
                <Badge
                  className={`text-[10px] border-0 ${
                    q.status === "published"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {q.status}
                </Badge>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setDraft(toDraft(q))}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setPendingDelete(q)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit question" : "New question"}</DialogTitle>
            <DialogDescription>
              Only published questions are eligible for exam selection.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Question code">
                  <Input
                    value={draft.question_code}
                    onChange={(e) => setDraft({ ...draft, question_code: e.target.value })}
                  />
                </Field>
                <Field label="Difficulty">
                  <Select
                    value={draft.difficulty}
                    onValueChange={(v) => setDraft({ ...draft, difficulty: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CERT_DIFFICULTIES.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category">
                  <Select
                    value={draft.category}
                    onValueChange={(v) => setDraft({ ...draft, category: v as CertCategory })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CERT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{CERT_CATEGORY_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Answer type">
                  <Select
                    value={draft.question_type}
                    onValueChange={(v) =>
                      setDraft({ ...draft, question_type: v as CertQuestionType })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CERT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{CERT_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Weight">
                  <Input
                    type="number"
                    min={1}
                    value={draft.weight}
                    onChange={(e) =>
                      setDraft({ ...draft, weight: Number(e.target.value) || 1 })
                    }
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={draft.status}
                    onValueChange={(v) => setDraft({ ...draft, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">draft</SelectItem>
                      <SelectItem value="published">published</SelectItem>
                      <SelectItem value="retired">retired</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Scenario text (optional)">
                <Textarea
                  rows={3}
                  value={draft.scenario_text}
                  onChange={(e) => setDraft({ ...draft, scenario_text: e.target.value })}
                />
              </Field>
              <Field label="Question text">
                <Textarea
                  rows={3}
                  value={draft.question_text}
                  onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                />
              </Field>
              <Field label="Options (one per line)">
                <Textarea
                  rows={5}
                  value={draft.optionsText}
                  onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                />
              </Field>
              <Field label="Correct answer (JSON)">
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={draft.correctText}
                  onChange={(e) => setDraft({ ...draft, correctText: e.target.value })}
                />
              </Field>
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              <Field label="Explanation (shown to admins only)">
                <Textarea
                  rows={2}
                  value={draft.explanation}
                  onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                />
              </Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.is_mandatory}
                  onCheckedChange={(c) => setDraft({ ...draft, is_mandatory: c })}
                />
                <span className="text-sm text-foreground">Always include in every exam</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={commit} disabled={save.isPending}>Save question</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.question_code} will be removed from the bank. Past attempts keep
              their recorded answers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

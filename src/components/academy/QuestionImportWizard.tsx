import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useImportAcademyQuestions, type ImportOutcome } from "@/hooks/useAcademyImport";
import {
  parseImportContent,
  questionImportDescriptor,
  validateImport,
  type DuplicateMode,
  type ImportFormat,
  type ImportReport,
  type QuestionImportContext,
  type QuestionImportRecord,
} from "@/lib/academy-import";

type Step = "source" | "report" | "summary";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: QuestionImportContext;
}

/**
 * Import wizard: Upload/Paste → Dry Run validation → Preview → Import → Summary.
 * Nothing is written until a dry run passes.
 */
export function QuestionImportWizard({ open, onOpenChange, context }: Props) {
  const [step, setStep] = useState<Step>("source");
  const [format, setFormat] = useState<ImportFormat>("json");
  const [content, setContent] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport<QuestionImportRecord> | null>(null);
  const [mode, setMode] = useState<DuplicateMode>("skip");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importer = useImportAcademyQuestions();

  const reset = () => {
    setStep("source");
    setContent("");
    setParseError(null);
    setReport(null);
    setOutcome(null);
    setMode("skip");
    setExpanded(null);
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const dryRun = () => {
    const parsed = parseImportContent(format, content, questionImportDescriptor.csvColumns);
    if (parsed.error) {
      setParseError(parsed.error);
      setReport(null);
      return;
    }
    setParseError(null);
    setReport(validateImport(questionImportDescriptor, parsed.rows, context));
    setStep("report");
  };

  const runImport = () => {
    if (!report?.ok) return;
    const records = report.rows.map((r) => r.record!).filter(Boolean);
    importer.mutate(
      { moduleId: context.moduleId, records, mode: mode === "update" ? "update" : "skip" },
      {
        onSuccess: (res) => {
          setOutcome(res);
          setStep("summary");
        },
      }
    );
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setFormat(file.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
  };

  const canImport = !!report?.ok && (report.duplicates === 0 || mode !== "cancel");

  const warningCount = useMemo(
    () => report?.rows.reduce((n, r) => n + r.warnings.length, 0) ?? 0,
    [report]
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            {context.moduleTitle} · nothing is written until the dry run passes.
          </DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(v) => setFormat(v as ImportFormat)}
                className="flex gap-6"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="json" /> JSON
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="csv" /> CSV
                </label>
              </RadioGroup>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,text/csv,application/json"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4 mr-1" />Upload file
              </Button>
              <span className="text-xs text-muted-foreground">or paste the content below</span>
            </div>

            <Textarea
              rows={12}
              className="font-mono text-xs"
              placeholder={format === "json" ? "[ { \"code\": \"QUA-KNW-001\", ... } ]" : "code,module,mission,..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            {parseError && <p className="text-xs text-destructive">{parseError}</p>}
          </div>
        )}

        {step === "report" && report && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-secondary text-foreground">
                {report.rows.length} questions detected
              </Badge>
              <Badge className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {report.valid} valid
              </Badge>
              {report.invalid > 0 && (
                <Badge variant="destructive">{report.invalid} with errors</Badge>
              )}
              {report.duplicates > 0 && (
                <Badge variant="outline">{report.duplicates} existing codes</Badge>
              )}
              {warningCount > 0 && <Badge variant="outline">{warningCount} warnings</Badge>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(report.distributions).map(([dim, buckets]) => (
                <div key={dim} className="rounded-lg border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground mb-1.5">{dim}</p>
                  <ul className="space-y-0.5">
                    {Object.entries(buckets)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <li key={k} className="flex justify-between text-xs text-muted-foreground">
                          <span>{k}</span>
                          <span className="tabular-nums text-foreground">{v}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>

            {report.duplicates > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {report.duplicates} question codes already exist in this module
                </p>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as DuplicateMode)} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="skip" /> Skip duplicates
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="update" /> Update existing
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="cancel" /> Cancel import
                  </label>
                </RadioGroup>
              </div>
            )}

            <div className="rounded-lg border divide-y">
              {report.rows.map((row) => (
                <div key={row.index} className="p-2.5">
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 text-left"
                    onClick={() => setExpanded(expanded === row.index ? null : row.index)}
                  >
                    {row.errors.length ? (
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        <span className="text-muted-foreground mr-2">{row.label}</span>
                        {row.record?.question_text ?? String(row.raw.question ?? "")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {row.record && (
                          <>
                            <Badge variant="outline" className="text-[10px]">
                              {row.record.mission_label ?? "No mission"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">{row.record.difficulty}</Badge>
                            <Badge variant="outline" className="text-[10px]">{row.record.category}</Badge>
                            <Badge variant="outline" className="text-[10px]">{row.record.status}</Badge>
                          </>
                        )}
                        {row.isDuplicate && <Badge variant="outline" className="text-[10px]">duplicate</Badge>}
                      </div>
                      {row.errors.map((e, i) => (
                        <p key={i} className="text-xs text-destructive mt-1">{e.message}</p>
                      ))}
                      {row.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-muted-foreground mt-1">{w.message}</p>
                      ))}
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                  {expanded === row.index && row.record && (
                    <div className="mt-2 pl-6 space-y-1 text-xs text-muted-foreground">
                      <p className="text-foreground font-medium">Options</p>
                      <ul className="list-disc pl-4">
                        {row.record.options_json.map((o, i) => <li key={i}>{o}</li>)}
                      </ul>
                      <p className="text-foreground font-medium mt-1">Correct answer</p>
                      <pre className="font-mono whitespace-pre-wrap">
                        {JSON.stringify(row.record.correct_answer_json)}
                      </pre>
                      {row.record.explanation && (
                        <>
                          <p className="text-foreground font-medium mt-1">Explanation</p>
                          <p>{row.record.explanation}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "summary" && outcome && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Import completed successfully.</p>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              <li>Imported: {outcome.inserted}</li>
              <li>Updated: {outcome.updated}</li>
              <li>Skipped: {outcome.skipped}</li>
              <li>Warnings: {warningCount}</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          {step === "source" && (
            <>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={dryRun} disabled={!content.trim()}>Run dry run</Button>
            </>
          )}
          {step === "report" && (
            <>
              <Button variant="outline" onClick={() => setStep("source")}>Back</Button>
              <Button
                onClick={runImport}
                disabled={!canImport || mode === "cancel" || importer.isPending}
              >
                {importer.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Import questions
              </Button>
            </>
          )}
          {step === "summary" && <Button onClick={() => close(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

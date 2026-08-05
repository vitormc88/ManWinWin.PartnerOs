import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Lock } from "lucide-react";
import { AnalyticsAttemptDetail } from "@/components/academy/AnalyticsAttemptDetail";
import { AcademyBreadcrumbs } from "@/components/academy/AcademyBreadcrumbs";
import {
  useAcademyAnalyticsPerms,
  useAcademyLearnerProfile,
  useAcademyLearners,
  useAcademyOverview,
  useAcademyPartnerAnalytics,
  useAcademyQuestionAnalytics,
} from "@/hooks/useAcademyAnalytics";
import {
  QUESTION_FLAG_LABELS,
  daysSince,
  downloadCsv,
  formatDateTime,
  formatPct,
  questionFlag,
  toCsv,
  type AcademyAnalyticsFilters,
} from "@/lib/academy-analytics";
import { ROLE_OPTIONS } from "@/lib/permissions";

const ALL = "all";

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Denied({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" /> {message}
      </CardContent>
    </Card>
  );
}

export default function AcademyAnalytics() {
  const navigate = useNavigate();
  const { data: perms, isLoading: permsLoading } = useAcademyAnalyticsPerms();
  const canView = !!perms?.academy_analytics_view;

  const [tab, setTab] = useState("overview");
  const [partnerId, setPartnerId] = useState<string>(ALL);
  const [moduleId, setModuleId] = useState<string>(ALL);
  const [country, setCountry] = useState<string>(ALL);
  const [role, setRole] = useState<string>(ALL);
  const [certStatus, setCertStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  const filters: AcademyAnalyticsFilters = useMemo(
    () => ({
      partner_id: partnerId === ALL ? null : partnerId,
      module_id: moduleId === ALL ? null : moduleId,
      country: country === ALL ? null : country,
      role: role === ALL ? null : role,
      certification_status: certStatus === ALL ? null : (certStatus as "passed" | "not_passed"),
    }),
    [partnerId, moduleId, country, role, certStatus]
  );

  const overview = useAcademyOverview(filters, canView);
  const partners = useAcademyPartnerAnalytics(filters, canView && tab === "partners");
  const learners = useAcademyLearners(filters, canView && (tab === "users" || !!selectedUser));
  const profile = useAcademyLearnerProfile(selectedUser ?? undefined);
  const questions = useAcademyQuestionAnalytics(
    moduleId === ALL ? null : moduleId,
    !!perms?.academy_question_analytics_view && tab === "questions"
  );

  const partnerOptions = overview.data?.by_partner ?? [];
  const moduleOptions = overview.data?.by_module ?? [];
  const countryOptions = [...new Set(partnerOptions.map((p) => p.country).filter(Boolean))] as string[];

  const filteredLearners = (learners.data ?? []).filter((l) =>
    search ? `${l.full_name} ${l.email ?? ""}`.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="space-y-6">
        <AcademyBreadcrumbs
          items={[{ label: "Partner Academy", to: "/academy" }, { label: "Learning Analytics" }]}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate("/academy")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Partner Academy
            </Button>
            <h1 className="text-2xl font-semibold text-foreground">Learning Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Adoption, progress and certification quality across the Academy.
            </p>
          </div>
        </div>

        {permsLoading && <Skeleton className="h-40 w-full" />}

        {!permsLoading && !canView && (
          <Denied message="You do not have permission to view Academy analytics." />
        )}

        {canView && (
          <>
            <Card>
              <CardContent className="flex flex-wrap gap-3 p-4">
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Partner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All partners</SelectItem>
                    {partnerOptions.map((p) => (
                      <SelectItem key={p.partner_id ?? "hq"} value={p.partner_id ?? "hq"}>
                        {p.partner_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={moduleId} onValueChange={setModuleId}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Module" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All modules</SelectItem>
                    {moduleOptions.map((m) => (
                      <SelectItem key={m.module_id} value={m.module_id}>{m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Country" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All countries</SelectItem>
                    {countryOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All roles</SelectItem>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={certStatus} onValueChange={setCertStatus}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Certification" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any certification status</SelectItem>
                    <SelectItem value="passed">Certified</SelectItem>
                    <SelectItem value="not_passed">Not certified</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="partners">Partners</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="questions">Questions</TabsTrigger>
              </TabsList>

              {/* ── Overview ─────────────────────────────────────────── */}
              <TabsContent value="overview" className="space-y-4">
                {overview.isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : overview.isError ? (
                  <Denied message={(overview.error as Error)?.message ?? "Unable to load analytics."} />
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Kpi label="Active learners" value={overview.data!.total_active_learners} hint={`${overview.data!.total_learners} in scope`} />
                      <Kpi label="Modules started" value={overview.data!.modules_started} />
                      <Kpi label="Modules completed" value={overview.data!.modules_completed} />
                      <Kpi label="Certifications passed" value={overview.data!.certifications_passed} />
                      <Kpi label="Pass rate" value={formatPct(overview.data!.pass_rate)} hint={`${overview.data!.attempts_total} attempts`} />
                      <Kpi label="Average score" value={formatPct(overview.data!.average_score)} />
                      <Kpi label="Avg attempts to pass" value={overview.data!.average_attempts_before_passing} />
                      <Kpi
                        label="Inactive learners"
                        value={overview.data!.inactive_14}
                        hint={`7d ${overview.data!.inactive_7} · 30d ${overview.data!.inactive_30}`}
                      />
                    </div>

                    <Card>
                      <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">Module completion</CardTitle>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadCsv("academy-modules", toCsv(overview.data!.by_module as any))}
                        >
                          <Download className="mr-2 h-4 w-4" /> CSV
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Module</TableHead>
                              <TableHead className="text-right">Started</TableHead>
                              <TableHead className="text-right">Completed</TableHead>
                              <TableHead className="text-right">Avg progress</TableHead>
                              <TableHead className="text-right">Certified</TableHead>
                              <TableHead className="text-right">Pass rate</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {overview.data!.by_module.map((m) => (
                              <TableRow key={m.module_id}>
                                <TableCell className="font-medium">{m.title}</TableCell>
                                <TableCell className="text-right">{m.started}</TableCell>
                                <TableCell className="text-right">{m.completed}</TableCell>
                                <TableCell className="text-right">{formatPct(m.avg_progress)}</TableCell>
                                <TableCell className="text-right">{m.certifications_passed}</TableCell>
                                <TableCell className="text-right">{formatPct(m.pass_rate)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* ── Partners ─────────────────────────────────────────── */}
              <TabsContent value="partners">
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Partner progress</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!partners.data?.length}
                      onClick={() => downloadCsv("academy-partners", toCsv((partners.data ?? []) as any))}
                    >
                      <Download className="mr-2 h-4 w-4" /> CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {partners.isLoading ? (
                      <Skeleton className="h-40 w-full" />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Partner</TableHead>
                            <TableHead>Country</TableHead>
                            <TableHead className="text-right">Users</TableHead>
                            <TableHead className="text-right">Active (30d)</TableHead>
                            <TableHead className="w-[160px]">Avg progress</TableHead>
                            <TableHead className="text-right">Certified</TableHead>
                            <TableHead className="text-right">Pass rate</TableHead>
                            <TableHead className="text-right">Needs attention</TableHead>
                            <TableHead>Last activity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(partners.data ?? []).map((p) => (
                            <TableRow
                              key={p.partner_id ?? "hq"}
                              className="cursor-pointer"
                              onClick={() => {
                                setPartnerId(p.partner_id ?? ALL);
                                setTab("users");
                              }}
                            >
                              <TableCell className="font-medium">{p.partner_name}</TableCell>
                              <TableCell>{p.country ?? "—"}</TableCell>
                              <TableCell className="text-right">{p.total_users}</TableCell>
                              <TableCell className="text-right">{p.active_users}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={p.avg_progress} className="h-2" />
                                  <span className="text-xs text-muted-foreground">{formatPct(p.avg_progress)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{p.certifications_passed}</TableCell>
                              <TableCell className="text-right">{formatPct(p.pass_rate)}</TableCell>
                              <TableCell className="text-right">
                                {p.users_requiring_attention > 0 ? (
                                  <Badge variant="destructive">{p.users_requiring_attention}</Badge>
                                ) : (
                                  "0"
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDateTime(p.last_activity)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Users ────────────────────────────────────────────── */}
              <TabsContent value="users" className="space-y-4">
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                    <CardTitle className="text-base">Learners</CardTitle>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Search name or email"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-56"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!filteredLearners.length}
                        onClick={() => downloadCsv("academy-learners", toCsv(filteredLearners as any))}
                      >
                        <Download className="mr-2 h-4 w-4" /> CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {learners.isLoading ? (
                      <Skeleton className="h-40 w-full" />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Learner</TableHead>
                            <TableHead>Partner</TableHead>
                            <TableHead className="w-[160px]">Avg progress</TableHead>
                            <TableHead className="text-right">Completed</TableHead>
                            <TableHead className="text-right">Certified</TableHead>
                            <TableHead className="text-right">Attempts</TableHead>
                            <TableHead>Last activity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredLearners.map((l) => {
                            const d = daysSince(l.last_activity);
                            return (
                              <TableRow
                                key={l.user_id}
                                className="cursor-pointer"
                                onClick={() => setSelectedUser(l.user_id)}
                              >
                                <TableCell>
                                  <p className="font-medium text-foreground">{l.full_name}</p>
                                  <p className="text-xs text-muted-foreground">{l.email}</p>
                                </TableCell>
                                <TableCell>{l.partner_name}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={l.avg_progress} className="h-2" />
                                    <span className="text-xs text-muted-foreground">{formatPct(l.avg_progress)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{l.modules_completed}</TableCell>
                                <TableCell className="text-right">{l.certifications_passed}</TableCell>
                                <TableCell className="text-right">{l.attempts}</TableCell>
                                <TableCell className="text-xs">
                                  {d !== null && d >= 14 ? (
                                    <Badge variant="destructive">{d}d inactive</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">{formatDateTime(l.last_activity)}</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {selectedUser && (
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-base">
                        {profile.data?.full_name ?? "Learner"} — learning profile
                      </CardTitle>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>
                        Close
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {profile.isLoading && <Skeleton className="h-40 w-full" />}
                      {profile.data && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-4">
                            <Kpi label="Partner" value={profile.data.partner_name} />
                            <Kpi label="Learning time" value={`${profile.data.learning_minutes} min`} />
                            <Kpi label="Last activity" value={formatDateTime(profile.data.last_activity)} />
                            <Kpi label="Next retake" value={formatDateTime(profile.data.next_retake_at)} />
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-medium text-foreground">Modules</p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Module</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="w-[160px]">Progress</TableHead>
                                  <TableHead>Completed</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {profile.data.modules.map((m) => (
                                  <TableRow key={m.module_id}>
                                    <TableCell className="font-medium">{m.title}</TableCell>
                                    <TableCell>
                                      <Badge variant={m.certified ? "default" : "secondary"}>
                                        {m.certified ? "certified" : m.status.replace(/_/g, " ")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Progress value={m.progress_pct} className="h-2" />
                                        <span className="text-xs text-muted-foreground">{m.progress_pct}%</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {formatDateTime(m.completed_at)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-medium text-foreground">Certification attempts</p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>#</TableHead>
                                  <TableHead>Module</TableHead>
                                  <TableHead>Result</TableHead>
                                  <TableHead className="text-right">Total</TableHead>
                                  <TableHead className="text-right">Scenario</TableHead>
                                  <TableHead>Submitted</TableHead>
                                  <TableHead />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {profile.data.attempts.map((a) => (
                                  <TableRow key={a.attempt_id}>
                                    <TableCell>{a.attempt_number}</TableCell>
                                    <TableCell>{a.module_title}</TableCell>
                                    <TableCell>
                                      <Badge variant={a.passed ? "default" : "destructive"}>
                                        {a.status === "in_progress" ? "in progress" : a.passed ? "passed" : "failed"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{formatPct(a.weighted_score)}</TableCell>
                                    <TableCell className="text-right">{formatPct(a.scenario_score)}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {formatDateTime(a.submitted_at)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!perms?.academy_attempt_detail_view || a.status === "in_progress"}
                                        onClick={() => setAttemptId(a.attempt_id)}
                                      >
                                        Detail
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            {!perms?.academy_attempt_detail_view && (
                              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <Lock className="h-3.5 w-3.5" /> Attempt details require the
                                “Open attempt detail” permission.
                              </p>
                            )}
                          </div>

                          {profile.data.weak_missions.length > 0 && (
                            <div>
                              <p className="mb-2 text-sm font-medium text-foreground">Weak areas</p>
                              <div className="flex flex-wrap gap-2">
                                {profile.data.weak_missions.map((w) => (
                                  <Badge key={w.mission_id} variant="secondary">
                                    {w.title} · {w.missed} missed
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ── Questions ────────────────────────────────────────── */}
              <TabsContent value="questions">
                {!perms?.academy_question_analytics_view ? (
                  <Denied message="You do not have permission to view question analytics." />
                ) : (
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-base">Question performance</CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!questions.data?.length}
                        onClick={() =>
                          downloadCsv(
                            "academy-questions",
                            toCsv(
                              (questions.data ?? []).map((q) => ({
                                question_code: q.question_code ?? "",
                                question_text: q.question_text,
                                module: q.module_title ?? "",
                                mission: q.mission_title ?? "",
                                category: q.category,
                                type: q.question_type,
                                difficulty: q.difficulty,
                                times_used: q.times_used,
                                times_answered: q.times_answered,
                                correct_rate: q.correct_rate ?? "",
                                avg_response_seconds: q.avg_response_seconds ?? "",
                                flag: questionFlag(q) ?? "",
                              }))
                            )
                          )
                        }
                      >
                        <Download className="mr-2 h-4 w-4" /> CSV
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {questions.isLoading ? (
                        <Skeleton className="h-40 w-full" />
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Question</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Difficulty</TableHead>
                              <TableHead className="text-right">Used</TableHead>
                              <TableHead className="text-right">Answered</TableHead>
                              <TableHead className="text-right">Correct</TableHead>
                              <TableHead className="text-right">Avg time</TableHead>
                              <TableHead>Signal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(questions.data ?? []).map((q) => {
                              const flag = questionFlag(q);
                              return (
                                <TableRow key={q.question_id}>
                                  <TableCell className="max-w-[360px]">
                                    <p className="truncate font-medium text-foreground">{q.question_text}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {q.question_code} · {q.mission_title ?? q.module_title}
                                    </p>
                                  </TableCell>
                                  <TableCell>{q.category}</TableCell>
                                  <TableCell>{q.difficulty}</TableCell>
                                  <TableCell className="text-right">{q.times_used}</TableCell>
                                  <TableCell className="text-right">{q.times_answered}</TableCell>
                                  <TableCell className="text-right">{formatPct(q.correct_rate)}</TableCell>
                                  <TableCell className="text-right">
                                    {q.avg_response_seconds !== null ? `${q.avg_response_seconds}s` : "—"}
                                  </TableCell>
                                  <TableCell>
                                    {flag ? (
                                      <Badge variant={flag === "unused" ? "secondary" : "destructive"}>
                                        {QUESTION_FLAG_LABELS[flag]}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Healthy</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        <AnalyticsAttemptDetail attemptId={attemptId} onOpenChange={(o) => !o && setAttemptId(null)} />
  </div>
  );
}

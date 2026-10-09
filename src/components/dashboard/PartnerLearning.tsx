import { Link } from "react-router-dom";
import {
  useAcademyModules,
  useAcademyMissions,
  useMyMissionProgress,
} from "@/hooks/useAcademy";
import { moduleProgressPct, countableMissions } from "@/lib/academy";

export function PartnerLearning({
  academy,
  certifications,
}: {
  academy: boolean;
  certifications: boolean;
}) {
  const modules = useAcademyModules(academy);
  const missions = useAcademyMissions(undefined, academy);
  const progress = useMyMissionProgress(academy);
  const complete = new Set(
    (progress.data ?? [])
      .filter((p) => p.is_completed)
      .map((p) => p.mission_id),
  );
  const recommended = [...(modules.data ?? [])]
    .filter((m) => m.status === "published")
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((m) => {
      const items = (missions.data ?? []).filter((x) => x.module_id === m.id);
      return (
        countableMissions(items).length > 0 &&
        moduleProgressPct(items, complete) < 100
      );
    });
  const loading = modules.isLoading || missions.isLoading || progress.isLoading;
  const error = modules.isError || missions.isError || progress.isError;
  return (
    <section className="bg-card rounded-xl border p-5 space-y-2">
      <h2 className="font-semibold">Develop your skills</h2>
      {academy &&
        (error ? (
          <p role="alert">
            Learning progress unavailable.{" "}
            <button
              className="underline text-primary"
              onClick={() => {
                void modules.refetch();
                void missions.refetch();
                void progress.refetch();
              }}
            >
              Retry
            </button>
          </p>
        ) : loading ? (
          <p aria-busy="true">Loading your learning progress…</p>
        ) : recommended ? (
          <>
            <p className="text-sm">
              Next recommended module: <strong>{recommended.title}</strong>
            </p>
            <Link
              className="text-primary underline"
              to={`/academy/modules/${recommended.slug}`}
            >
              Continue learning
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No incomplete published module with available missions. Explore
            Academy for your next learning activity.
          </p>
        ))}
      {academy && (
        <Link className="text-primary underline mr-4" to="/academy">
          Partner Academy
        </Link>
      )}
      {certifications && (
        <Link className="text-primary underline" to="/certifications">
          My certifications
        </Link>
      )}
    </section>
  );
}

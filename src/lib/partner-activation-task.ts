export type ExistingProspectTask = {
  title: string;
  task_status: string;
  due_date: string | null;
};

const finalStatuses = new Set(["done", "completed", "cancelled", "canceled"]);

export function firstValueTaskIssue(
  milestone: string,
  dueDate: string,
  existing: ExistingProspectTask[],
): string | null {
  const text = milestone.trim();
  if (text.length < 5) return "Define a first-value milestone of at least 5 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "Choose a due date for this action.";
  const parsed = new Date(dueDate + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate)
    return "Choose a valid due date.";
  const title = "Partner activation: " + text;
  const isDuplicate = existing.some(task =>
    !finalStatuses.has((task.task_status || "").toLowerCase())
    && task.title.trim().toLowerCase() === title.toLowerCase()
  );
  if (isDuplicate) return "An open first-value task already exists for this milestone. Complete or update the existing task first.";
  return null;
}

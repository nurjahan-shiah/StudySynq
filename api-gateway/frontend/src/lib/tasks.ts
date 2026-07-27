// US-E.3 — shared display helpers for tasks
import type { TaskStatus, TaskPriority } from "./types";

/**
 * Urgency styling for a due date:
 *   overdue (past, not completed)      → red + "Overdue" flag
 *   due within a week (approaching)    → yellow
 *   otherwise / completed / no date    → default grey
 */
export function dueMeta(iso: string | null, status: TaskStatus): { color: string; overdue: boolean } {
  const DEFAULT = { color: "var(--text2)", overdue: false };
  if (!iso || status === "completed") return DEFAULT;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return DEFAULT;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const days = Math.round((dueDay.getTime() - startOfToday.getTime()) / 86400000);
  if (days < 0) return { color: "var(--ss-red)", overdue: true };   // overdue
  if (days <= 7) return { color: "var(--ss-yellow)", overdue: false }; // this week / approaching
  return DEFAULT;
}

export const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo:        { label: "To Do",       color: "var(--text2)" },
  in_progress: { label: "In Progress", color: "var(--ss-blue)" },
  completed:   { label: "Completed",   color: "var(--ss-green)" },
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "completed"];

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "var(--text2)" },
  medium: { label: "Medium", color: "var(--ss-yellow)" },
  high:   { label: "High",   color: "var(--ss-red)" },
};

/** Short due date, e.g. "Jul 5". Returns "" when there's no due date. */
export function fmtDue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

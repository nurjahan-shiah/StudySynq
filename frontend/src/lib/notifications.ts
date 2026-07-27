// US-E.1 — shared display helpers for the Notification Centre
import type { NotificationType } from "./types";

export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { label: string; icon: string; color: string }
> = {
  session:        { label: "Session",      icon: "▦", color: "var(--ss-blue)" },
  announcement:   { label: "Announcement", icon: "📢", color: "var(--ss-yellow)" },
  task:           { label: "Task",         icon: "✓", color: "var(--ss-green)" },
  resource:       { label: "Resource",     icon: "⊟", color: "var(--ss-red)" },
  group_activity: { label: "Group",        icon: "⚇", color: "var(--ss-blue)" },
  social:         { label: "Campus feed",  icon: "◈", color: "var(--ss-yellow)" },
  system:         { label: "System",       icon: "⚙", color: "var(--text2)" },
};

/** Short relative timestamp, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

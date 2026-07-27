"use client";

/**
 * components/GroupSessionsCalendar.tsx — US-C.2
 * Sessions tab content for a single group: a visual calendar of that group's
 * sessions, switchable between Month and Week views, color-coded by status,
 * with click-to-view-details. Wired into groups/[id]/page.tsx's "sessions" tab.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useGroupSessions, type StudySession } from "@/lib/hooks";

const T = {
  card:   "var(--card-bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

type ViewMode = "month" | "week";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function monthGrid(cursor: Date): Date[] {
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function weekGrid(cursor: Date): Date[] {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function statusOf(session: StudySession): "cancelled" | "upcoming" | "past" {
  if (session.is_cancelled) return "cancelled";
  return new Date(session.scheduled_at) >= new Date() ? "upcoming" : "past";
}

const STATUS_COLOR: Record<ReturnType<typeof statusOf>, string> = {
  upcoming:  T.red,
  past:      T.text2,
  cancelled: T.text2,
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

function SessionChip({ session, dense, onClick }: { session: StudySession; dense?: boolean; onClick: () => void }) {
  const status = statusOf(session);
  const color = STATUS_COLOR[status];
  return (
    <button
      onClick={onClick}
      title={`${session.title} — ${formatTime(session.scheduled_at)}${status === "cancelled" ? " (Cancelled)" : ""}`}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: dense ? "1px 6px" : "3px 7px",
        borderRadius: 6, fontSize: dense ? 10 : 11, fontWeight: 600,
        border: "none", cursor: "pointer",
        background: `${color}18`, color,
        textDecoration: status === "cancelled" ? "line-through" : "none",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        marginBottom: 2,
      }}
    >
      {dense ? session.title : `${formatTime(session.scheduled_at)} · ${session.title}`}
    </button>
  );
}

function Legend() {
  const items: { label: string; color: string; strike?: boolean }[] = [
    { label: "Upcoming",  color: T.red },
    { label: "Past",      color: T.text2 },
    { label: "Cancelled", color: T.text2, strike: true },
  ];
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: T.text2, textDecoration: it.strike ? "line-through" : "none" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function GroupSessionsCalendar({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { data: sessions, loading, error } = useGroupSessions(groupId);
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, StudySession[]>();
    for (const s of sessions ?? []) {
      const key = dayKey(new Date(s.scheduled_at));
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    }
    return map;
  }, [sessions]);

  const days = view === "month" ? monthGrid(cursor) : weekGrid(cursor);
  const today = new Date();

  const title = useMemo(() => {
    if (view === "month") {
      return cursor.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
    }
    const week = weekGrid(cursor);
    const start = week[0], end = week[6];
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString("en-CA", sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }, [cursor, view]);

  function step(delta: number) {
    if (view === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    } else {
      setCursor(addDays(cursor, delta * 7));
    }
  }

  function goToDay(d: Date) {
    setCursor(d);
    setView("week");
  }

  const navBtn: CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`,
    background: "transparent", color: T.text, cursor: "pointer", fontSize: 13,
  };
  const toggleBtn = (active: boolean): CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? T.red : T.border}`,
    background: active ? `${T.red}15` : "transparent",
    color: active ? T.red : T.text2,
  });

  if (loading) {
    return <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>;
  }
  if (error) {
    return <p style={{ color: T.red, fontSize: 13 }}>{error}</p>;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header: nav + view toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => step(-1)} style={navBtn}>‹</button>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, minWidth: 160 }}>{title}</h2>
          <button onClick={() => step(1)} style={navBtn}>›</button>
          <button onClick={() => setCursor(new Date())} style={{ ...navBtn, width: "auto", padding: "0 10px", fontSize: 11, fontWeight: 600 }}>
            Today
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setView("month")} style={toggleBtn(view === "month")}>Month</button>
          <button onClick={() => setView("week")} style={toggleBtn(view === "week")}>Week</button>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Legend />
      </div>

      {/* Weekday header row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6,
        gridAutoRows: view === "month" ? 96 : 220,
      }}>
        {days.map((d) => {
          const key = dayKey(d);
          const daySessions = byDay.get(key) ?? [];
          const isToday = key === dayKey(today);
          const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
          const visible = view === "month" ? daySessions.slice(0, MAX_CHIPS_PER_DAY) : daySessions;
          const overflow = view === "month" ? daySessions.length - visible.length : 0;

          return (
            <div
              key={key}
              style={{
                border: `1px solid ${isToday ? T.red : T.border}`,
                borderRadius: 10, padding: 6,
                background: inMonth ? T.card : T.bg2,
                opacity: inMonth ? 1 : 0.5,
                display: "flex", flexDirection: "column", overflow: "hidden",
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: isToday ? 700 : 500,
                color: isToday ? T.red : T.text2, marginBottom: 4, flexShrink: 0,
              }}>
                {view === "week"
                  ? d.toLocaleDateString("en-CA", { weekday: "short", day: "numeric" })
                  : d.getDate()}
              </span>
              <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                {visible.map((s) => (
                  <SessionChip
                    key={s.id}
                    session={s}
                    dense={view === "month"}
                    onClick={() => router.push(`/sessions/${s.id}`)}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => goToDay(d)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "1px 6px",
                      border: "none", background: "transparent", color: T.text2,
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(sessions ?? []).length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 140, gap: 10, color: T.text2 }}>
          <span style={{ fontSize: 28 }}>▦</span>
          <p style={{ fontSize: 14, margin: 0 }}>No sessions scheduled for this group yet.</p>
        </div>
      )}
    </div>
  );
}

export default GroupSessionsCalendar;

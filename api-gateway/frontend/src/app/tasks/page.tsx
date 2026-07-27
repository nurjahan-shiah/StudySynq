"use client";

/**
 * /tasks — the logged-in user's personal task list (US-E.3).
 * Shows every task assigned to them across all groups, with a status control
 * and a one-click "Mark as Completed".
 */

import { useEffect, useState, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import { useMyTasks, type Task } from "@/lib/hooks";
import type { TaskStatus } from "@/lib/types";
import { STATUS_META, STATUS_ORDER, PRIORITY_META, fmtDue, dueMeta } from "@/lib/tasks";

const T = {
  bg:     "var(--bg)",
  card:   "var(--card-bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  green:  "var(--ss-green)",
} as const;

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      textTransform: "uppercase", letterSpacing: "0.04em",
      color, background: `color-mix(in srgb, ${color} 16%, transparent)`,
    }}>
      {label}
    </span>
  );
}

export default function MyTasksPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  const { data, loading, refetch } = useMyTasks(userId);
  const tasks = data ?? [];
  const openCount = tasks.filter((t) => t.status !== "completed").length;

  async function setStatus(t: Task, status: TaskStatus) {
    await apiClient.patch(`/tasks/${t.id}/status`, { status });
    refetch();
  }

  const selectStyle: CSSProperties = {
    padding: "5px 9px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    border: `1px solid ${T.border}`, background: T.bg2, color: T.text, cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>My tasks</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {loading ? (
          <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
        ) : tasks.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 10, color: T.text2 }}>
            <span style={{ fontSize: 32 }}>✓</span>
            <p style={{ fontSize: 14, margin: 0 }}>No tasks assigned to you.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: T.text2, margin: "0 0 16px" }}>
              {openCount} open · {tasks.length - openCount} completed
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
              {tasks.map((t) => {
                const dm = dueMeta(t.due_date, t.status);
                return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px",
                  opacity: t.status === "completed" ? 0.7 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 14, fontWeight: 700, color: T.text,
                        textDecoration: t.status === "completed" ? "line-through" : "none",
                      }}>
                        {t.title}
                      </span>
                      <Chip label={PRIORITY_META[t.priority].label} color={PRIORITY_META[t.priority].color} />
                    </div>
                    {t.description && (
                      <p style={{ fontSize: 12, color: T.text2, margin: "0 0 6px", whiteSpace: "pre-wrap" }}>{t.description}</p>
                    )}
                    <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
                      {t.group_name}
                      {t.due_date && (
                        <span style={{ color: dm.color, fontWeight: dm.color === "var(--text2)" ? 400 : 700 }}>
                          {" · "}due {fmtDue(t.due_date)}{dm.overdue ? " · Overdue" : ""}
                        </span>
                      )}
                      {" · assigned by "}{t.assigned_by_name}
                    </p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                    <select
                      value={t.status}
                      onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
                      style={{ ...selectStyle, color: STATUS_META[t.status].color }}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s} style={{ color: T.text }}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                    {t.status !== "completed" && (
                      <button
                        onClick={() => setStatus(t, "completed")}
                        style={{
                          padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                          border: "none", background: T.green, color: "#fff", cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        ✓ Mark completed
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

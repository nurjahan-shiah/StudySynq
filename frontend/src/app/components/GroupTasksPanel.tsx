"use client";

/**
 * components/GroupTasksPanel.tsx — US-E.3
 * Tasks tab content for a single group. Leaders can assign tasks to members and
 * see/delete the whole board; members can update the status of tasks assigned to
 * them. Wired into groups/[id]/page.tsx's "tasks" tab.
 */

import { useState, CSSProperties } from "react";
import { apiClient } from "@/lib/apiClient";
import { useGroupTasks, useGroupMembers, type Task } from "@/lib/hooks";
import type { TaskStatus } from "@/lib/types";
import { STATUS_META, STATUS_ORDER, PRIORITY_META, fmtDue, dueMeta } from "@/lib/tasks";

const T = {
  card:   "var(--card-bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
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

const selectStyle: CSSProperties = {
  padding: "4px 8px", borderRadius: 7, fontSize: 12, fontWeight: 600,
  border: `1px solid ${T.border}`, background: T.bg2, color: T.text, cursor: "pointer",
};

export function GroupTasksPanel({
  groupId,
  canManage,
  userId,
}: {
  groupId: string;
  /** true for group leader or admin — can assign and delete tasks */
  canManage: boolean;
  userId: string;
}) {
  const { data: tasks, loading, refetch } = useGroupTasks(groupId);
  const { data: members } = useGroupMembers(groupId);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("medium");

  function resetForm() {
    setCreating(false); setEditingId(null);
    setTitle(""); setDescription(""); setAssignee(""); setDue(""); setPriority("medium");
  }

  function startCreate() {
    resetForm();
    setCreating(true);
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setTitle(t.title);
    setDescription(t.description ?? "");
    setAssignee(t.assigned_to);
    setDue(t.due_date ? t.due_date.slice(0, 10) : "");   // ISO datetime → yyyy-mm-dd for <input type=date>
    setPriority(t.priority);
    setCreating(true);
  }

  async function submitForm() {
    if (!title.trim() || !assignee) return;
    setSaving(true);
    const body = { title, description, priority, assigned_to: assignee, due_date: due ? due : null };
    if (editingId) {
      await apiClient.patch(`/tasks/${editingId}`, body);
    } else {
      await apiClient.post(`/groups/${groupId}/tasks`, body);
    }
    setSaving(false);
    resetForm();
    refetch();
  }

  async function setStatus(t: Task, status: TaskStatus) {
    await apiClient.patch(`/tasks/${t.id}/status`, { status });
    refetch();
  }

  async function remove(t: Task) {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    await apiClient.delete(`/tasks/${t.id}`);
    refetch();
  }

  const btn = (variant: "primary" | "ghost"): CSSProperties => ({
    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: variant === "primary" ? "none" : `1px solid ${T.border}`,
    background: variant === "primary" ? T.red : "transparent",
    color: variant === "primary" ? "#fff" : T.text,
  });
  const input: CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, marginBottom: 10,
    border: `1px solid ${T.border}`, background: T.bg2, color: T.text,
    fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  const list = tasks ?? [];

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: T.text2, margin: 0 }}>
          {list.length} task{list.length === 1 ? "" : "s"}
        </p>
        {canManage && !creating && (
          <button onClick={startCreate} style={btn("primary")}>+ Assign Task</button>
        )}
      </div>

      {/* Assign form (leaders only) */}
      {canManage && creating && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <input style={{ ...input, fontWeight: 600, fontSize: 14 }} placeholder="Task title"
                 value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea style={{ ...input, resize: "vertical" }} rows={3}
                    placeholder="Description (optional) — e.g. Prepare 10 practice questions for chapters 3 and 4."
                    value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: T.text2 }}>
              Assign to
              <select style={selectStyle} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Select member…</option>
                {(members ?? []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user_name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: T.text2 }}>
              Due date
              <input type="date" style={selectStyle} value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: T.text2 }}>
              Priority
              <select style={selectStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={resetForm} style={btn("ghost")} disabled={saving}>Cancel</button>
            <button onClick={submitForm} style={btn("primary")} disabled={saving || !title.trim() || !assignee}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Assign task"}
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      {loading ? (
        <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
      ) : list.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, gap: 10, color: T.text2 }}>
          <span style={{ fontSize: 28 }}>✓</span>
          <p style={{ fontSize: 14, margin: 0 }}>No tasks yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((t) => {
            const isMine = t.assigned_to === userId;
            const canSetStatus = isMine || canManage;
            const dm = dueMeta(t.due_date, t.status);
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 14, fontWeight: 600, color: T.text,
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
                    {t.assigned_to_name}
                    {t.due_date && (
                      <>
                        {" · "}
                        <span style={{ color: dm.color, fontWeight: dm.color === "var(--text2)" ? 400 : 700 }}>
                          due {fmtDue(t.due_date)}{dm.overdue ? " · Overdue" : ""}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  {canSetStatus ? (
                    <select
                      value={t.status}
                      onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
                      style={{ ...selectStyle, color: STATUS_META[t.status].color }}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s} style={{ color: T.text }}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                  ) : (
                    <Chip label={STATUS_META[t.status].label} color={STATUS_META[t.status].color} />
                  )}
                  {canManage && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(t)} style={{
                        padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: `1px solid ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer",
                      }}>
                        Edit
                      </button>
                      <button onClick={() => remove(t)} style={{
                        padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: `1px solid ${T.border}`, background: "transparent", color: T.red, cursor: "pointer",
                      }}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GroupTasksPanel;

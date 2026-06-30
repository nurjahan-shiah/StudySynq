"use client";

/**
 * components/AnnouncementBoard.tsx — US-E.2
 * A group's announcement feed. Members see a read-only list (pinned first);
 * leaders also get create / edit / pin / delete controls.
 */

import { useState, CSSProperties } from "react";
import { apiClient } from "@/lib/apiClient";
import { useGroupAnnouncements, type Announcement } from "@/lib/hooks";

const T = {
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  yellow: "var(--ss-yellow)",
} as const;

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

interface FormState {
  id: string | null; // null = creating, otherwise editing
  title: string;
  message: string;
  is_pinned: boolean;
}

const EMPTY_FORM: FormState = { id: null, title: "", message: "", is_pinned: false };

export function AnnouncementBoard({ groupId, isLeader }: { groupId: string; isLeader: boolean }) {
  const { data, loading, error, refetch } = useGroupAnnouncements(groupId);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const announcements = data ?? [];

  async function submitForm() {
    if (!form || !form.title.trim() || !form.message.trim()) return;
    setSaving(true);
    if (form.id) {
      await apiClient.patch(`/announcements/${form.id}`, {
        title: form.title, message: form.message, is_pinned: form.is_pinned,
      });
    } else {
      await apiClient.post(`/groups/${groupId}/announcements`, {
        title: form.title, message: form.message, is_pinned: form.is_pinned,
      });
    }
    setSaving(false);
    setForm(null);
    refetch();
  }

  async function togglePin(a: Announcement) {
    await apiClient.patch(`/announcements/${a.id}`, { is_pinned: !a.is_pinned });
    refetch();
  }

  async function remove(a: Announcement) {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    await apiClient.delete(`/announcements/${a.id}`);
    refetch();
  }

  const btn = (variant: "primary" | "ghost"): CSSProperties => ({
    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer",
    border: variant === "primary" ? "none" : `1px solid ${T.border}`,
    background: variant === "primary" ? T.red : "transparent",
    color: variant === "primary" ? "#fff" : T.text,
  });

  const smallBtn: React.CSSProperties = {
    padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
    border: `1px solid ${T.border}`, background: "transparent",
    color: T.text2, cursor: "pointer",
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: T.text2, margin: 0 }}>
          {announcements.length} announcement{announcements.length === 1 ? "" : "s"}
        </p>
        {isLeader && !form && (
          <button onClick={() => setForm({ ...EMPTY_FORM })} style={btn("primary")}>
            + Create Announcement
          </button>
        )}
      </div>

      {/* Create / edit form */}
      {form && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: 16, marginBottom: 18,
        }}>
          <input
            type="text"
            placeholder="Announcement title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 8, marginBottom: 10,
              border: `1px solid ${T.border}`, background: T.bg2, color: T.text,
              fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box",
            }}
          />
          <textarea
            placeholder="Write your update… (e.g. Midterm review moved to Friday at 5 PM. Upload practice questions by Thursday.)"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={4}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 8, marginBottom: 10,
              border: `1px solid ${T.border}`, background: T.bg2, color: T.text,
              fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: T.text2, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
              />
              📌 Pin this announcement
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setForm(null)} style={btn("ghost")} disabled={saving}>Cancel</button>
              <button onClick={submitForm} style={btn("primary")} disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save changes" : "Post announcement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
      ) : error ? (
        <p style={{ color: T.red, fontSize: 13 }}>{error}</p>
      ) : announcements.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: 200, gap: 10, color: T.text2,
        }}>
          <span style={{ fontSize: 30 }}>📣</span>
          <p style={{ fontSize: 14, margin: 0 }}>No announcements yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
          {announcements.map((a) => (
            <div
              key={a.id}
              style={{
                background: T.card,
                border: `1px solid ${a.is_pinned ? T.yellow : T.border}`,
                borderRadius: 12, padding: "14px 16px",
              }}
            >
              {a.is_pinned && (
                <span style={{
                  display: "inline-block", fontSize: 10, fontWeight: 700, color: "#9a7d18",
                  background: `${T.yellow}33`, padding: "2px 8px", borderRadius: 20,
                  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
                }}>
                  📌 Pinned
                </span>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>{a.title}</h3>
                {isLeader && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => togglePin(a)} style={smallBtn}>{a.is_pinned ? "Unpin" : "Pin"}</button>
                    <button
                      onClick={() => setForm({ id: a.id, title: a.title, message: a.message, is_pinned: a.is_pinned })}
                      style={smallBtn}
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(a)} style={{ ...smallBtn, color: T.red }}>Delete</button>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 13, color: T.text, margin: "0 0 10px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {a.message}
              </p>
              <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
                {a.author_name} · {fmtDateTime(a.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AnnouncementBoard;

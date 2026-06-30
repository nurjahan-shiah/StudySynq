"use client";

/**
 * /notifications — US-E.1 full Notification Centre page.
 * Lists all of the logged-in user's notifications with type filters, unread
 * highlighting, and mark-read / mark-all-read / dismiss actions.
 */

import { useEffect, useState, useCallback, CSSProperties, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import type { Notification, NotificationType } from "@/lib/types";
import { NOTIFICATION_TYPE_META, relativeTime } from "@/lib/notifications";

const T = {
  bg:     "var(--bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

type Filter = "all" | NotificationType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "session",      label: "Sessions" },
  { id: "announcement", label: "Announcements" },
  { id: "task",         label: "Tasks" },
  { id: "resource",     label: "Resources" },
  { id: "system",       label: "System" },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    setUserId(id);
    if (!id) router.push("/login");
  }, [router]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const res = await apiClient.get<Notification[]>(`/notifications/${userId}`);
    if (res.data) setItems(res.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const visible = filter === "all" ? items : items.filter((n) => n.type === filter);
  const unreadCount = items.filter((n) => !n.is_read).length;

  async function markRead(n: Notification) {
    if (n.is_read) return;
    await apiClient.patch(`/notifications/${n.id}/read`);
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
  }

  async function markAllRead() {
    if (!userId) return;
    await apiClient.patch(`/notifications/${userId}/read-all`);
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
  }

  async function dismiss(e: MouseEvent, n: Notification) {
    e.stopPropagation();
    await apiClient.delete(`/notifications/${n.id}`);
    setItems((prev) => prev.filter((x) => x.id !== n.id));
  }

  async function open(n: Notification) {
    await markRead(n);
    if (n.link) router.push(n.link);
  }

  const chip = (active: boolean): CSSProperties => ({
    padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? T.red : T.border}`,
    background: active ? `${T.red}15` : "transparent",
    color: active ? T.red : T.text2,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Notifications</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Filters + mark all read */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={chip(filter === f.id)}>
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            style={{
              padding: "5px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.bg2,
              color: unreadCount === 0 ? T.text2 : T.text,
              cursor: unreadCount === 0 ? "default" : "pointer",
              opacity: unreadCount === 0 ? 0.6 : 1,
            }}
          >
            Mark all read{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
        ) : visible.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 260, gap: 10, color: T.text2,
          }}>
            <span style={{ fontSize: 32 }}>🔔</span>
            <p style={{ fontSize: 14, margin: 0 }}>No notifications here yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
            {visible.map((n) => {
              const meta = NOTIFICATION_TYPE_META[n.type] ?? NOTIFICATION_TYPE_META.system;
              return (
                <div
                  key={n.id}
                  onClick={() => open(n)}
                  style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "13px 15px", borderRadius: 11,
                    border: `1px solid ${n.is_read ? T.border : T.red}`,
                    background: n.is_read ? T.bg2 : `${T.red}0d`,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 17, width: 24, textAlign: "center", color: meta.color, flexShrink: 0 }}>
                    {meta.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700, color: T.text }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: T.red,
                          background: `${T.red}1a`, padding: "1px 7px", borderRadius: 20,
                          textTransform: "uppercase", letterSpacing: "0.04em",
                        }}>
                          Unread
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: T.text2, margin: "0 0 5px" }}>{n.message}</p>
                    <span style={{ fontSize: 11, color: T.text2 }}>
                      {meta.label} · {relativeTime(n.created_at)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => dismiss(e, n)}
                    title="Dismiss"
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: T.text2, fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

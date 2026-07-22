"use client";

/**
 * components/NotificationBell.tsx — US-E.1 Notification Centre
 *
 * A bell button with an unread-count badge plus a dropdown preview of the most
 * recent notifications. The badge updates without a page refresh by polling the
 * unread-count endpoint (~20s) and refetching when the dropdown opens.
 *
 * The dropdown is rendered with position:fixed, anchored to the bell's
 * on-screen position, so it can never be clipped by a parent container with
 * overflow:hidden (e.g. the dashboard hero banner).
 *
 * Drop it next to <ProfileButton /> in any authenticated page header.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import type { Notification, UnreadCount } from "@/lib/types";
import { NOTIFICATION_TYPE_META, relativeTime } from "@/lib/notifications";
import { BellIcon } from "./BellIcon";

const POLL_MS = 20000;
const PANEL_WIDTH = 360;

const T = {
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

export function NotificationBell() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  // Fixed-position anchor for the dropdown (computed from the bell's rect).
  const [anchor, setAnchor] = useState<{ top: number; right: number }>({ top: 64, right: 20 });
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setUserId(localStorage.getItem("ss_user_id"));
  }, []);

  const fetchUnread = useCallback(async () => {
    if (!userId) return;
    const res = await apiClient.get<UnreadCount>(`/notifications/${userId}/unread-count`);
    if (res.data) setUnread(res.data.unread_count);
  }, [userId]);

  // Poll the unread count so the badge stays live without a page refresh.
  useEffect(() => {
    if (!userId) return;
    fetchUnread();
    const id = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(id);
  }, [userId, fetchUnread]);

  const fetchPreview = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const res = await apiClient.get<Notification[]>(`/notifications/${userId}?limit=8`);
    if (res.data) setItems(res.data);
    setLoading(false);
  }, [userId]);

  // Compute where the fixed panel should sit, based on the bell's viewport rect.
  const updateAnchor = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      top: rect.bottom + 8,
      // Right-align the panel with the bell, but never off the left edge.
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  function toggleOpen() {
    const next = !open;
    if (next) updateAnchor();
    setOpen(next);
    if (next) {
      fetchPreview();
      fetchUnread();
    }
  }

  // Keep the panel anchored on resize/scroll while open.
  useEffect(() => {
    if (!open) return;
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [open, updateAnchor]);

  // Close the dropdown when clicking outside of it.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function openNotification(n: Notification) {
    if (!n.is_read) {
      await apiClient.patch(`/notifications/${n.id}/read`);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    if (!userId) return;
    await apiClient.patch(`/notifications/${userId}/read-all`);
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        title="Notifications"
        aria-label="Notifications"
        style={{
          position: "relative",
          width: 40, height: 40, borderRadius: 10,
          background: T.bg3, border: `1px solid ${T.border}`,
          color: T.text2, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <BellIcon size={18} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 18, height: 18, padding: "0 4px",
              borderRadius: 9, background: T.red, color: "#fff",
              fontSize: 11, fontWeight: 700, lineHeight: "18px",
              textAlign: "center", boxSizing: "border-box",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: anchor.top,
            right: anchor.right,
            width: PANEL_WIDTH,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: `calc(100vh - ${anchor.top + 16}px)`,
            overflowY: "auto",
            background: T.bg2, border: `1px solid ${T.border}`,
            borderRadius: 12, zIndex: 400,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Notifications</span>
            <button
              onClick={markAllRead}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: T.text2, fontSize: 12, padding: 0,
              }}
            >
              Mark all read
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: T.text2, fontSize: 13 }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: T.text2, fontSize: 13 }}>
              You&apos;re all caught up 🎉
            </div>
          ) : (
            items.map((n) => {
              const meta = NOTIFICATION_TYPE_META[n.type] ?? NOTIFICATION_TYPE_META.system;
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "11px 14px", border: "none",
                    borderBottom: `1px solid ${T.border}`,
                    background: n.is_read ? "transparent" : `${T.red}0d`,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.bg3)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = n.is_read ? "transparent" : `${T.red}0d`)}
                >
                  <span style={{ fontSize: 15, width: 20, textAlign: "center", color: meta.color, flexShrink: 0 }}>
                    {meta.icon}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block", fontSize: 13,
                      fontWeight: n.is_read ? 500 : 700, color: T.text,
                      marginBottom: 2,
                    }}>
                      {n.title}
                    </span>
                    <span style={{
                      display: "block", fontSize: 12, color: T.text2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {n.message}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: T.text2, marginTop: 3 }}>
                      {meta.label} · {relativeTime(n.created_at)}
                    </span>
                  </span>
                  {!n.is_read && (
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: T.red, flexShrink: 0, marginTop: 5,
                    }} />
                  )}
                </button>
              );
            })
          )}

          <button
            onClick={() => { setOpen(false); router.push("/notifications"); }}
            style={{
              padding: "12px 14px", border: "none",
              background: "transparent", cursor: "pointer",
              color: T.red, fontSize: 13, fontWeight: 600, textAlign: "center",
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
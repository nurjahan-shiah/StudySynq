"use client";

/**
 * /notifications/preferences — Notification Preferences (US-E.5).
 * The control panel for the Notification Centre: users toggle which notification
 * categories they receive. Saved server-side and enforced before notifications
 * are ever created.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import type { NotificationPreferences } from "@/lib/types";

const T = {
  bg:     "var(--bg)",
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  green:  "var(--ss-green)",
} as const;

type PrefKey = keyof NotificationPreferences;

const CATEGORIES: { key: PrefKey; label: string; hint: string }[] = [
  { key: "sessions",       label: "New study sessions", hint: "When a leader schedules a session in your group" },
  { key: "announcements",  label: "Announcements",      hint: "When a leader posts to a group announcement board" },
  { key: "tasks",          label: "Assigned tasks",     hint: "When a leader assigns a task to you" },
  { key: "resources",      label: "Resource uploads",   hint: "When a file is shared in your group" },
  { key: "group_activity", label: "Group activity",     hint: "Other group updates" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
        background: on ? T.green : T.bg3, position: "relative",
        transition: "background 0.15s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

export default function NotificationPreferencesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    (async () => {
      const res = await apiClient.get<NotificationPreferences>(`/notification-preferences/${id}`);
      if (res.data) setPrefs(res.data);
      setLoading(false);
    })();
  }, [router]);

  function toggle(key: PrefKey) {
    setSaved(false);
    setPrefs((p) => (p ? { ...p, [key]: !p[key] } : p));
  }

  async function save() {
    if (!prefs || !userId) return;
    setSaving(true);
    const res = await apiClient.patch<NotificationPreferences>(`/notification-preferences/${userId}`, prefs);
    setSaving(false);
    if (res.data) { setPrefs(res.data); setSaved(true); }
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <button
            onClick={() => router.push("/notifications")}
            style={{ background: "none", border: "none", color: T.text2, fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            ← Notifications
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Notification preferences</h1>
        <p style={{ fontSize: 13, color: T.text2, margin: "0 0 20px" }}>Choose which updates you want to receive.</p>

        {loading ? (
          <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
        ) : !prefs ? (
          <p style={{ color: T.red, fontSize: 13 }}>Couldn&apos;t load your preferences.</p>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              {CATEGORIES.map((c, i) => (
                <div
                  key={c.key}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                    padding: "14px 16px",
                    borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: "0 0 2px" }}>{c.label}</p>
                    <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>{c.hint}</p>
                  </div>
                  <Toggle on={prefs[c.key]} onClick={() => toggle(c.key)} />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "none", background: T.red, color: "#fff", cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              {saved && (
                <span style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
                  ✓ Your notification preferences have been updated.
                </span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

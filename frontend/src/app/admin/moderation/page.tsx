"use client";

/**
 * /admin/moderation — Moderation Console & Audit Log (US-F.2).
 * Admin-only. Admins review and soft-delete any group, resource, or announcement;
 * every deletion is recorded in the moderation audit log. Non-admins are redirected.
 */

import { useEffect, useState, CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import {
  useModerationGroups, useModerationResources, useModerationAnnouncements, useModerationAuditLog,
} from "@/lib/hooks";

const T = {
  bg:     "var(--bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

type Tab = "groups" | "resources" | "announcements" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "groups",        label: "Groups" },
  { id: "resources",     label: "Resources" },
  { id: "announcements", label: "Announcements" },
  { id: "audit",         label: "Audit Log" },
];

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const th: CSSProperties = {
  textAlign: "left", fontSize: 11, fontWeight: 700, color: T.text2,
  textTransform: "uppercase", letterSpacing: "0.04em", padding: "9px 12px",
  borderBottom: `1px solid ${T.border}`,
};
const td: CSSProperties = { fontSize: 13, color: T.text, padding: "10px 12px", borderBottom: `1px solid ${T.border}`, verticalAlign: "top" };

// entity singular used by the DELETE endpoint
type Entity = "group" | "resource" | "announcement";
interface DeleteTarget { entity: Entity; id: string; title: string; }

export default function ModerationConsolePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("groups");

  const groups = useModerationGroups();
  const resources = useModerationResources();
  const announcements = useModerationAnnouncements();
  const audit = useModerationAuditLog();

  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Admin route guard.
  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    if (localStorage.getItem("ss_user_role") !== "admin") { router.replace("/dashboard"); return; }
    setReady(true);
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [router]);

  function refetchFor(entity: Entity) {
    if (entity === "group") groups.refetch();
    else if (entity === "resource") resources.refetch();
    else announcements.refetch();
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    const qs = reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : "";
    const res = await apiClient.delete(`/admin/moderation/${target.entity}/${target.id}${qs}`);
    setDeleting(false);
    if (!res.error) {
      refetchFor(target.entity);
      audit.refetch();
      setTarget(null);
      setReason("");
    }
  }

  if (!ready) return null; // avoid flashing the console before the guard runs

  const chip = (active: boolean): CSSProperties => ({
    padding: "8px 14px", border: "none", background: "transparent",
    fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
    color: active ? T.red : T.text2,
    borderBottom: `2px solid ${active ? T.red : "transparent"}`, marginBottom: -1,
  });

  const deleteBtn = (t: DeleteTarget) => (
    <button
      onClick={() => { setTarget(t); setReason(""); }}
      style={{
        padding: "4px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600,
        border: `1px solid ${T.red}55`, background: `${T.red}12`, color: T.red, cursor: "pointer",
      }}
    >
      Delete
    </button>
  );

  function Table({ head, children, empty, loading }: {
    head: string[]; children: ReactNode; empty: boolean; loading: boolean;
  }) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{head.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{children}</tbody>
          </table>
        </div>
        {loading && <p style={{ padding: 16, fontSize: 13, color: T.text2, margin: 0 }}>Loading…</p>}
        {!loading && empty && <p style={{ padding: 20, fontSize: 13, color: T.text2, margin: 0, textAlign: "center" }}>Nothing here.</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Moderation console</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>
        <p style={{ fontSize: 13, color: T.text2, margin: "0 0 18px" }}>
          Platform-wide moderation — deletions are soft and recorded in the audit log.
        </p>

        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
          {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={chip(tab === t.id)}>{t.label}</button>)}
        </div>

        {tab === "groups" && (
          <Table head={["Name", "Creator", "Members", "Created", ""]} loading={groups.loading} empty={(groups.data ?? []).length === 0}>
            {(groups.data ?? []).map((g) => (
              <tr key={g.id}>
                <td style={td}><span style={{ fontWeight: 600 }}>{g.name}</span></td>
                <td style={td}>{g.creator_name}</td>
                <td style={td}>{g.member_count}</td>
                <td style={{ ...td, color: T.text2 }}>{fmt(g.created_at)}</td>
                <td style={{ ...td, textAlign: "right" }}>{deleteBtn({ entity: "group", id: g.id, title: g.name })}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "resources" && (
          <Table head={["File", "Uploaded by", "Group", "Uploaded", ""]} loading={resources.loading} empty={(resources.data ?? []).length === 0}>
            {(resources.data ?? []).map((r) => (
              <tr key={r.id}>
                <td style={td}><span style={{ fontWeight: 600 }}>{r.file_name}</span></td>
                <td style={td}>{r.uploader_name}</td>
                <td style={td}>{r.group_name}</td>
                <td style={{ ...td, color: T.text2 }}>{fmt(r.created_at)}</td>
                <td style={{ ...td, textAlign: "right" }}>{deleteBtn({ entity: "resource", id: r.id, title: r.file_name })}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "announcements" && (
          <Table head={["Title", "Author", "Group", "Posted", ""]} loading={announcements.loading} empty={(announcements.data ?? []).length === 0}>
            {(announcements.data ?? []).map((a) => (
              <tr key={a.id}>
                <td style={td}><span style={{ fontWeight: 600 }}>{a.title}</span>{a.is_pinned && <span style={{ marginLeft: 6, fontSize: 10, color: T.text2 }}>📌</span>}</td>
                <td style={td}>{a.author_name}</td>
                <td style={td}>{a.group_name}</td>
                <td style={{ ...td, color: T.text2 }}>{fmt(a.created_at)}</td>
                <td style={{ ...td, textAlign: "right" }}>{deleteBtn({ entity: "announcement", id: a.id, title: a.title })}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "audit" && (
          <Table head={["Admin", "Action", "Type", "Target", "Reason", "When"]} loading={audit.loading} empty={(audit.data ?? []).length === 0}>
            {(audit.data ?? []).map((l) => (
              <tr key={l.id}>
                <td style={td}>{l.admin_name}</td>
                <td style={td}><span style={{ textTransform: "capitalize" }}>{l.action}</span></td>
                <td style={{ ...td, textTransform: "capitalize" }}>{l.entity_type}</td>
                <td style={td}>{l.target_title ?? l.entity_id}</td>
                <td style={{ ...td, color: T.text2 }}>{l.reason || "—"}</td>
                <td style={{ ...td, color: T.text2, whiteSpace: "nowrap" }}>{fmt(l.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </main>

      {/* Delete confirmation + reason modal */}
      {target && (
        <>
          <div onClick={() => !deleting && setTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: 420, maxWidth: "90vw", background: T.bg2, border: `1px solid ${T.border}`,
            borderRadius: 14, padding: 20, zIndex: 301, boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>
              Delete this {target.entity}?
            </h3>
            <p style={{ fontSize: 13, color: T.text2, margin: "0 0 14px" }}>
              “{target.title}” will be hidden from all users. This is recorded in the audit log.
            </p>
            <label style={{ fontSize: 12, color: T.text2, display: "block", marginBottom: 6 }}>Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Inappropriate content"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
                border: `1px solid ${T.border}`, background: T.bg3, color: T.text, fontSize: 13,
                outline: "none", resize: "vertical", fontFamily: "inherit", marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setTarget(null)} disabled={deleting} style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer",
              }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: T.red, color: "#fff", cursor: deleting ? "default" : "pointer",
                opacity: deleting ? 0.7 : 1,
              }}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

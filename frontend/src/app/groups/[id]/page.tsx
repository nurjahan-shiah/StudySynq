"use client";

/**
 * /groups/[id] — group detail page (US-E.2).
 * Tabbed layout; the Announcements tab hosts the Announcement Board. The active
 * tab is seeded from ?tab= so a notification can deep-link straight to it.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { AnnouncementBoard } from "@/app/components/AnnouncementBoard";
import { useGroup, useGroupMembers } from "@/lib/hooks";
import { GroupResourcesPanel } from "@/app/components/GroupResourcesPanel";

const T = {
  bg:     "var(--bg)",
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

type Tab = "overview" | "announcements" | "sessions" | "resources" | "members";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview",      label: "Overview" },
  { id: "announcements", label: "Announcements" },
  { id: "sessions",      label: "Sessions" },
  { id: "resources",     label: "Resources" },
  { id: "members",       label: "Members" },
];

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    setIsAdmin(localStorage.getItem("ss_user_role") === "admin");
    // Seed active tab from ?tab= (e.g. a notification deep-link)
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [router]);

  const { data: group, loading: groupLoading } = useGroup(groupId);
  const { data: members } = useGroupMembers(groupId);

  const me = (members ?? []).find((m) => m.user_id === userId);
  const isLeader = me?.membership_role === "leader" || isAdmin;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <button
            onClick={() => router.push("/groups")}
            style={{ background: "none", border: "none", color: T.text2, fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            ← Study groups
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 16px" }}>
          {groupLoading ? "…" : group?.name ?? "Group"}
        </h1>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 14px", border: "none", background: "transparent",
                  fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
                  color: active ? T.red : T.text2,
                  borderBottom: `2px solid ${active ? T.red : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <div style={{ maxWidth: 640 }}>
            <p style={{ fontSize: 14, color: T.text, margin: "0 0 14px", lineHeight: 1.6 }}>
              {group?.description || "No description provided."}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Stat label="Members" value={group?.member_count ?? (members?.length ?? 0)} />
              <Stat label="Visibility" value={group?.is_public ? "Public" : "Private"} />
              {group?.course_codes && group.course_codes.length > 0 && (
                <Stat label="Courses" value={group.course_codes.join(", ")} />
              )}
            </div>
          </div>
        )}

        {tab === "announcements" && (
          <AnnouncementBoard groupId={groupId} isLeader={isLeader} />
        )}

        {tab === "sessions" && (
          <LinkOut icon="▦" label="Sessions live on the Sessions page." href="/sessions" router={router} />
        )}

        {tab === "resources" && (
          <GroupResourcesPanel groupId={groupId} canManage={isLeader} userId={userId} />
        )}

        {tab === "members" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
            {(members ?? []).map((m) => (
              <div key={m.user_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px",
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>{m.user_name}</p>
                  <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{m.user_email}</p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                  background: m.membership_role === "leader" ? `${T.red}1a` : T.bg3,
                  color: m.membership_role === "leader" ? T.red : T.text2,
                }}>
                  {m.membership_role}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: T.bg3, borderRadius: 10, padding: "10px 14px", border: `1px solid ${T.border}` }}>
      <p style={{ fontSize: 10, color: T.text2, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>{value}</p>
    </div>
  );
}

function LinkOut({ icon, label, href, router }: {
  icon: string; label: string; href: string; router: ReturnType<typeof useRouter>;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: 200, gap: 12, color: T.text2,
    }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <p style={{ fontSize: 14, margin: 0 }}>{label}</p>
      <button
        onClick={() => router.push(href)}
        style={{
          padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer",
        }}
      >
        Open
      </button>
    </div>
  );
}

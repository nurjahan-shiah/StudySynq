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
import { apiClient } from "@/lib/apiClient";
import { GroupResourcesPanel } from "@/app/components/GroupResourcesPanel";
import { GroupTasksPanel } from "@/app/components/GroupTasksPanel";
import { GroupSessionsCalendar } from "@/app/components/GroupSessionsCalendar";

const T = {
  bg:     "var(--bg)",
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

type Tab = "overview" | "announcements" | "tasks" | "sessions" | "resources" | "members";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview",      label: "Overview" },
  { id: "announcements", label: "Announcements" },
  { id: "tasks",         label: "Tasks" },
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
  const [memberActionId, setMemberActionId] = useState("");
  const [memberError, setMemberError] = useState("");
  const [memberStatus, setMemberStatus] = useState("");

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
  const { data: members, refetch: refetchMembers } = useGroupMembers(groupId);

  const me = (members ?? []).find((m) => m.user_id === userId);
  const isLeader = me?.membership_role === "leader" || isAdmin;


  async function removeGroupMember(memberId: string, memberName: string) {
    if (!isLeader) return;

    if (memberId === userId) {
      setMemberError("You cannot remove yourself from the group.");
      return;
    }

    if (!confirm(`Remove ${memberName} from this group?`)) return;

    setMemberActionId(memberId);
    setMemberError("");
    setMemberStatus("");

    try {
      await apiClient.delete(`/groups/${groupId}/members/${memberId}`);
      setMemberStatus(`${memberName} was removed from the group.`);
      refetchMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove member.";
      setMemberError(message);
    } finally {
      setMemberActionId("");
    }
  }

  async function changeMemberRole(memberId: string, memberName: string, nextRole: "member" | "leader") {
    if (!isLeader) return;

    if (memberId === userId) {
      setMemberError("You cannot change your own role.");
      return;
    }

    setMemberActionId(memberId);
    setMemberError("");
    setMemberStatus("");

    try {
      await apiClient.patch(`/groups/${groupId}/members/${memberId}/role`, {
        membership_role: nextRole,
      });
      setMemberStatus(`${memberName} is now a ${nextRole}.`);
      refetchMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update member role.";
      setMemberError(message);
    } finally {
      setMemberActionId("");
    }
  }

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

        {tab === "tasks" && (
          <GroupTasksPanel groupId={groupId} canManage={isLeader} userId={userId} />
        )}

        {tab === "sessions" && (
          <GroupSessionsCalendar groupId={groupId} />
        )}

        {tab === "resources" && (
          <GroupResourcesPanel groupId={groupId} canManage={isLeader} userId={userId} />
        )}

        {tab === "members" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
            <div style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 16,
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>
                Group Leader Management Console
              </h2>
              <p style={{ fontSize: 13, color: T.text2, margin: 0, lineHeight: 1.5 }}>
                View the full member roster, manage member roles, and remove members from the group.
                {isLeader ? " Leader controls are enabled for your account." : " Only group leaders and admins can manage members."}
              </p>
            </div>

            {memberStatus && (
              <p style={{ fontSize: 13, color: T.text2, margin: 0 }}>{memberStatus}</p>
            )}

            {memberError && (
              <p style={{ fontSize: 13, color: T.red, margin: 0 }}>{memberError}</p>
            )}

            {(members ?? []).length === 0 ? (
              <div style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: 18,
                color: T.text2,
                fontSize: 13,
              }}>
                No members found.
              </div>
            ) : (
              (members ?? []).map((m) => {
                const isCurrentUser = m.user_id === userId;
                const busy = memberActionId === m.user_id;
                const nextRole = m.membership_role === "leader" ? "member" : "leader";

                return (
                  <div key={m.user_id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    gap: 14,
                  }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>
                        {m.user_name} {isCurrentUser ? "(You)" : ""}
                      </p>
                      <p style={{ fontSize: 11, color: T.text2, margin: "2px 0 0" }}>{m.user_email}</p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        background: m.membership_role === "leader" ? `${T.red}1a` : T.bg3,
                        color: m.membership_role === "leader" ? T.red : T.text2,
                      }}>
                        {m.membership_role}
                      </span>

                      {isLeader && !isCurrentUser && (
                        <>
                          <button
                            onClick={() => changeMemberRole(m.user_id, m.user_name, nextRole)}
                            disabled={busy}
                            style={{
                              padding: "5px 9px",
                              borderRadius: 7,
                              fontSize: 11,
                              fontWeight: 600,
                              border: `1px solid ${T.border}`,
                              background: "transparent",
                              color: T.text,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          >
                            {busy ? "Working..." : nextRole === "leader" ? "Make leader" : "Make member"}
                          </button>

                          <button
                            onClick={() => removeGroupMember(m.user_id, m.user_name)}
                            disabled={busy}
                            style={{
                              padding: "5px 9px",
                              borderRadius: 7,
                              fontSize: 11,
                              fontWeight: 600,
                              border: `1px solid ${T.border}`,
                              background: "transparent",
                              color: T.red,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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

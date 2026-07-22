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
import { useGroup, useGroupMembers, type Course } from "@/lib/hooks";
import { apiClient } from "@/lib/apiClient";
import { GroupResourcesPanel } from "@/app/components/GroupResourcesPanel";
import { GroupTasksPanel } from "@/app/components/GroupTasksPanel";

const T = {
  bg:     "var(--bg)",
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

type Tab = "overview" | "announcements" | "tasks" | "sessions" | "resources" | "members" | "manage";
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCourseIds, setEditCourseIds] = useState<string[]>([]);
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupAction, setGroupAction] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    setIsAdmin(localStorage.getItem("ss_user_role") === "admin");
    // Seed active tab from ?tab= (e.g. a notification deep-link)
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [router]);

  const { data: group, loading: groupLoading, refetch: refetchGroup } = useGroup(groupId);
  const { data: members, refetch: refetchMembers } = useGroupMembers(groupId);

  const me = (members ?? []).find((m) => m.user_id === userId);
  const isOwner = Boolean(group && userId && group.created_by === userId);
  const isLeader = me?.membership_role === "leader" || isAdmin;
  const canManage = isOwner || isLeader;
  const visibleTabs = canManage ? [...TABS, { id: "manage" as Tab, label: "Manage" }] : TABS;

  useEffect(() => {
    if (!canManage) return;
    apiClient.get<Course[]>("/courses").then((res) => {
      if (!res.error) setCourses(res.data ?? []);
    });
  }, [canManage]);

  useEffect(() => {
    if (!group) return;
    setEditName(group.name);
    setEditDescription(group.description ?? "");
    setEditIsPublic(group.is_public);
  }, [group]);

  useEffect(() => {
    if (!group || courses.length === 0) return;
    setEditCourseIds(
      courses.filter((course) => group.course_codes.includes(course.course_code)).map((course) => course.id)
    );
  }, [group, courses]);


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
      const res = await apiClient.delete(`/groups/${groupId}/members/${memberId}`);
      if (res.error) throw new Error(res.error);
      setMemberStatus(`${memberName} was removed from the group.`);
      await Promise.all([refetchMembers(), refetchGroup()]);
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
      const res = await apiClient.patch(`/groups/${groupId}/members/${memberId}/role`, {
        membership_role: nextRole,
      });
      if (res.error) throw new Error(res.error);
      setMemberStatus(`${memberName} is now a ${nextRole}.`);
      await refetchMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update member role.";
      setMemberError(message);
    } finally {
      setMemberActionId("");
    }
  }

  async function saveGroupDetails() {
    if (!canManage || !editName.trim()) {
      setMemberError("Group name is required.");
      return;
    }
    if (editCourseIds.length === 0) {
      setMemberError("Select at least one linked course.");
      return;
    }

    setSavingGroup(true);
    setMemberError("");
    setMemberStatus("");
    const res = await apiClient.put(`/groups/${groupId}`, {
      name: editName.trim(),
      description: editDescription.trim(),
      is_public: editIsPublic,
      course_ids: editCourseIds,
    });
    setSavingGroup(false);

    if (res.error) {
      setMemberError(res.error);
      return;
    }
    await refetchGroup();
    setMemberStatus("Group details were updated.");
  }

  async function transferOwnership(memberId: string, memberName: string) {
    if (!isOwner || !confirm(`Transfer ownership of this group to ${memberName}? You will remain a leader.`)) return;

    setMemberActionId(memberId);
    setMemberError("");
    setMemberStatus("");
    const res = await apiClient.post(`/groups/${groupId}/transfer-ownership`, {
      new_owner_id: memberId,
    });
    setMemberActionId("");

    if (res.error) {
      setMemberError(res.error);
      return;
    }
    await Promise.all([refetchGroup(), refetchMembers()]);
    setMemberStatus(`${memberName} is now the group owner. You remain a leader.`);
  }

  async function deleteCurrentGroup() {
    if (!isOwner || !group) return;
    if (!confirm(`Delete “${group.name}”? Members will no longer be able to access this group.`)) return;

    setGroupAction("delete");
    setMemberError("");
    const res = await apiClient.delete(`/groups/${groupId}`);
    if (res.error) {
      setMemberError(res.error);
      setGroupAction("");
      return;
    }
    router.push("/groups");
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
          {visibleTabs.map((t) => {
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
          <div style={{ maxWidth: 760 }}>
            <p style={{ fontSize: 14, color: T.text, margin: "0 0 14px", lineHeight: 1.6 }}>
              {group?.description || "No description provided."}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Stat label="Members" value={group?.member_count ?? (members?.length ?? 0)} />
              <Stat label="Visibility" value={group?.is_public ? "Public" : "Private"} />
            </div>

            <section style={{
              marginTop: 18,
              padding: 16,
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                <span aria-hidden="true" style={{
                  width: 32, height: 32, borderRadius: 9, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: `color-mix(in srgb, ${T.red} 9%, transparent)`,
                  color: T.red, fontSize: 15,
                }}>▤</span>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>Linked courses</h2>
                </div>
              </div>

              {group?.course_codes && group.course_codes.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(group.courses ?? group.course_codes.map((courseCode) => ({
                    id: courseCode,
                    course_code: courseCode,
                    course_name: "",
                    department: "",
                  }))).map((course) => (
                    <span key={course.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 9,
                      padding: "9px 12px", borderRadius: 9,
                      background: T.bg3, border: `1px solid ${T.border}`,
                    }}>
                      <span style={{
                        padding: "3px 9px", borderRadius: 20,
                        background: `color-mix(in srgb, ${T.red} 9%, transparent)`,
                        color: T.red, fontSize: 11, fontWeight: 700,
                      }}>
                        {course.course_code}
                      </span>
                      <span>
                        <strong style={{ display: "block", color: T.text, fontSize: 12, fontWeight: 600 }}>
                          {course.course_name || course.course_code}
                        </strong>
                        {course.department && (
                          <span style={{ display: "block", color: T.text2, fontSize: 10.5, marginTop: 2 }}>
                            {course.department}
                          </span>
                        )}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>No courses are linked to this group.</p>
              )}
            </section>
          </div>
        )}

        {tab === "announcements" && (
          <AnnouncementBoard groupId={groupId} isLeader={isLeader} />
        )}

        {tab === "tasks" && (
          <GroupTasksPanel groupId={groupId} canManage={isLeader} userId={userId} />
        )}

        {tab === "sessions" && (
          <LinkOut icon="▦" label="Sessions live on the Sessions page." href="/sessions" router={router} />
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
                const isGroupOwner = m.user_id === group?.created_by;
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
                        background: m.membership_role === "leader" ? `color-mix(in srgb, ${T.red} 10%, transparent)` : T.bg3,
                        color: m.membership_role === "leader" ? T.red : T.text2,
                      }}>
                        {isGroupOwner ? "owner" : m.membership_role}
                      </span>

                      {canManage && !isCurrentUser && !isGroupOwner && (
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

                          {isOwner && (
                            <button
                              onClick={() => transferOwnership(m.user_id, m.user_name)}
                              disabled={busy}
                              style={{
                                padding: "5px 9px",
                                borderRadius: 7,
                                fontSize: 11,
                                fontWeight: 600,
                                border: `1px solid ${T.red}`,
                                background: `color-mix(in srgb, ${T.red} 7%, transparent)`,
                                color: T.red,
                                cursor: busy ? "not-allowed" : "pointer",
                              }}
                            >
                              Transfer ownership
                            </button>
                          )}

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

        {tab === "manage" && canManage && (
          <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
            <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Edit group details</h2>
              <p style={{ color: T.text2, fontSize: 12, margin: "0 0 18px" }}>
                Owners and leaders can update these settings. Course changes are reflected in recommendations.
              </p>

              <label style={labelStyle}>Group name</label>
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                maxLength={255}
                style={inputStyle}
              />

              <label style={labelStyle}>Description</label>
              <textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />

              <label style={labelStyle}>Linked course</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8, marginBottom: 16 }}>
                {courses.map((course) => {
                  const checked = editCourseIds.includes(course.id);
                  return (
                    <label key={course.id} style={{
                      display: "flex", gap: 9, alignItems: "center", padding: "9px 11px",
                      borderRadius: 8, border: `1px solid ${checked ? T.red : T.border}`,
                      background: checked ? `color-mix(in srgb, ${T.red} 6%, transparent)` : T.bg3, color: T.text, fontSize: 12,
                      cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setEditCourseIds((current) =>
                          checked ? current.filter((id) => id !== course.id) : [...current, course.id]
                        )}
                        style={{ accentColor: T.red }}
                      />
                      <span><strong>{course.course_code}</strong> — {course.course_name}</span>
                    </label>
                  );
                })}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 9, color: T.text, fontSize: 13, marginBottom: 18 }}>
                <input
                  type="checkbox"
                  checked={editIsPublic}
                  onChange={(event) => setEditIsPublic(event.target.checked)}
                  style={{ accentColor: T.red }}
                />
                Public group
              </label>

              {memberStatus && <p style={{ fontSize: 13, color: T.text2, margin: "0 0 10px" }}>{memberStatus}</p>}
              {memberError && <p style={{ fontSize: 13, color: T.red, margin: "0 0 10px" }}>{memberError}</p>}

              <button
                onClick={saveGroupDetails}
                disabled={savingGroup}
                style={{
                  border: 0, borderRadius: 8, padding: "9px 16px", background: T.red,
                  color: "white", fontSize: 12, fontWeight: 700,
                  cursor: savingGroup ? "not-allowed" : "pointer", opacity: savingGroup ? 0.65 : 1,
                }}
              >
                {savingGroup ? "Saving…" : "Save changes"}
              </button>
            </section>

            {isOwner && (
              <section style={{ background: T.card, border: `1px solid ${T.red}55`, borderRadius: 12, padding: 18 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: T.red, margin: "0 0 5px" }}>Delete group</h2>
                <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.5, margin: "0 0 14px" }}>
                  Only the owner can delete this group. Members will no longer be able to access it.
                </p>
                <button
                  onClick={deleteCurrentGroup}
                  disabled={groupAction === "delete"}
                  style={{
                    border: `1px solid ${T.red}`, borderRadius: 8, padding: "8px 14px",
                    background: "transparent", color: T.red, fontSize: 12, fontWeight: 700,
                    cursor: groupAction ? "not-allowed" : "pointer",
                  }}
                >
                  {groupAction === "delete" ? "Deleting…" : "Delete group"}
                </button>
              </section>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

const labelStyle = {
  display: "block",
  color: T.text2,
  fontSize: 11,
  fontWeight: 700,
  margin: "0 0 6px",
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: T.bg3,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "9px 11px",
  color: T.text,
  fontSize: 13,
  outline: "none",
  marginBottom: 15,
} as const;

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

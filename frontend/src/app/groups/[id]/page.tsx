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

// In-app replacement for window.confirm() — matches the modal used for
// session cancellation so destructive group actions get the same treatment.
type PendingAction =
  | { type: "remove"; memberId: string; memberName: string }
  | { type: "transfer"; memberId: string; memberName: string }
  | { type: "delete" };

function ConfirmActionModal({ title, message, confirmLabel, busy, onCancel, onConfirm }: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: "28px 32px", width: 420, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: T.text2, margin: 0, lineHeight: 1.6 }}>{message}</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${T.border}`, background: "transparent", color: T.text2,
            cursor: busy ? "not-allowed" : "pointer",
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: "none", background: T.red, color: "#fff",
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
          }}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

type MemberSearchResult = { user_id: string; user_name: string; user_email: string };

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
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchResult[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCourseIds, setEditCourseIds] = useState<string[]>([]);
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editSession, setEditSession] = useState("");
  const [editSection, setEditSection] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupAction, setGroupAction] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

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
  const canManageMembers = canManage;
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
    setEditSession(group.session ?? "");
    setEditSection(group.section ?? "");
  }, [group]);

  useEffect(() => {
    if (!group || courses.length === 0) return;
    setEditCourseIds(
      courses.filter((course) => group.course_codes.includes(course.course_code)).map((course) => course.id)
    );
  }, [group, courses]);




  // Search registered profiles while typing in Add Member
  useEffect(() => {
    const query = newMemberEmail.trim();

    if (!canManageMembers || query.length < 2) {
      setMemberSearchResults([]);
      setMemberSearchLoading(false);
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setMemberSearchLoading(true);

      const response = await apiClient.get<MemberSearchResult[]>(
        `/groups/${groupId}/members/search?q=${encodeURIComponent(query)}`
      );

      if (cancelled) return;

      if (response.error) {
        setMemberSearchResults([]);
      } else {
        setMemberSearchResults(response.data ?? []);
      }

      setMemberSearchLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newMemberEmail, groupId, canManageMembers]);



  async function saveGroupDetails() {
    if (!canManage) return;

    const name = editName.trim();
    if (!name) {
      setGroupAction("Group name is required.");
      return;
    }

    setSavingGroup(true);
    setGroupAction("");

    try {
      const response = await apiClient.put(`/groups/${groupId}`, {
        name,
        description: editDescription,
        is_public: editIsPublic,
        course_ids: editCourseIds,
        session: editSession,
        section: editSection,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setGroupAction("Group details updated.");
      refetchGroup();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update group.";
      setGroupAction(message);
    } finally {
      setSavingGroup(false);
    }
  }

  async function addMemberByEmail() {
    if (!canManageMembers) return;

    const email = newMemberEmail.trim().toLowerCase();
    if (!email) {
      setMemberError("Enter the student's email address.");
      return;
    }

    setAddingMember(true);
    setMemberError("");
    setMemberStatus("");

    try {
      const response = await apiClient.post(`/groups/${groupId}/members`, {
        user_email: email,
        membership_role: "member",
      });

      if (response.error) {
        const friendlyMessage = response.error.toLowerCase().includes("user not found")
          ? "No registered profile exists with that email. Ask the student to sign up first."
          : response.error;

        throw new Error(friendlyMessage);
      }

      if (!response.data) {
        throw new Error("Member could not be added. Please try again.");
      }

      setMemberStatus(`${email} was added to the group.`);
      setNewMemberEmail("");
      setMemberSearchResults([]);
      refetchMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add member.";
      setMemberError(message);
    } finally {
      setAddingMember(false);
    }
  }

  async function removeGroupMember(memberId: string, memberName: string) {
    if (!canManageMembers) return;

    if (memberId === userId) {
      setMemberError("You cannot remove yourself from the group.");
      return;
    }

    if (!confirm(`Remove ${memberName} from this group?`)) return;

    setMemberActionId(memberId);
    setMemberError("");
    setMemberStatus("");

    try {
      const response = await apiClient.delete(`/groups/${groupId}/members/${memberId}`);

      if (response.error) {
        throw new Error(response.error);
      }

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
    if (!canManageMembers) return;

    if (memberId === userId) {
      setMemberError("You cannot change your own role.");
      return;
    }

    setMemberActionId(memberId);
    setMemberError("");
    setMemberStatus("");

    try {
      const response = await apiClient.patch(`/groups/${groupId}/members/${memberId}/role`, {
        membership_role: nextRole,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setMemberStatus(`${memberName} is now a ${nextRole}.`);
      refetchMembers();
      refetchGroup();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update member role.";
      setMemberError(message);
    } finally {
      setMemberActionId("");
    }
  }



  async function deleteCurrentGroup() {
    if (!canManage) return;

    setPendingAction(null);
    setGroupAction("delete");

    try {
      const response = await apiClient.delete(`/groups/${groupId}`);

      if (response.error) {
        throw new Error(response.error);
      }

      router.push("/groups");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete group.";
      setGroupAction(message);
    }
  }

  async function transferOwnership(memberId: string, memberName: string) {
    setPendingAction(null);
    await changeMemberRole(memberId, memberName, "leader");
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
              {group?.session && <Stat label="Session" value={group.session} />}
              {group?.section && <Stat label="Section" value={group.section} />}
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
                {canManageMembers ? " Leader controls are enabled for your account." : " Only the group leader can manage members."}
              </p>

              {canManageMembers && (
                <>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <input
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addMemberByEmail();
                    }}
                    placeholder="Add member by email"
                    style={{
                      flex: "1 1 260px",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      background: T.bg,
                      color: T.text,
                      fontSize: 13,
                    }}
                  />
                  <button
                    onClick={addMemberByEmail}
                    disabled={addingMember}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      background: T.red,
                      color: "white",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: addingMember ? "not-allowed" : "pointer",
                    }}
                  >
                    {addingMember ? "Adding..." : "Add member"}
                  </button>
                </div>

                {/* Registered profile suggestions */}
                {newMemberEmail.trim().length >= 2 && (
                  <div style={{
                    marginTop: 8,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    background: T.bg,
                    overflow: "hidden",
                  }}>
                    {memberSearchLoading ? (
                      <p style={{ fontSize: 12, color: T.text2, margin: 0, padding: "8px 10px" }}>
                        Searching registered profiles...
                      </p>
                    ) : memberSearchResults.length > 0 ? (
                      memberSearchResults.map((profile) => (
                        <button
                          key={profile.user_id}
                          type="button"
                          onClick={() => setNewMemberEmail(profile.user_email)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            borderBottom: `1px solid ${T.border}`,
                            background: "transparent",
                            color: T.text,
                            padding: "8px 10px",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>
                            {profile.user_name}
                          </span>
                          <span style={{ display: "block", fontSize: 11, color: T.text2 }}>
                            {profile.user_email}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p style={{ fontSize: 12, color: T.text2, margin: 0, padding: "8px 10px" }}>
                        No matching registered profile found. The student must sign up before being added.
                      </p>
                    )}
                  </div>
                )}
                </>
              )}
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

                      {canManageMembers && !isCurrentUser && !isGroupOwner && (
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
                              onClick={() => setPendingAction({ type: "transfer", memberId: m.user_id, memberName: m.user_name })}
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
                            onClick={() => setPendingAction({ type: "remove", memberId: m.user_id, memberName: m.user_name })}
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

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Session (e.g. SU26)</label>
                  <input
                    value={editSession}
                    onChange={(event) => setEditSession(event.target.value)}
                    placeholder="F25 / W26 / SU26"
                    maxLength={4}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Section (e.g. A)</label>
                  <input
                    value={editSection}
                    onChange={(event) => setEditSection(event.target.value)}
                    placeholder="A"
                    maxLength={20}
                    style={inputStyle}
                  />
                </div>
              </div>

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
                  onClick={() => setPendingAction({ type: "delete" })}
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

      {pendingAction?.type === "remove" && (
        <ConfirmActionModal
          title="Remove member"
          message={`Remove ${pendingAction.memberName} from this group?`}
          confirmLabel="Remove"
          busy={memberActionId === pendingAction.memberId}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => removeGroupMember(pendingAction.memberId, pendingAction.memberName)}
        />
      )}

      {pendingAction?.type === "transfer" && (
        <ConfirmActionModal
          title="Transfer ownership"
          message={`Transfer ownership of this group to ${pendingAction.memberName}? You will remain a leader.`}
          confirmLabel="Transfer ownership"
          busy={memberActionId === pendingAction.memberId}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => transferOwnership(pendingAction.memberId, pendingAction.memberName)}
        />
      )}

      {pendingAction?.type === "delete" && group && (
        <ConfirmActionModal
          title="Delete group"
          message={`Delete "${group.name}"? Members will no longer be able to access this group.`}
          confirmLabel="Delete group"
          busy={groupAction === "delete"}
          onCancel={() => setPendingAction(null)}
          onConfirm={deleteCurrentGroup}
        />
      )}
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

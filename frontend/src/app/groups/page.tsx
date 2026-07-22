"use client";

/**
 * /groups — list of the groups the logged-in user belongs to (US-E.2).
 * Each card links to the group detail page where the Announcement Board lives.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import { useMyGroups, explainRecommendation, type Course, type MyGroup } from "@/lib/hooks";
import { MAJOR_GROUPS } from "@/lib/majors";

const T = {
  bg:     "var(--bg)",
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

// US-G.1 @author: Uzma Alam - Group card with AI match explanation
function GroupCard({ g }: { g: MyGroup }) {
  const router = useRouter();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining]   = useState(false);

  async function handleExplain(e: React.MouseEvent) {
    e.stopPropagation();
    if (explanation) { setExplanation(null); return; }
    setExplaining(true);
    const res = await explainRecommendation(g.id);
    if (res.data?.explanation) setExplanation(res.data.explanation);
    setExplaining(false);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/groups/${g.id}`)}
      style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: "16px 18px", cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.red)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>{g.name}</h3>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          textTransform: "uppercase", letterSpacing: "0.04em",
          background: g.my_role === "leader" ? `${T.red}1a` : T.bg3,
          color: g.my_role === "leader" ? T.red : T.text2,
        }}>
          {g.my_role}
        </span>
      </div>
      <p style={{ fontSize: 12, color: T.text2, margin: "0 0 12px", minHeight: 32 }}>
        {g.description || "No description."}
      </p>
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.text2, marginBottom: 10 }}>
        <span>👥 {g.member_count} member{g.member_count === 1 ? "" : "s"}</span>
        {g.course_codes?.length > 0 && <span>· {g.course_codes.join(", ")}</span>}
      </div>
      {/* US-G.1 @author: Uzma Alam — AI match explanation button */}
      <button
        onClick={handleExplain}
        style={{
          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
          border: `1px solid ${T.border}`, background: "transparent",
          color: T.text2, cursor: "pointer",
        }}
      >
        {explaining ? "Thinking…" : explanation ? "Hide" : "Why this group?"}
      </button>
      {explanation && (
        <p style={{ fontSize: 12, color: T.text2, fontStyle: "italic", margin: "8px 0 0" }}>
          {explanation}
        </p>
      )}
    </div>
  );
}

export default function GroupsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  const { data: groups, loading, refetch } = useMyGroups(userId);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [intendedMajor, setIntendedMajor] = useState("");
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCourses() {
      setCoursesLoading(true);
      const res = await apiClient.get<Course[]>("/courses");
      setAvailableCourses(res.data ?? []);
      setCoursesLoading(false);
    }
    loadCourses();
  }, []);

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
    setFormError(null);
  }

  function resetForm() {
    setCreating(false);
    setName("");
    setDescription("");
    setIsPublic(true);
    setIntendedMajor("");
    setSelectedCourseIds(new Set());
    setFormError(null);
  }

  async function createGroup() {
    if (!name.trim()) {
      setFormError("Enter a group name.");
      return;
    }
    if (selectedCourseIds.size === 0) {
      setFormError("Select at least one course for this group.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await apiClient.post<{ id: string }>("/groups", {
      name: name.trim(), description, is_public: isPublic,
      course_ids: Array.from(selectedCourseIds),
      intended_major: intendedMajor || null,
    });
    setSaving(false);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    resetForm();
    // Creator becomes the group leader — drop them straight into the new group.
    if (res.data?.id) router.push(`/groups/${res.data.id}`);
    else refetch();
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Study groups</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "none", background: T.red, color: "#fff", cursor: "pointer",
                }}
              >
                + Create group
              </button>
            )}
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {creating && (
          <div style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 16, marginBottom: 18, maxWidth: 520,
          }}>
            <input
              type="text"
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8, marginBottom: 10,
                border: `1px solid ${T.border}`, background: T.bg3, color: T.text,
                fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box",
              }}
            />
            <textarea
              placeholder="What's this group about? (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8, marginBottom: 10,
                border: `1px solid ${T.border}`, background: T.bg3, color: T.text,
                fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 6 }}>
                Courses <span style={{ color: T.red }}>*</span>
              </label>
              <div style={{
                maxHeight: 150, overflowY: "auto", padding: 8, borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.bg3,
              }}>
                {coursesLoading ? (
                  <p style={{ fontSize: 12, color: T.text2, margin: 4 }}>Loading courses…</p>
                ) : availableCourses.length === 0 ? (
                  <p style={{ fontSize: 12, color: T.text2, margin: 4 }}>
                    No courses are available. Ask an admin to create one first.
                  </p>
                ) : availableCourses.map((course) => (
                  <label
                    key={course.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 4px", fontSize: 12.5, color: T.text,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.has(course.id)}
                      onChange={() => toggleCourse(course.id)}
                    />
                    <strong>{course.course_code}</strong>
                    <span style={{ color: T.text2 }}>{course.course_name}</span>
                  </label>
                ))}
              </div>
              {selectedCourseIds.size > 0 && (
                <p style={{ fontSize: 11, color: T.text2, margin: "5px 0 0" }}>
                  {selectedCourseIds.size} course{selectedCourseIds.size === 1 ? "" : "s"} selected
                </p>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 6 }}>
                Intended major <span style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <select
                value={intendedMajor}
                onChange={(e) => setIntendedMajor(e.target.value)}
                className="ss-input"
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.bg3, color: T.text,
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              >
                <option value="">Select major</option>
                {MAJOR_GROUPS.map(g => (
                  <optgroup key={g.faculty} label={g.faculty}>
                    {g.majors.map(m => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            {formError && (
              <p role="alert" style={{ fontSize: 12, color: T.red, margin: "0 0 10px" }}>
                {formError}
              </p>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: T.text2, cursor: "pointer" }}>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Public group
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={resetForm}
                  disabled={saving || coursesLoading || availableCourses.length === 0}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={createGroup}
                  disabled={saving}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: "none", background: T.red, color: "#fff", cursor: "pointer",
                  }}
                >
                  {saving ? "Creating…" : "Create group"}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
        ) : groups.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 280, gap: 10, color: T.text2,
          }}>
            <span style={{ fontSize: 32 }}>⚇</span>
            <p style={{ fontSize: 14, margin: 0 }}>You&apos;re not in any groups yet.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {groups.map((g) => (
              <GroupCard key={g.id} g={g} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

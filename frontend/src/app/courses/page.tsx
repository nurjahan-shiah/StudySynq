"use client";

/**
 * frontend/src/app/courses/page.tsx
 * /courses — Course catalogue + "my enrolled courses" dashboard.
 *
 * Backend:
 *   GET  /courses                       — full course catalogue (courses-service)
 *   GET  /users/:id/enrollments          — courses the logged-in user is enrolled in
 *   POST /users/:id/enrollments?course_id=  — enroll self in a course
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import { useEnrolledCourses, type Course } from "@/lib/hooks";

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

// ── Small shared bits ─────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: T.bg3, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.border}` }}>
      <p style={{ fontSize: 11, color: T.text2, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0 }}>{value}</p>
    </div>
  );
}

function Empty({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0", color: T.text2 }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 13, margin: 0 }}>{msg}</p>
    </div>
  );
}

function CourseCard({
  course, enrolled, busy, onEnroll,
}: {
  course: Course;
  enrolled: boolean;
  busy: boolean;
  onEnroll: (c: Course) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${hovered && !enrolled ? T.red : T.border}`,
        background: T.card,
        transition: "border-color 0.12s",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          background: `${T.red}15`, color: T.red,
          padding: "2px 10px", borderRadius: 20,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
        }}>
          {course.course_code}
        </span>
        {enrolled && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: "rgba(0,184,148,.14)", color: "#00b894",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            Enrolled
          </span>
        )}
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0, lineHeight: 1.3 }}>
        {course.course_name}
      </p>
      <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>{course.department}</p>

      {!enrolled && (
        <button
          onClick={() => onEnroll(course)}
          disabled={busy}
          style={{
            marginTop: 4, padding: "7px 0", borderRadius: 8,
            border: `1px solid ${T.border}`, background: "transparent",
            color: T.text, fontSize: 12, fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Enrolling…" : "+ Enroll"}
        </button>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "my" | "browse";

export default function CoursesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [tab, setTab] = useState<Tab>("my");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  const { data: enrolled, loading: loadingEnrolled, refetch: refetchEnrolled } = useEnrolledCourses(userId);

  const fetchAllCourses = useCallback(async () => {
    setLoadingAll(true);
    const res = await apiClient.get<Course[]>("/courses");
    setAllCourses(res.data ?? []);
    setLoadingAll(false);
  }, []);

  useEffect(() => { fetchAllCourses(); }, [fetchAllCourses]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  const enrolledIds = useMemo(() => new Set((enrolled ?? []).map((c) => c.id)), [enrolled]);

  const departments = useMemo(
    () => Array.from(new Set(allCourses.map((c) => c.department))).sort(),
    [allCourses]
  );

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCourses.filter((c) => {
      const matchesSearch =
        !q ||
        c.course_code.toLowerCase().includes(q) ||
        c.course_name.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q);
      const matchesDept = deptFilter === "all" || c.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [allCourses, search, deptFilter]);

  async function handleEnroll(course: Course) {
    if (!userId) return;
    setEnrollingId(course.id);
    const res = await apiClient.post(`/users/${userId}/enrollments?course_id=${course.id}`, {});
    setEnrollingId(null);
    if (res.error) {
      showToast(res.error, false);
    } else {
      showToast(`Enrolled in ${course.course_code}`);
      refetchEnrolled();
    }
  }

  const loading = tab === "my" ? loadingEnrolled : loadingAll;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Toast */}
        {toast && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            background: toast.ok ? "#00b894" : T.red,
            color: "#fff", padding: "10px 18px", borderRadius: 8,
            fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.18)",
          }}>
            {toast.msg}
          </div>
        )}

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Courses</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <StatCard label="Enrolled courses" value={enrolled?.length ?? 0} />
          <StatCard label="Available courses" value={allCourses.length} />
          <StatCard label="Departments" value={departments.length} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 18 }}>
          {([
            { id: "my" as Tab, label: "My courses" },
            { id: "browse" as Tab, label: "Browse catalogue" },
          ]).map((t) => {
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

        {/* Browse filters */}
        {tab === "browse" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search code, name, or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 220, padding: "8px 12px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.bg2,
                color: T.text, fontSize: 13, outline: "none",
              }}
            />
            {departments.length > 1 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                style={{
                  padding: "8px 10px", borderRadius: 8, fontSize: 12,
                  border: `1px solid ${T.border}`, background: T.bg2,
                  color: T.text, cursor: "pointer", outline: "none",
                }}
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: T.text2, fontSize: 13 }}>Loading…</div>
        ) : tab === "my" ? (
          (enrolled ?? []).length === 0 ? (
            <Empty icon="◎" msg="No courses enrolled yet - browse the catalogue to get started." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {(enrolled ?? []).map((c) => (
                <CourseCard key={c.id} course={c} enrolled busy={false} onEnroll={() => {}} />
              ))}
            </div>
          )
        ) : filteredAll.length === 0 ? (
          <Empty icon="◎" msg="No courses match your search." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {filteredAll.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                enrolled={enrolledIds.has(c.id)}
                busy={enrollingId === c.id}
                onEnroll={handleEnroll}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
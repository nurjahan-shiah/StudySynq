"use client";

/**
 * frontend/src/app/admin/page.tsx
 * US-F.1 — Admin User and Course Management Dashboard
 *
 * M3: Deactivate accounts (POST /admin/users/:id/deactivate)
 *     Deactivated users cannot log in; all actions timestamped.
 * M4: Dashboard with real user/course tables; search, filter,
 *     inline role editing.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const T = {
  bg: "var(--bg)",
  bg2: "var(--bg2)",
  bg3: "var(--bg3)",
  card: "var(--card-bg)",
  border: "var(--border)",
  text: "var(--text)",
  text2: "var(--text2)",
  red: "var(--ss-red)",
  blue: "var(--ss-blue)",
  green: "var(--ss-green)",
} as const;

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ss_token") || "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token()}`,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface AdminCourse {
  id: string;
  course_code: string;
  course_name: string;
  department: string;
}

interface Summary {
  total_users: number;
  active_users: number;
  deactivated_users: number;
  total_courses: number;
}

type Tab = "users" | "courses";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rolePill(role: string) {
  const map: Record<string, string> = {
    admin: "#fee2e2|#b91c1c",
    student: "#dbeafe|#1d4ed8",
  };
  const [bg, fg] = (map[role] ?? "#f3f4f6|#374151").split("|");
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState<Tab>("courses");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [courseSearch, setCourseSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  // Course create modal state
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourse, setNewCourse] = useState({
    course_code: "",
    course_name: "",
    department: "",
  });

  useEffect(() => {
    const currentToken = localStorage.getItem("ss_token");
    const currentRole = localStorage.getItem("ss_user_role");
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    if (currentRole !== "admin") {
      router.replace("/dashboard");
      return;
    }
    setAuthorized(true);
  }, [router]);

  // ── data fetching ─────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSummary = useCallback(async () => {
    if (!authorized) return;
    const r = await fetch(`${API}/admin/dashboard`, { headers: authHeaders() });
    if (r.ok) setSummary(await r.json());
  }, [authorized]);

  const fetchUsers = useCallback(async () => {
    if (!authorized) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (userSearch) params.set("search", userSearch);
    if (roleFilter !== "all") params.set("role", roleFilter);
    const r = await fetch(`${API}/admin/users?${params}`, { headers: authHeaders() });
    if (r.ok) setUsers(await r.json());
    setLoading(false);
  }, [authorized, userSearch, roleFilter]);

  const fetchCourses = useCallback(async () => {
    if (!authorized) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (courseSearch) params.set("search", courseSearch);
    const r = await fetch(`${API}/admin/courses?${params}`, { headers: authHeaders() });
    if (r.ok) setCourses(await r.json());
    setLoading(false);
  }, [authorized, courseSearch]);

  // US-F.1 — CSV export for oversight/reporting
  const exportCsv = useCallback(async (kind: "users" | "courses") => {
    const r = await fetch(`${API}/admin/${kind}/export`, { headers: authHeaders() });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studysynq-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (tab === "courses") fetchCourses(); }, [tab, fetchCourses]);

  if (!authorized) return null;

  // ── user actions ──────────────────────────────────────────────────────────

  async function toggleActive(u: AdminUser) {
    const endpoint = u.is_active ? "deactivate" : "reactivate";
    const r = await fetch(`${API}/admin/users/${u.id}/${endpoint}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (r.ok) {
      showToast(`${u.name} ${u.is_active ? "deactivated" : "reactivated"}`);
      fetchUsers();
      fetchSummary();
    } else {
      const err = await r.json();
      showToast(err.detail ?? "Failed", false);
    }
  }

  async function changeRole(userId: string, role: string) {
    const r = await fetch(`${API}/admin/users/${userId}/role`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ role }),
    });
    setEditingRole(null);
    if (r.ok) {
      showToast("Role updated");
      fetchUsers();
    } else {
      const err = await r.json();
      showToast(err.detail ?? "Failed", false);
    }
  }

  // ── course actions ────────────────────────────────────────────────────────

  async function deleteCourse(id: string, code: string) {
    if (!confirm(`Delete course ${code}? This cannot be undone.`)) return;
    const r = await fetch(`${API}/admin/courses/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (r.ok || r.status === 204) {
      showToast(`${code} deleted`);
      fetchCourses();
      fetchSummary();
    } else {
      const err = await r.json();
      showToast(err.detail ?? "Failed", false);
    }
  }

  async function createCourse() {
    const r = await fetch(`${API}/admin/courses`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(newCourse),
    });
    if (r.ok) {
      showToast(`${newCourse.course_code} created`);
      setShowCourseModal(false);
      setNewCourse({ course_code: "", course_name: "", department: "" });
      fetchCourses();
      fetchSummary();
    } else {
      const err = await r.json();
      showToast(err.detail ?? "Failed", false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? T.green : T.red,
          color: "#fff", padding: "10px 18px", borderRadius: 8,
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.15)",
          transition: "opacity .2s",
        }}>
          {toast.msg}
        </div>
      )}

      <main className="ss-admin-main" style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div className="ss-admin-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>
              Admin course management
            </h1>
            <p style={{ fontSize: 12.5, color: T.text2, margin: "4px 0 0" }}>
              Manage the course catalogue available to students and study groups.
            </p>
          </div>
          <div className="ss-admin-actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              className="ss-btn-ghost"
              onClick={() => router.push("/admin/health")}
              aria-label="Open system health dashboard"
              style={{ gap: 7, padding: "7px 13px", fontSize: 12.5, fontWeight: 600 }}
            >
              <span aria-hidden="true" style={{ color: T.red }}>◉</span>
              Health
            </button>
            <span style={{
              background: `${T.red}1a`, color: T.red,
              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            }}>Admin</span>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="ss-admin-summary" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
            {[
              { label: "Total users", value: summary.total_users, color: T.blue },
              { label: "Active users", value: summary.active_users, color: T.green },
              { label: "Deactivated", value: summary.deactivated_users, color: T.red },
              { label: "Courses", value: summary.total_courses, color: T.text },
            ].map((s) => (
              <div key={s.label} style={{
                background: T.card, borderRadius: 12, padding: "16px 20px",
                border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 11, color: T.text2, fontWeight: 500, marginBottom: 6 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["users", "courses"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "7px 18px", borderRadius: 7, border: "none",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                background: tab === t ? T.red : "transparent",
                color: tab === t ? "#fff" : T.text2,
              }}
            >
              {t === "users" ? "👥 Users" : "🎓 Courses"}
            </button>
          ))}
        </div>

        {/* ── Users tab ── */}
        {tab === "users" && (
          <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            {/* Toolbar */}
            <div className="ss-admin-toolbar" style={{
              padding: "14px 18px", borderBottom: `1px solid ${T.border}`,
              display: "flex", gap: 10, alignItems: "center",
            }}>
              <input
                placeholder="Search name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 7,
                  border: `1px solid ${T.border}`, background: T.bg3,
                  color: T.text, fontSize: 13, outline: "none",
                }}
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 7, border: `1px solid ${T.border}`,
                  fontSize: 13, background: T.bg3, color: T.text, cursor: "pointer",
                }}
              >
                <option value="all">All roles</option>
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => exportCsv("users")}
                title="Download as CSV"
                style={{
                  padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: "transparent", color: T.text2, whiteSpace: "nowrap",
                }}
              >
                ⬇ Export CSV
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: T.text2, fontSize: 13 }}>
                Loading…
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: T.text2, fontSize: 13 }}>
                No users found
              </div>
            ) : (
              <div className="ss-admin-table-scroll">
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.bg3 }}>
                    {["Name", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, color: T.text2,
                        textTransform: "uppercase", letterSpacing: ".5px",
                        borderBottom: `1px solid ${T.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: i < users.length - 1 ? `1px solid ${T.border}` : "none",
                        background: u.is_active ? T.card : T.bg3,
                        opacity: u.is_active ? 1 : 0.7,
                      }}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500, color: T.text }}>
                        {u.name}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: T.text2 }}>
                        {u.email}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {editingRole === u.id ? (
                          <select
                            autoFocus
                            defaultValue={u.role}
                            onBlur={(e) => changeRole(u.id, e.target.value)}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            style={{
                              padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`,
                              background: T.bg3, color: T.text,
                              fontSize: 12, cursor: "pointer",
                            }}
                          >
                            <option value="student">Student</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingRole(u.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            title="Click to change role"
                          >
                            {rolePill(u.role)}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          background: u.is_active ? "#dcfce7" : "#fee2e2",
                          color: u.is_active ? "#16a34a" : "#b91c1c",
                          padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        }}>
                          {u.is_active ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: T.text2 }}>
                        {new Date(u.created_at).toLocaleDateString("en-CA")}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => toggleActive(u)}
                          style={{
                            padding: "5px 12px", borderRadius: 6, border: "none",
                            fontSize: 12, fontWeight: 500, cursor: "pointer",
                            background: u.is_active ? "#fee2e2" : "#dcfce7",
                            color: u.is_active ? "#b91c1c" : "#16a34a",
                          }}
                        >
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            {/* Footer */}
            <div className="ss-admin-toolbar" style={{
              padding: "10px 18px", borderTop: `1px solid ${T.border}`,
              fontSize: 12, color: T.text2,
            }}>
              {users.length} user{users.length !== 1 ? "s" : ""} shown
              {" · "}All actions logged with timestamp
            </div>
          </div>
        )}

        {/* ── Courses tab ── */}
        {tab === "courses" && (
          <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            {/* Toolbar */}
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${T.border}`,
              display: "flex", gap: 10, alignItems: "center",
            }}>
              <input
                placeholder="Search code, name, or department…"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 7,
                  border: `1px solid ${T.border}`, fontSize: 13, outline: "none",
                  background: T.bg3, color: T.text,
                }}
              />
              <button
                onClick={() => setShowCourseModal(true)}
                style={{
                  padding: "7px 14px", borderRadius: 7, border: "none",
                  background: T.red, color: "#fff", fontSize: 13,
                  fontWeight: 500, cursor: "pointer",
                }}
              >
                + Add course
              </button>
              <button
                onClick={() => exportCsv("courses")}
                title="Download as CSV"
                style={{
                  padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: "transparent", color: T.text2, whiteSpace: "nowrap",
                }}
              >
                ⬇ Export CSV
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: T.text2, fontSize: 13 }}>
                Loading…
              </div>
            ) : courses.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: T.text2, fontSize: 13 }}>
                No courses found
              </div>
            ) : (
              <div className="ss-admin-table-scroll">
              <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.bg3 }}>
                    {["Code", "Name", "Department", "Actions"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, color: T.text2,
                        textTransform: "uppercase", letterSpacing: ".5px",
                        borderBottom: `1px solid ${T.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{ borderBottom: i < courses.length - 1 ? `1px solid ${T.border}` : "none" }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          background: `${T.blue}1a`, color: T.blue,
                          padding: "2px 10px", borderRadius: 20,
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {c.course_code}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: T.text, fontWeight: 500 }}>
                        {c.course_name}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: T.text2 }}>
                        {c.department}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => deleteCourse(c.id, c.course_code)}
                          style={{
                            padding: "5px 12px", borderRadius: 6, border: "none",
                            fontSize: 12, fontWeight: 500, cursor: "pointer",
                            background: `${T.red}1a`, color: T.red,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            <div style={{
              padding: "10px 18px", borderTop: `1px solid ${T.border}`,
              fontSize: 12, color: T.text2,
            }}>
              {courses.length} course{courses.length !== 1 ? "s" : ""} shown
            </div>
          </div>
        )}
      </main>

      {/* ── Add course modal ── */}
      {showCourseModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div className="ss-modal-anim ss-admin-modal" style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 28,
            width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "var(--shadow)",
          }}>
            <h2 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: T.text }}>Add course</h2>
            {[
              { label: "Course code", key: "course_code", placeholder: "e.g. EECS 4314" },
              { label: "Course name", key: "course_name", placeholder: "e.g. Advanced Software Eng." },
              { label: "Department", key: "department", placeholder: "e.g. EECS" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.text2, display: "block", marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  placeholder={placeholder}
                  value={(newCourse as Record<string,string>)[key]}
                  onChange={(e) => setNewCourse((p) => ({ ...p, [key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 7,
                    border: `1px solid ${T.border}`, background: T.bg3, color: T.text,
                    fontSize: 13, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setShowCourseModal(false)}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: `1px solid ${T.border}`,
                  background: "transparent", fontSize: 13, cursor: "pointer", color: T.text,
                }}
              >
                Cancel
              </button>
              <button
                onClick={createCourse}
                disabled={!newCourse.course_code || !newCourse.course_name || !newCourse.department}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: "none",
                  background: T.red, color: "#fff", fontSize: 13,
                  fontWeight: 500, cursor: "pointer",
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

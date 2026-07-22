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

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const [tab, setTab] = useState<Tab>("users");
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

  // ── data fetching ─────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSummary = useCallback(async () => {
    const r = await fetch(`${API}/admin/dashboard`, { headers: authHeaders() });
    if (r.ok) setSummary(await r.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (userSearch) params.set("search", userSearch);
    if (roleFilter !== "all") params.set("role", roleFilter);
    const r = await fetch(`${API}/admin/users?${params}`, { headers: authHeaders() });
    if (r.ok) setUsers(await r.json());
    setLoading(false);
  }, [userSearch, roleFilter]);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (courseSearch) params.set("search", courseSearch);
    const r = await fetch(`${API}/admin/courses?${params}`, { headers: authHeaders() });
    if (r.ok) setCourses(await r.json());
    setLoading(false);
  }, [courseSearch]);

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
    <div style={{ minHeight: "100vh", background: "#f9f9f7", fontFamily: "system-ui, sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "#16a34a" : "#dc2626",
          color: "#fff", padding: "10px 18px", borderRadius: 8,
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.15)",
          transition: "opacity .2s",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #e5e5e2",
        padding: "0 32px", display: "flex", alignItems: "center",
        height: 56, gap: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "#dbeafe",
          color: "#1d4ed8", display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 700, fontSize: 14,
        }}>S</div>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#111" }}>StudySynq</span>
        <span style={{ color: "#9ca3af", fontSize: 13, marginLeft: 4 }}>/</span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Admin Console</span>
        <div style={{ flex: 1 }} />
        <span style={{
          background: "#fee2e2", color: "#b91c1c",
          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
        }}>Admin</span>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* Summary cards */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
            {[
              { label: "Total users", value: summary.total_users, color: "#1d4ed8", bg: "#dbeafe" },
              { label: "Active users", value: summary.active_users, color: "#16a34a", bg: "#dcfce7" },
              { label: "Deactivated", value: summary.deactivated_users, color: "#b91c1c", bg: "#fee2e2" },
              { label: "Courses", value: summary.total_courses, color: "#7c3aed", bg: "#ede9fe" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "#fff", borderRadius: 10, padding: "16px 20px",
                border: "1px solid #e5e5e2",
              }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>
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
                background: tab === t ? "#1d4ed8" : "transparent",
                color: tab === t ? "#fff" : "#6b7280",
              }}
            >
              {t === "users" ? "👥 Users" : "🎓 Courses"}
            </button>
          ))}
        </div>

        {/* ── Users tab ── */}
        {tab === "users" && (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e2" }}>
            {/* Toolbar */}
            <div style={{
              padding: "14px 18px", borderBottom: "1px solid #e5e5e2",
              display: "flex", gap: 10, alignItems: "center",
            }}>
              <input
                placeholder="Search name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 7,
                  border: "1px solid #d1d5db", fontSize: 13, outline: "none",
                }}
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 7, border: "1px solid #d1d5db",
                  fontSize: 13, background: "#fff", cursor: "pointer",
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
                  padding: "7px 14px", borderRadius: 7, border: "1px solid #d1d5db",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: "#fff", color: "#374151", whiteSpace: "nowrap",
                }}
              >
                ⬇ Export CSV
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Loading…
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                No users found
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Name", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, color: "#6b7280",
                        textTransform: "uppercase", letterSpacing: ".5px",
                        borderBottom: "1px solid #e5e5e2",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: i < users.length - 1 ? "1px solid #f3f4f6" : "none",
                        background: u.is_active ? "#fff" : "#fafafa",
                        opacity: u.is_active ? 1 : 0.7,
                      }}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500, color: "#111" }}>
                        {u.name}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>
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
                              padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
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
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>
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
            )}

            {/* Footer */}
            <div style={{
              padding: "10px 18px", borderTop: "1px solid #e5e5e2",
              fontSize: 12, color: "#9ca3af",
            }}>
              {users.length} user{users.length !== 1 ? "s" : ""} shown
              {" · "}All actions logged with timestamp
            </div>
          </div>
        )}

        {/* ── Courses tab ── */}
        {tab === "courses" && (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e2" }}>
            {/* Toolbar */}
            <div style={{
              padding: "14px 18px", borderBottom: "1px solid #e5e5e2",
              display: "flex", gap: 10, alignItems: "center",
            }}>
              <input
                placeholder="Search code, name, or department…"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 7,
                  border: "1px solid #d1d5db", fontSize: 13, outline: "none",
                }}
              />
              <button
                onClick={() => setShowCourseModal(true)}
                style={{
                  padding: "7px 14px", borderRadius: 7, border: "none",
                  background: "#1d4ed8", color: "#fff", fontSize: 13,
                  fontWeight: 500, cursor: "pointer",
                }}
              >
                + Add course
              </button>
              <button
                onClick={() => exportCsv("courses")}
                title="Download as CSV"
                style={{
                  padding: "7px 14px", borderRadius: 7, border: "1px solid #d1d5db",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: "#fff", color: "#374151", whiteSpace: "nowrap",
                }}
              >
                ⬇ Export CSV
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Loading…
              </div>
            ) : courses.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                No courses found
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Code", "Name", "Department", "Actions"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, color: "#6b7280",
                        textTransform: "uppercase", letterSpacing: ".5px",
                        borderBottom: "1px solid #e5e5e2",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{ borderBottom: i < courses.length - 1 ? "1px solid #f3f4f6" : "none" }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          background: "#ede9fe", color: "#7c3aed",
                          padding: "2px 10px", borderRadius: 20,
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {c.course_code}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#111", fontWeight: 500 }}>
                        {c.course_name}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>
                        {c.department}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => deleteCourse(c.id, c.course_code)}
                          style={{
                            padding: "5px 12px", borderRadius: 6, border: "none",
                            fontSize: 12, fontWeight: 500, cursor: "pointer",
                            background: "#fee2e2", color: "#b91c1c",
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{
              padding: "10px 18px", borderTop: "1px solid #e5e5e2",
              fontSize: 12, color: "#9ca3af",
            }}>
              {courses.length} course{courses.length !== 1 ? "s" : ""} shown
            </div>
          </div>
        )}
      </div>

      {/* ── Add course modal ── */}
      {showCourseModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 28,
            width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}>
            <h2 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600 }}>Add course</h2>
            {[
              { label: "Course code", key: "course_code", placeholder: "e.g. EECS 4314" },
              { label: "Course name", key: "course_name", placeholder: "e.g. Advanced Software Eng." },
              { label: "Department", key: "department", placeholder: "e.g. EECS" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  placeholder={placeholder}
                  value={(newCourse as Record<string,string>)[key]}
                  onChange={(e) => setNewCourse((p) => ({ ...p, [key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 7,
                    border: "1px solid #d1d5db", fontSize: 13, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setShowCourseModal(false)}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: "1px solid #d1d5db",
                  background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151",
                }}
              >
                Cancel
              </button>
              <button
                onClick={createCourse}
                disabled={!newCourse.course_code || !newCourse.course_name || !newCourse.department}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: "none",
                  background: "#1d4ed8", color: "#fff", fontSize: 13,
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
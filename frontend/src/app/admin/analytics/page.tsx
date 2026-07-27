"use client";

/**
 * /admin/analytics — Platform Analytics Overview (US-F.6).
 * Admin-only. Aggregated platform stats (from PostgreSQL): summary cards,
 * most-active courses/groups, and a recent-activity feed. Non-admins redirected.
 */

import { useEffect, useState, CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useAnalyticsOverview } from "@/lib/hooks";
import { relativeTime } from "@/lib/notifications";

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

const ACTIVITY_ICON: Record<string, string> = {
  group: "⚇", session: "▦", resource: "⊟", announcement: "📢", task: "✓",
};

const th: CSSProperties = {
  textAlign: "left", fontSize: 11, fontWeight: 700, color: T.text2,
  textTransform: "uppercase", letterSpacing: "0.04em", padding: "9px 12px",
  borderBottom: `1px solid ${T.border}`,
};
const td: CSSProperties = { fontSize: 13, color: T.text, padding: "10px 12px", borderBottom: `1px solid ${T.border}` };
const sectionLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: T.text2, textTransform: "uppercase",
  letterSpacing: "0.06em", margin: "26px 0 10px",
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: "0 0 2px" }}>{value}</p>
      <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{label}</p>
    </div>
  );
}

/** A thin proportional bar for a value relative to a row max. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ width: 60, height: 5, borderRadius: 3, background: T.bg3, display: "inline-block", verticalAlign: "middle" }}>
      <div style={{ height: "100%", borderRadius: 3, background: T.red, width: `${pct}%` }} />
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p style={{ padding: 20, fontSize: 13, color: T.text2, margin: 0, textAlign: "center" }}>{msg}</p>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const { data, loading } = useAnalyticsOverview();

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    if (localStorage.getItem("ss_user_role") !== "admin") { router.replace("/dashboard"); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  const courses = data?.most_active_courses ?? [];
  const groups = data?.most_active_groups ?? [];
  const activity = data?.recent_activity ?? [];
  const courseMax = Math.max(1, ...courses.map((c) => c.session_count));
  const groupMax = Math.max(1, ...groups.map((g) => g.session_count + g.resource_count));

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Platform analytics</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {loading ? (
          <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
        ) : !data ? (
          <p style={{ color: T.red, fontSize: 13 }}>Couldn&apos;t load analytics.</p>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <StatCard label="Total users" value={data.total_users} />
              <StatCard label="Active users" value={data.active_users} />
              <StatCard label="Total groups" value={data.total_groups} />
              <StatCard label="Active groups" value={data.active_groups} />
              <StatCard label="Sessions this week" value={data.sessions_this_week} />
              <StatCard label="Uploaded resources" value={data.total_resources} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Most active courses */}
              <div>
                <p style={sectionLabel}>Most active courses</p>
                <Card>
                  {courses.length === 0 ? <Empty msg="No course activity yet." /> : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>{["Course", "Groups", "Sessions", "Resources", "Members"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {courses.map((c) => (
                          <tr
                            key={c.course_code}
                            onClick={() => router.push("/courses")}
                            title="Open the course catalogue"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={td}>
                              <span style={{ fontWeight: 600 }}>{c.course_code}</span>
                              <span style={{ color: T.text2, marginLeft: 6, fontSize: 11 }}>{c.course_name}</span>
                              <span style={{ color: T.text2, marginLeft: 6, fontSize: 11 }}>↗</span>
                            </td>
                            <td style={td}>{c.group_count}</td>
                            <td style={td}>{c.session_count} <Bar value={c.session_count} max={courseMax} /></td>
                            <td style={td}>{c.resource_count}</td>
                            <td style={td}>{c.member_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>

              {/* Most active groups */}
              <div>
                <p style={sectionLabel}>Most active groups</p>
                <Card>
                  {groups.length === 0 ? <Empty msg="No group activity yet." /> : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>{["Group", "Members", "Sessions", "Resources"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {groups.map((g) => (
                          <tr
                            key={g.id}
                            onClick={() => router.push(`/groups/${g.id}`)}
                            title="Open this group"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ ...td, fontWeight: 600 }}>{g.name}<span style={{ color: T.text2, marginLeft: 6, fontSize: 11, fontWeight: 400 }}>↗</span></td>
                            <td style={td}>{g.member_count}</td>
                            <td style={td}>{g.session_count} <Bar value={g.session_count + g.resource_count} max={groupMax} /></td>
                            <td style={td}>{g.resource_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>
            </div>

            {/* Recent platform activity */}
            <p style={sectionLabel}>Recent platform activity</p>
            <Card>
              {activity.length === 0 ? <Empty msg="No recent activity yet." /> : (
                <div>
                  {activity.map((a, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      borderBottom: i < activity.length - 1 ? `1px solid ${T.border}` : "none",
                    }}>
                      <span style={{ fontSize: 15, width: 20, textAlign: "center", color: T.text2 }}>{ACTIVITY_ICON[a.type] ?? "•"}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ textTransform: "capitalize", color: T.text2, marginRight: 6 }}>{a.type}</span>
                        {a.title}
                      </span>
                      <span style={{ fontSize: 11, color: T.text2, whiteSpace: "nowrap" }}>{a.created_at ? relativeTime(a.created_at) : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

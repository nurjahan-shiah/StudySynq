"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import {
  useMyGroups,
  useEnrolledCourses,
  useMySessions,
  useRecommendations,
  useMyTasks,
} from "@/lib/hooks";
import { STATUS_META, fmtDue, dueMeta } from "@/lib/tasks";

const T = {
  bg:     "var(--bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  blue:   "var(--ss-blue)",
  green:  "var(--ss-green)",
  yellow: "var(--ss-yellow)",
} as const;

// ── shared bits ───────────────────────────────────────────────────────────

function SectionHeader({
  title, actionLabel, onAction,
}: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>
      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            fontSize: 12, fontWeight: 600, color: T.red, background: "transparent",
            border: "none", cursor: "pointer", padding: 0,
          }}
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

function Panel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 16,
      padding: "20px 22px", ...style,
    }}>
      {children}
    </div>
  );
}

function Empty({ icon, msg, cta, onCta }: { icon: string; msg: string; cta?: string; onCta?: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "34px 10px", color: T.text2 }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%", margin: "0 auto 14px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, background: T.bg3, border: `1px dashed ${T.border}`,
      }}>
        {icon}
      </div>
      <p style={{ fontSize: 13, margin: cta ? "0 0 14px" : 0 }}>{msg}</p>
      {cta && (
        <button onClick={onCta} className="ss-btn-ghost" style={{ fontSize: 12, padding: "7px 16px" }}>
          {cta}
        </button>
      )}
    </div>
  );
}

// Deterministic accent color from the palette, keyed off a string
const PALETTE = [T.blue, T.green, T.yellow, T.red];
function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Stat card w/ inline sparkline-ish accent bar ─────────────────────────────

function StatCard({
  label, value, icon, color, delay = 0,
}: { label: string; value: string | number; icon: string; color: string; delay?: number }) {
  return (
    <div
      className="ss-reveal visible"
      style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: "16px 18px", position: "relative", overflow: "hidden",
        transitionDelay: `${delay}ms`,
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: color,
      }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 11, color: T.text2, marginBottom: 6, fontWeight: 600 }}>{label}</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.5px" }}>{value}</p>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: `${color}1a`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────

function GroupCard({
  id, name, role, memberCount, courseCodes, onClick,
}: { id: string; name: string; role: string; memberCount: number; courseCodes: string[]; onClick: () => void }) {
  const color = colorFor(id);
  return (
    <div
      onClick={onClick}
      role="button" tabIndex={0}
      style={{
        background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: "14px 16px", cursor: "pointer", transition: "border-color .15s, transform .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name}
          </p>
          <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </p>
        </div>
        {role === "leader" && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
            background: `${T.red}1a`, color: T.red, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
          }}>
            Lead
          </span>
        )}
      </div>
      {courseCodes.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {courseCodes.slice(0, 3).map(c => (
            <span key={c} style={{
              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
              background: T.card, border: `1px solid ${T.border}`, color: T.text2,
            }}>
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Session row ───────────────────────────────────────────────────────────

function SessionRow({
  title, groupName, scheduledAt, onClick,
}: { title: string; groupName: string; scheduledAt: string; onClick: () => void }) {
  const d = new Date(scheduledAt);
  const month = d.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const day = d.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div
      onClick={onClick}
      role="button" tabIndex={0}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "10px 4px",
        borderBottom: `1px solid ${T.border}`, cursor: "pointer",
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: T.bg3, flexShrink: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        border: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: T.red, letterSpacing: "0.04em" }}>{month}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: T.text, lineHeight: 1 }}>{day}</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </p>
        <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{groupName} · {time}</p>
      </div>
    </div>
  );
}

// ── Recommendation row (match-score bar) ─────────────────────────────────

function RecommendationRow({
  name, score, courseCodes,
}: { name: string; score: number; courseCodes?: string[] }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? T.green : pct >= 50 ? T.yellow : T.text2;
  return (
    <div style={{ padding: "10px 4px", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{name}</p>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}% match</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: T.bg3, overflow: "hidden", marginBottom: courseCodes?.length ? 6 : 0 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      {courseCodes && courseCodes.length > 0 && (
        <p style={{ fontSize: 10.5, color: T.text2, margin: 0 }}>{courseCodes.join(", ")}</p>
      )}
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────

function TaskRow({
  title, status, dueDate, groupName,
}: { title: string; status: "todo" | "in_progress" | "completed"; dueDate: string | null; groupName: string }) {
  const meta = STATUS_META[status];
  const due = dueMeta(dueDate, status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${T.border}` }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: meta.color, flexShrink: 0,
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          fontSize: 12.5, fontWeight: 600, color: status === "completed" ? T.text2 : T.text, margin: 0,
          textDecoration: status === "completed" ? "line-through" : "none",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {title}
        </p>
        <p style={{ fontSize: 10.5, color: T.text2, margin: 0 }}>{groupName}</p>
      </div>
      {dueDate && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: due.color, flexShrink: 0 }}>
          {due.overdue ? "Overdue" : fmtDue(dueDate)}
        </span>
      )}
    </div>
  );
}

// ── Course pill ───────────────────────────────────────────────────────────

function CoursePill({ code, name }: { code: string; name: string }) {
  const color = colorFor(code);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, background: T.bg3,
      border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px",
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8, background: `${color}1a`, color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800, flexShrink: 0,
      }}>
        {code.slice(0, 2)}
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: 0 }}>{code}</p>
        <p style={{ fontSize: 10.5, color: T.text2, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    setUserId(localStorage.getItem("ss_user_id") ?? "");
    setUserName(localStorage.getItem("ss_user_name") ?? "");
  }, []);

  const { data: groups, loading: groupsLoading } = useMyGroups(userId);
  const { data: courses, loading: coursesLoading } = useEnrolledCourses(userId);
  const { data: sessions, loading: sessionsLoading } = useMySessions(groups);
  const { data: recs, loading: recsLoading } = useRecommendations();
  const { data: tasks, loading: tasksLoading } = useMyTasks(userId);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions.filter(s => new Date(s.scheduled_at).getTime() >= now).slice(0, 4);
  }, [sessions]);

  const openTasks = useMemo(
    () => (tasks ?? []).filter(t => t.status !== "completed")
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
      .slice(0, 5),
    [tasks]
  );

  const completedCount = (tasks ?? []).filter(t => t.status === "completed").length;
  const taskProgress = tasks && tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : "there";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto" }}>

        {/* ── Hero banner ── */}
        <div style={{
          position: "relative", overflow: "hidden",
          padding: "30px 32px 26px", borderBottom: `1px solid ${T.border}`,
          background: T.bg2,
        }}>
          <div style={{
            position: "absolute", width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(214,48,49,.12) 0%, transparent 70%)",
            filter: "blur(60px)", top: "-40%", right: "5%", pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(9,132,227,.10) 0%, transparent 70%)",
            filter: "blur(60px)", bottom: "-50%", left: "20%", pointerEvents: "none",
          }} />

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: T.red, letterSpacing: 1.5, textTransform: "uppercase", margin: "0 0 6px" }}>
                {greeting}
              </p>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.5px" }}>
                Welcome back, {firstName}
              </h1>
              <p style={{ fontSize: 13, color: T.text2, margin: "6px 0 0" }}>
                Here&apos;s what&apos;s happening across your workspace.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <NotificationBell />
              <ProfileButton />
            </div>
          </div>
        </div>

        <div style={{ padding: "24px 32px 40px" }}>

          {/* ── Stat cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 26 }}>
            <StatCard label="My groups"         value={groupsLoading ? "—" : groups.length}            icon="👥" color={T.blue} delay={0} />
            <StatCard label="Upcoming sessions" value={sessionsLoading ? "—" : upcomingSessions.length} icon="📅" color={T.green} delay={40} />
            <StatCard label="Recommended"       value={recsLoading ? "—" : recs.length}                 icon="✦" color={T.yellow} delay={80} />
            <StatCard label="Task progress"     value={tasksLoading ? "—" : `${taskProgress}%`}         icon="✓" color={T.red} delay={120} />
          </div>

          {/* ── Main grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, marginBottom: 18 }}>

            {/* My groups */}
            <Panel>
              <SectionHeader title="My groups" actionLabel="View all" onAction={() => router.push("/groups")} />
              {groupsLoading ? (
                <p style={{ fontSize: 12, color: T.text2 }}>Loading…</p>
              ) : groups.length === 0 ? (
                <Empty icon="⚇" msg="You're not in any groups yet." cta="Browse groups" onCta={() => router.push("/groups")} />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {groups.slice(0, 4).map(g => (
                    <GroupCard
                      key={g.id}
                      id={g.id}
                      name={g.name}
                      role={g.my_role}
                      memberCount={g.member_count}
                      courseCodes={g.course_codes ?? []}
                      onClick={() => router.push(`/groups/${g.id}`)}
                    />
                  ))}
                </div>
              )}
            </Panel>

            {/* Upcoming sessions */}
            <Panel>
              <SectionHeader title="Upcoming sessions" actionLabel="View all" onAction={() => router.push("/sessions")} />
              {sessionsLoading ? (
                <p style={{ fontSize: 12, color: T.text2 }}>Loading…</p>
              ) : upcomingSessions.length === 0 ? (
                <Empty icon="▦" msg="No upcoming sessions." />
              ) : (
                <div>
                  {upcomingSessions.map(s => (
                    <SessionRow
                      key={s.id}
                      title={s.title}
                      groupName={s.group_name}
                      scheduledAt={s.scheduled_at}
                      onClick={() => router.push(`/sessions/${s.id}`)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>

            {/* Recommended */}
            <Panel>
              <SectionHeader title="Recommended for you" actionLabel="View all" onAction={() => router.push("/recommendations")} />
              {recsLoading ? (
                <p style={{ fontSize: 12, color: T.text2 }}>Loading…</p>
              ) : recs.length === 0 ? (
                <Empty icon="✦" msg="No recommendations yet." />
              ) : (
                <div>
                  {recs.slice(0, 4).map(r => (
                    <RecommendationRow key={r.group_id} name={r.name} score={r.score} courseCodes={r.course_codes} />
                  ))}
                </div>
              )}
            </Panel>

            {/* My tasks */}
            <Panel>
              <SectionHeader title="My tasks" actionLabel="View all" onAction={() => router.push("/tasks")} />
              {tasksLoading ? (
                <p style={{ fontSize: 12, color: T.text2 }}>Loading…</p>
              ) : openTasks.length === 0 ? (
                <Empty icon="✓" msg="You're all caught up." />
              ) : (
                <div>
                  {openTasks.map(t => (
                    <TaskRow key={t.id} title={t.title} status={t.status} dueDate={t.due_date} groupName={t.group_name} />
                  ))}
                </div>
              )}
            </Panel>

            {/* My courses */}
            <Panel>
              <SectionHeader title="My courses" actionLabel="Browse" onAction={() => router.push("/courses")} />
              {coursesLoading ? (
                <p style={{ fontSize: 12, color: T.text2 }}>Loading…</p>
              ) : (courses ?? []).length === 0 ? (
                <Empty icon="◎" msg="No courses enrolled." cta="Enroll now" onCta={() => router.push("/courses")} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(courses ?? []).slice(0, 4).map(c => (
                    <CoursePill key={c.id} code={c.course_code} name={c.course_name} />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
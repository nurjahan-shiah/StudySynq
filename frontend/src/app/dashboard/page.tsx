"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { SocialFeed } from "@/app/components/SocialFeed";
import { FriendsPanel } from "@/app/components/FriendsPanel";
import {
  useMyGroups,
  useMySessions,
  useRecommendations,
  useMyTasks,
} from "@/lib/hooks";

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

function StatCard({
  label, value, icon, color, delay = 0, onClick,
}: {
  label: string; value: string | number; icon: string; color: string;
  delay?: number; onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const clickable = Boolean(onClick);

  return (
    <div
      className="ss-reveal visible"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); }
      }}
      style={{
        background: T.card,
        border: `1px solid ${hover && clickable ? color : T.border}`,
        borderRadius: 14,
        padding: "16px 18px", position: "relative", overflow: "hidden",
        transitionDelay: `${delay}ms`,
        cursor: clickable ? "pointer" : "default",
        transform: hover && clickable ? "translateY(-2px)" : "none",
        boxShadow: hover && clickable ? "0 6px 18px rgba(0,0,0,.08)" : "none",
        transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
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

function AdminQuickAction({
  icon, title, description, onClick,
}: { icon: string; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%",
        padding: "15px 16px", textAlign: "left", cursor: "pointer",
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        color: T.text, transition: "border-color .15s, transform .15s, box-shadow .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.red;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "var(--shadow)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span style={{
        width: 40, height: 40, flexShrink: 0, borderRadius: 11,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${T.red}1a`, color: T.red, fontSize: 17,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{title}</span>
        <span style={{ display: "block", fontSize: 11.5, color: T.text2 }}>{description}</span>
      </span>
      <span aria-hidden="true" style={{ color: T.red, fontSize: 16 }}>→</span>
    </button>
  );
}

// ── Group card ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setUserId(localStorage.getItem("ss_user_id") ?? "");
    setUserName(localStorage.getItem("ss_user_name") ?? "");
    setIsAdmin(localStorage.getItem("ss_user_role") === "admin");
  }, []);

  const { data: groups, loading: groupsLoading } = useMyGroups(userId);
  const { data: sessions, loading: sessionsLoading } = useMySessions(groups);
  const { data: recs, loading: recsLoading } = useRecommendations();
  const { data: tasks, loading: tasksLoading } = useMyTasks(userId);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions.filter(s => new Date(s.scheduled_at).getTime() >= now).slice(0, 4);
  }, [sessions]);

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

          {/* ── Stat cards — each one links to its full page ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 26 }}>
            <StatCard
              label="My groups" value={groupsLoading ? "—" : groups.length}
              icon="👥" color={T.blue} delay={0}
              onClick={() => router.push("/groups")}
            />
            <StatCard
              label="Upcoming sessions" value={sessionsLoading ? "—" : upcomingSessions.length}
              icon="📅" color={T.green} delay={40}
              onClick={() => router.push("/sessions")}
            />
            <StatCard
              label="Recommended" value={recsLoading ? "—" : recs.length}
              icon="✦" color={T.yellow} delay={80}
              onClick={() => router.push("/recommendations")}
            />
            <StatCard
              label="Task progress" value={tasksLoading ? "—" : `${taskProgress}%`}
              icon="✓" color={T.red} delay={120}
              onClick={() => router.push("/tasks")}
            />
          </div>

          {isAdmin && (
            <section style={{ marginBottom: 26 }}>
              <SectionHeader title="Admin actions" />
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14,
              }}>
                <AdminQuickAction
                  icon="⚙"
                  title="Manage courses"
                  description="Create, search, export, and remove catalogue courses."
                  onClick={() => router.push("/admin")}
                />
                <AdminQuickAction
                  icon="◉"
                  title="System health"
                  description="Review service availability and response times."
                  onClick={() => router.push("/admin/health")}
                />
                <AdminQuickAction
                  icon="◔"
                  title="Analytics"
                  description="Review platform activity, engagement, and group insights."
                  onClick={() => router.push("/admin/analytics")}
                />
                <AdminQuickAction
                  icon="⚑"
                  title="Moderation"
                  description="Review and manage reported or inappropriate content."
                  onClick={() => router.push("/admin/moderation")}
                />
              </div>
            </section>
          )}

          {/* ── Campus feed (main) + friends (sidebar) ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 20, alignItems: "start",
          }}>
            <div style={{ minWidth: 0 }}>
              <SectionHeader title="Campus feed" />
              <SocialFeed myGroups={groups} />
            </div>

            <div>
              <SectionHeader title="Friends" />
              <FriendsPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
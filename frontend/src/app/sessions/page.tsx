"use client";

// US-C.3 — Session List & Timeline View
// @author: Muhammad Fahad Sohail

import { useState, useEffect, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useMyGroups, useMySessions, type SessionWithGroup, type MyGroup } from "@/lib/hooks";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

function isUpcoming(iso: string): boolean {
  return new Date(iso) >= new Date();
}

// ── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: SessionWithGroup }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const upcoming = isUpcoming(session.scheduled_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/sessions/${session.id}`)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/sessions/${session.id}`); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 18px",
        borderRadius: 12,
        border: `1px solid ${hovered ? T.red : T.border}`,
        background: hovered ? `${T.red}08` : T.card,
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s",
        opacity: upcoming ? 1 : 0.65,
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.3 }}>
          {session.title}
        </p>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
          background: upcoming ? `${T.red}18` : T.bg3,
          color: upcoming ? T.red : T.text2,
          border: `1px solid ${upcoming ? `${T.red}30` : T.border}`,
        }}>
          {upcoming ? "Upcoming" : "Past"}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        <span style={{ fontSize: 12, color: T.text2 }}>▦ {formatDate(session.scheduled_at)} · {formatTime(session.scheduled_at)}</span>
        <span style={{ fontSize: 12, color: T.text2 }}>⚇ {session.group_name}</span>
        {session.location && (
          <span style={{ fontSize: 12, color: T.text2 }}>⊙ {session.location}</span>
        )}
      </div>

      {session.description && (
        <p style={{
          fontSize: 12, color: T.text2, margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {session.description}
        </p>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, sessions, emptyMsg }: { label: string; sessions: SessionWithGroup[]; emptyMsg: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 11, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
        {label} <span style={{ fontWeight: 400 }}>({sessions.length})</span>
      </h2>
      {sessions.length === 0 ? (
        <p style={{ fontSize: 13, color: T.text2, padding: "12px 0" }}>{emptyMsg}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map(s => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "upcoming" | "past";

export default function SessionsPage() {
  const router = useRouter();
  const [userId, setUserId]     = useState("");
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState<FilterMode>("upcoming");
  const [groupId, setGroupId]   = useState("all");

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  const { data: myGroups, loading: groupsLoading } = useMyGroups(userId);
  const { data: sessions, loading: sessionsLoading, error } = useMySessions(myGroups);

  const loading = groupsLoading || sessionsLoading;

  const filtered = sessions.filter(s => {
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
                        s.group_name.toLowerCase().includes(search.toLowerCase()) ||
                        (s.location ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (groupId !== "all" && s.group_id !== groupId) return false;
    if (filter === "upcoming") return isUpcoming(s.scheduled_at);
    if (filter === "past")     return !isUpcoming(s.scheduled_at);
    return true;
  });

  const upcoming = filtered.filter(s => isUpcoming(s.scheduled_at));
  const past     = filtered.filter(s => !isUpcoming(s.scheduled_at)).reverse();

  const chipStyle = (active: boolean): CSSProperties => ({
    padding: "4px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? T.red : T.border}`,
    background: active ? `${T.red}15` : "transparent",
    color: active ? T.red : T.text2,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Sessions</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Search + filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search sessions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 180, padding: "7px 12px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.bg2,
              color: T.text, fontSize: 13, outline: "none",
            }}
          />

          {/* Group filter */}
          {myGroups.length > 1 && (
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              style={{
                padding: "7px 10px", borderRadius: 8, fontSize: 12,
                border: `1px solid ${T.border}`, background: T.bg2,
                color: T.text, cursor: "pointer", outline: "none",
              }}
            >
              <option value="all">All groups</option>
              {myGroups.map((g: MyGroup) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}

          {/* Time filter chips */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["upcoming", "past", "all"] as FilterMode[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={chipStyle(filter === f)}>
                {f === "upcoming" ? "Upcoming" : f === "past" ? "Past" : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: "60px 0", textAlign: "center", color: T.text2, fontSize: 13 }}>
            Loading sessions…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: "60px 0", textAlign: "center", color: T.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && sessions.length === 0 && (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>▦</div>
            <p style={{ fontSize: 13, color: T.text2, margin: 0 }}>No sessions in your groups yet.</p>
          </div>
        )}

        {/* Session lists */}
        {!loading && !error && sessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {(filter === "all" || filter === "upcoming") && (
              <Section
                label="Upcoming"
                sessions={upcoming}
                emptyMsg="No upcoming sessions."
              />
            )}
            {(filter === "all" || filter === "past") && (
              <Section
                label="Past"
                sessions={past}
                emptyMsg="No past sessions."
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

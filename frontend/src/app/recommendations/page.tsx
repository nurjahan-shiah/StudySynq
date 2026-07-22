"use client";

/**
 * frontend/src/app/recommendations/page.tsx
 * /recommendations — ranked study-group matches for the logged-in user (US-F.4).
 *
 * Backend:
 *   GET /recommendations — recommendations-service (port 8008)
 *   Returns { recommendations: [{ group_id, name, score }], source: "ml_pipeline" | "fallback" }
 *   "ml_pipeline"  -> scikit-learn course-overlap similarity model (DuckDB-computed, written to Postgres)
 *   "fallback"     -> live overlap count, used until the ML pipeline has run for this user
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import { explainRecommendation, joinGroup, leaveGroup } from "@/lib/hooks";
import { getMajorRecommendations, type MajorRecommendationsResponse, type MajorRecommendation } from "@/lib/social";
import { ProfileSetupModal } from "@/app/components/ProfileSetupModal";

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

interface RecommendationRow {
  group_id: string;
  name: string;
  score: number;
}

interface RecommendationsResponse {
  recommendations: RecommendationRow[];
  source: "ml_pipeline" | "fallback";
}

// Score comes back either as a 0–1 similarity (ML pipeline) or a 0–100
// overlap-count score (fallback) — normalize both to a 0–100 percentage.
function toPercent(score: number): number {
  const pct = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function matchColor(pct: number): string {
  if (pct >= 75) return T.green;
  if (pct >= 45) return T.yellow;
  return T.text2;
}

function matchLabel(pct: number): string {
  if (pct >= 75) return "Strong match";
  if (pct >= 45) return "Good match";
  return "Possible match";
}

// ── Circular percentage ring ─────────────────────────────────────────────

function MatchRing({ pct }: { pct: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  const color = matchColor(pct);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.bg3} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 800, color: T.text,
      }}>
        {pct}%
      </div>
    </div>
  );
}

// ── Recommendation card ──────────────────────────────────────────────────

function RecommendationCard({
  rec, joinedExternally, onJoined,
}: {
  rec: RecommendationRow;
  joinedExternally: boolean;
  onJoined: (groupId: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const router = useRouter();
  const pct = toPercent(rec.score);
  const color = matchColor(pct);

  // The same group can appear in both this list and "For your major", so a
  // join over there has to disable the button here too — otherwise clicking
  // it returns "Already a member" and the user sees an error for something
  // they already did.
  const isJoined = joined || joinedExternally;

  async function handleJoin() {
    setJoining(true);
    setJoinError(null);
    const res = await joinGroup(rec.group_id);
    setJoining(false);
    if (res.error) {
      setJoinError(res.error);
      return;
    }
    setJoined(true);
    onJoined(rec.group_id);
  }

  async function handleExplain() {
    if (explanation) {
      setExplanation(null);
      return;
    }

    setExplaining(true);
    setExplanationError(null);
    const res = await explainRecommendation(rec.group_id);
    setExplaining(false);

    if (res.error || !res.data?.explanation) {
      setExplanationError("We couldn't load the match details right now.");
      return;
    }

    setExplanation(res.data.explanation);
  }

  return (
    <div className="ss-card" style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <MatchRing pct={pct} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>{rec.name}</h3>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color, background: `${color}1a`,
          padding: "2px 9px", borderRadius: 20, display: "inline-block",
        }}>
          {matchLabel(pct)}
        </span>
        <button
          type="button"
          onClick={handleExplain}
          disabled={explaining}
          aria-expanded={Boolean(explanation)}
          style={{
            display: "block", margin: "8px 0 0", padding: 0, border: "none",
            background: "transparent", color: T.blue, fontSize: 12,
            fontWeight: 700, cursor: explaining ? "wait" : "pointer",
          }}
        >
          {explaining ? "Finding shared courses…" : explanation ? "Hide why" : "Why this group?"}
        </button>
        {(explanation || explanationError) && (
          <p
            role={explanationError ? "alert" : undefined}
            style={{
              fontSize: 12, lineHeight: 1.5,
              color: explanationError ? T.red : T.text2,
              margin: "7px 0 0", maxWidth: 430,
            }}
          >
            {explanationError ?? explanation}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleJoin}
          disabled={joining || isJoined}
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
            border: "none", cursor: isJoined ? "default" : "pointer",
            background: isJoined ? T.bg3 : T.red,
            color: isJoined ? T.text2 : "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {isJoined ? "Joined ✓" : joining ? "Joining…" : "Join group"}
        </button>
        {joinError && (
          <p role="alert" style={{
            fontSize: 11, color: T.red, margin: 0, maxWidth: 150, lineHeight: 1.4,
          }}>
            {joinError}
          </p>
        )}
        <button
          onClick={() => router.push(`/groups/${rec.group_id}`)}
          style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: `1px solid ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer",
          }}
        >
          View group
        </button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function Empty({ noCourses }: { noCourses: boolean }) {
  const router = useRouter();
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: 340, gap: 12, color: T.text2, textAlign: "center",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%", background: T.bg3,
        border: `1px dashed ${T.border}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 24,
      }}>
        ✦
      </div>
      <p style={{ fontSize: 14, margin: 0, maxWidth: 340 }}>
        {noCourses
          ? "Enroll in a few courses and we'll match you with study groups sharing them."
          : "No recommendations yet — check back once more groups have formed around your courses."}
      </p>
      <button
        onClick={() => router.push(noCourses ? "/courses" : "/groups")}
        className="ss-btn-ghost"
        style={{ fontSize: 12.5, padding: "8px 18px" }}
      >
        {noCourses ? "Browse courses" : "Browse groups"}
      </button>
    </div>
  );
}


// ── Session time formatting ──────────────────────────────────────────────

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const dateStr = sameDay
    ? "Today"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} · ${timeStr}`;
}

// ── "For your major" — group card with activity + join ──────────────────────

function MajorGroupCard({
  group, onMembershipChange,
}: {
  group: MajorRecommendation;
  onMembershipChange: (groupId: string, joined: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Membership is owned by the parent so that joining here also updates the
  // course-overlap list below, which can contain the same group.
  const joined = group.already_joined;

  async function handleJoin() {
    setBusy(true);
    setError(null);
    const res = await joinGroup(group.group_id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onMembershipChange(group.group_id, true);
  }

  async function handleLeave() {
    setBusy(true);
    setError(null);
    const res = await leaveGroup(group.group_id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onMembershipChange(group.group_id, false);
  }

  return (
    <div className="ss-card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <MatchRing pct={group.match_pct} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: T.text, margin: 0 }}>{group.name}</p>
          {group.year_match && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: "1px 8px", borderRadius: 20,
              background: "rgba(0,184,148,.14)", color: T.green,
            }}>
              Your year
            </span>
          )}
        </div>
        {group.description && (
          <p style={{ fontSize: 11.5, color: T.text2, margin: "0 0 8px", lineHeight: 1.5 }}>
            {group.description.length > 110 ? group.description.slice(0, 110) + "…" : group.description}
          </p>
        )}
        <p style={{ fontSize: 11, color: T.text2, margin: "0 0 8px" }}>
          {group.member_count} member{group.member_count === 1 ? "" : "s"}
          {group.course_codes.length > 0 ? ` · ${group.course_codes.slice(0, 3).join(", ")}` : ""}
        </p>

        {group.upcoming_sessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {group.upcoming_sessions.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text2 }}>
                <span style={{ color: T.blue }}>●</span>
                <span style={{ fontWeight: 600, color: T.text }}>{s.title}</span>
                <span>· {formatSessionTime(s.scheduled_at)}</span>
                {s.location && <span>· {s.location}</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={joined ? handleLeave : handleJoin}
            disabled={busy}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              border: joined ? `1px solid ${T.border}` : "none",
              background: joined ? "transparent" : T.red,
              color: joined ? T.text2 : "#fff",
            }}
          >
            {busy
              ? (joined ? "Leaving…" : "Joining…")
              : (joined ? "Leave group" : "Join group")}
          </button>
          <button
            onClick={() => router.push(`/groups/${group.group_id}`)}
            style={{
              padding: "5px 14px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
              border: `1px solid ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer",
            }}
          >
            View group
          </button>
          {joined && !busy && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              background: "rgba(0,184,148,.14)", color: T.green,
            }}>
              Member
            </span>
          )}
        </div>
        {error && (
          <p role="alert" style={{ fontSize: 11, color: T.red, margin: "7px 0 0", lineHeight: 1.4 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ── "For your major" section ─────────────────────────────────────────────

const MAJOR_PAGE_SIZE = 30;

function MajorSection({
  userId, onMembershipChange,
}: {
  userId: string;
  onMembershipChange: (groupId: string, joined: boolean) => void;
}) {
  const [data, setData] = useState<MajorRecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getMajorRecommendations({ limit: MAJOR_PAGE_SIZE, offset: 0 });
    if (res.error) setError(res.error);
    setData(res.data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    if (!data) return;
    setLoadingMore(true);
    const res = await getMajorRecommendations({
      limit: MAJOR_PAGE_SIZE,
      offset: data.recommendations.length,
    });
    setLoadingMore(false);
    if (res.error || !res.data) return;
    const next = res.data;
    setData(prev => prev ? {
      ...next,
      recommendations: [...prev.recommendations, ...next.recommendations],
    } : next);
  }

  // Membership is owned here so a join/leave also updates the course-overlap
  // list below, which can contain the same group.
  function setMembership(groupId: string, joined: boolean) {
    setData(prev => prev ? {
      ...prev,
      recommendations: prev.recommendations.map(r =>
        r.group_id === groupId
          ? {
              ...r,
              already_joined: joined,
              member_count: Math.max(0, r.member_count + (joined ? 1 : -1)),
            }
          : r
      ),
    } : prev);
    onMembershipChange(groupId, joined);
  }

  const hasMore = Boolean(data && data.recommendations.length < data.total);

  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: 0 }}>
          For your major
        </h2>
        {data?.profile_complete && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
            background: `${T.blue}1a`, color: T.blue,
          }}>
            {data.major} · {data.year_of_study}
          </span>
        )}
        {data && data.total > 0 && (
          <span style={{ fontSize: 10.5, color: T.text2, fontWeight: 600 }}>
            {data.total} group{data.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 12.5, color: T.text2 }}>Loading…</p>
      ) : error ? (
        <p role="alert" style={{ fontSize: 12.5, color: T.red, margin: "6px 0 0" }}>
          Couldn&apos;t load group suggestions: {error}
        </p>
      ) : !data ? null : data.not_applicable ? (
        <p style={{ fontSize: 12.5, color: T.text2, margin: "6px 0 0" }}>
          {data.reason ?? "Group recommendations are personalised to a student's major and year."}
        </p>
      ) : !data.profile_complete ? (
        <div style={{
          background: T.card, border: `1px dashed ${T.border}`, borderRadius: 12,
          padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 22 }}>👤</span>
          <p style={{ fontSize: 12.5, color: T.text2, margin: 0, flex: 1, minWidth: 220 }}>
            Complete setting up your profile (major + year of study) to see group
            recommendations for your program.
          </p>
          <button
            onClick={() => setEditOpen(true)}
            className="ss-btn-primary"
            style={{ fontSize: 12, padding: "8px 16px" }}
          >
            Complete your profile
          </button>
        </div>
      ) : data.recommendations.length === 0 ? (
        <p style={{ fontSize: 12.5, color: T.text2, margin: "6px 0 0" }}>
          No open groups yet — check back once some have formed.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 8 }}>
            {data.recommendations.map(g => (
              <MajorGroupCard
                key={g.group_id}
                group={g}
                onMembershipChange={setMembership}
              />
            ))}
          </div>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="ss-btn-ghost"
              style={{ fontSize: 12, padding: "8px 18px", marginTop: 12 }}
            >
              {loadingMore
                ? "Loading…"
                : `Show more (${data.total - data.recommendations.length} left)`}
            </button>
          )}
        </>
      )}

      {editOpen && (
        <ProfileSetupModal
          userId={userId}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [recs, setRecs] = useState<RecommendationRow[]>([]);
  const [source, setSource] = useState<"ml_pipeline" | "fallback" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Groups joined during this page visit. The same group can appear in both
  // lists, so this is lifted here to keep their buttons in sync.
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());

  const handleMembershipChange = useCallback((groupId: string, joined: boolean) => {
    setJoinedGroupIds(prev => {
      const next = new Set(prev);
      if (joined) next.add(groupId); else next.delete(groupId);
      return next;
    });
  }, []);

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const res = await apiClient.get<RecommendationsResponse>("/recommendations");
    if (res.error) {
      setError(res.error);
    } else {
      setRecs(res.data?.recommendations ?? []);
      setSource(res.data?.source ?? null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const visibleRecs = recs.filter(r => !dismissed.has(r.group_id));

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Recommended for you</h1>
            <p style={{ fontSize: 12.5, color: T.text2, margin: "4px 0 0" }}>
              Ranked by course overlap and activity similarity with other members.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          {userId && (
            <MajorSection userId={userId} onMembershipChange={handleMembershipChange} />
          )}
        </div>

        <h2 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: "0 0 2px" }}>
          Course-overlap matches
        </h2>

        {source && !loading && (
          <div style={{ margin: "18px 0 4px" }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: source === "ml_pipeline" ? `${T.green}1a` : T.bg3,
              color: source === "ml_pipeline" ? T.green : T.text2,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {source === "ml_pipeline" ? "● Live model results" : "● Estimated match"}
            </span>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {loading ? (
            <p style={{ color: T.text2, fontSize: 13 }}>Loading…</p>
          ) : error ? (
            <p style={{ color: T.red, fontSize: 13 }}>Couldn&apos;t load recommendations: {error}</p>
          ) : visibleRecs.length === 0 ? (
            <Empty noCourses={source === "fallback" && recs.length === 0} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
              {visibleRecs.map(rec => (
                <RecommendationCard
                  key={rec.group_id}
                  rec={rec}
                  joinedExternally={joinedGroupIds.has(rec.group_id)}
                  onJoined={(groupId) => {
                    handleMembershipChange(groupId, true);
                    setTimeout(() => {
                      setDismissed(prev => new Set(prev).add(groupId));
                    }, 1200);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
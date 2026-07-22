"use client";

/**
 * frontend/src/app/recommendations/page.tsx
 * /recommendations — ranked study-group matches for the logged-in user (US-F.4).
 *
 * Backend:
 *   GET /recommendations — recommendations-service (port 8008)
 *   Returns { recommendations: [{ group_id, name, score, description,
 *             member_count, course_codes, shared_courses, next_session }],
 *             source: "ml_pipeline" | "fallback" }
 *   "ml_pipeline"  -> scikit-learn course-overlap similarity model (DuckDB-computed, written to Postgres)
 *   "fallback"     -> live overlap count, used until the ML pipeline has run for this user
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";
import { explainRecommendation, joinGroup } from "@/lib/hooks";

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

interface NextSession {
  id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
}

interface RecommendationRow {
  group_id: string;
  name: string;
  score: number;
  description?: string | null;
  member_count?: number;
  course_codes?: string[];
  shared_courses?: string[];
  next_session?: NextSession | null;
}

interface RecommendationsResponse {
  recommendations: RecommendationRow[];
  source: "ml_pipeline" | "fallback";
}

type SortKey = "match" | "members" | "activity";

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

/** Timestamps arrive UTC-marked ("+00:00"); older rows may be naive. Only
 *  append "Z" when there's no designator — doing it unconditionally would
 *  produce "+00:00Z", which parses to NaN. */
function parseServerDate(iso: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso.trim());
  return new Date(hasZone ? iso : `${iso}Z`);
}

function formatSessionTime(iso: string): string {
  const d = parseServerDate(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const date = sameDay
    ? "Today"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
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

// ── Small course chip ────────────────────────────────────────────────────

function CourseChip({ code, shared }: { code: string; shared?: boolean }) {
  return (
    <span
      title={shared ? "You're enrolled in this course" : undefined}
      style={{
        fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
        background: shared ? `${T.blue}1a` : T.bg3,
        color: shared ? T.blue : T.text2,
        border: `1px solid ${shared ? `${T.blue}33` : "transparent"}`,
        whiteSpace: "nowrap",
      }}
    >
      {code}
    </span>
  );
}

// ── Recommendation card ──────────────────────────────────────────────────

function RecommendationCard({
  rec, onJoined,
}: { rec: RecommendationRow; onJoined: (groupId: string) => void }) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const router = useRouter();
  const pct = toPercent(rec.score);
  const color = matchColor(pct);

  const shared = rec.shared_courses ?? [];
  const others = (rec.course_codes ?? []).filter(c => !shared.includes(c));
  const visibleOthers = others.slice(0, 3);
  const hiddenCount = others.length - visibleOthers.length;

  async function handleJoin() {
    setJoining(true);
    setJoinError(null);
    const res = await joinGroup(rec.group_id);
    setJoining(false);
    // Previously a failed join did nothing at all — the button just looked dead.
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
    <div
      className="ss-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: 16, alignItems: "flex-start",
        borderLeft: `3px solid ${color}`,
        transform: hover ? "translateY(-1px)" : "none",
        boxShadow: hover ? "0 6px 20px rgba(0,0,0,.10)" : "none",
        transition: "transform .15s ease, box-shadow .15s ease",
      }}
    >
      <MatchRing pct={pct} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>{rec.name}</h3>
          <span style={{
            fontSize: 11, fontWeight: 700, color, background: `${color}1a`,
            padding: "2px 9px", borderRadius: 20,
          }}>
            {matchLabel(pct)}
          </span>
        </div>

        {/* Meta line: members + shared-course count, the two facts that
            actually help someone decide whether to join. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          fontSize: 11.5, color: T.text2, marginBottom: 8,
        }}>
          <span>◍ {rec.member_count ?? 0} member{rec.member_count === 1 ? "" : "s"}</span>
          {shared.length > 0 && (
            <span style={{ color: T.blue, fontWeight: 600 }}>
              ◆ {shared.length} shared course{shared.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {(shared.length > 0 || visibleOthers.length > 0) && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {shared.map(c => <CourseChip key={c} code={c} shared />)}
            {visibleOthers.map(c => <CourseChip key={c} code={c} />)}
            {hiddenCount > 0 && (
              <span style={{ fontSize: 10.5, color: T.text2, alignSelf: "center" }}>
                +{hiddenCount} more
              </span>
            )}
          </div>
        )}

        {rec.description && (
          <p style={{ fontSize: 12, color: T.text2, margin: "0 0 8px", lineHeight: 1.5 }}>
            {rec.description.length > 120 ? `${rec.description.slice(0, 120)}…` : rec.description}
          </p>
        )}

        {rec.next_session && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, marginBottom: 8, flexWrap: "wrap",
            fontSize: 11.5, color: T.text2,
            background: T.bg3, borderRadius: 8, padding: "6px 10px",
          }}>
            <span style={{ color: T.green }}>▦</span>
            <span style={{ fontWeight: 600, color: T.text }}>{rec.next_session.title}</span>
            <span>· {formatSessionTime(rec.next_session.scheduled_at)}</span>
            {rec.next_session.location && <span>· {rec.next_session.location}</span>}
          </div>
        )}

        <button
          type="button"
          onClick={handleExplain}
          disabled={explaining}
          aria-expanded={Boolean(explanation)}
          style={{
            display: "block", margin: 0, padding: 0, border: "none",
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
          disabled={joining || joined}
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
            border: "none", cursor: joined ? "default" : "pointer",
            background: joined ? T.bg3 : T.red,
            color: joined ? T.text2 : "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {joined ? "Joined ✓" : joining ? "Joining…" : "Join group"}
        </button>
        <button
          onClick={() => router.push(`/groups/${rec.group_id}`)}
          style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: `1px solid ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer",
          }}
        >
          View group
        </button>
        {joinError && (
          <p role="alert" style={{
            fontSize: 10.5, color: T.red, margin: 0, maxWidth: 120, lineHeight: 1.35,
          }}>
            {joinError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Skeleton (shown while loading, keeps the layout from jumping) ─────────

function SkeletonCard() {
  return (
    <div className="ss-card" style={{ display: "flex", gap: 16, alignItems: "center", opacity: 0.55 }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        border: `6px solid ${T.bg3}`, flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 13, width: "45%", background: T.bg3, borderRadius: 5, marginBottom: 9 }} />
        <div style={{ height: 10, width: "28%", background: T.bg3, borderRadius: 5, marginBottom: 9 }} />
        <div style={{ height: 10, width: "62%", background: T.bg3, borderRadius: 5 }} />
      </div>
      <div style={{ width: 96, height: 30, background: T.bg3, borderRadius: 8, flexShrink: 0 }} />
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

// ── Main page ─────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [recs, setRecs] = useState<RecommendationRow[]>([]);
  const [source, setSource] = useState<"ml_pipeline" | "fallback" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("match");

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

  const visibleRecs = useMemo(() => {
    const list = recs.filter(r => !dismissed.has(r.group_id));
    const by = {
      match:   (a: RecommendationRow, b: RecommendationRow) => toPercent(b.score) - toPercent(a.score),
      members: (a: RecommendationRow, b: RecommendationRow) => (b.member_count ?? 0) - (a.member_count ?? 0),
      // Groups with a scheduled session first, soonest at the top.
      activity: (a: RecommendationRow, b: RecommendationRow) => {
        const at = a.next_session ? parseServerDate(a.next_session.scheduled_at).getTime() : Infinity;
        const bt = b.next_session ? parseServerDate(b.next_session.scheduled_at).getTime() : Infinity;
        return at - bt;
      },
    }[sort];
    return [...list].sort(by);
  }, [recs, dismissed, sort]);

  const sortOptions: { id: SortKey; label: string }[] = [
    { id: "match",    label: "Best match" },
    { id: "members",  label: "Most members" },
    { id: "activity", label: "Next session" },
  ];

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

        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          margin: "18px 0 4px", flexWrap: "wrap", maxWidth: 720,
        }}>
          {source && !loading && (
            <span
              title={source === "ml_pipeline"
                ? "Scores from the trained similarity model"
                : "Live course-overlap estimate — the model hasn't run for you yet"}
              style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                background: source === "ml_pipeline" ? `${T.green}1a` : T.bg3,
                color: source === "ml_pipeline" ? T.green : T.text2,
                textTransform: "uppercase", letterSpacing: "0.04em", cursor: "help",
              }}
            >
              {source === "ml_pipeline" ? "● Live model results" : "● Estimated match"}
            </span>
          )}

          {!loading && visibleRecs.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {sortOptions.map(o => (
                <button
                  key={o.id}
                  onClick={() => setSort(o.id)}
                  style={{
                    padding: "4px 11px", borderRadius: 20, border: "none", cursor: "pointer",
                    fontSize: 11.5, fontWeight: sort === o.id ? 700 : 500,
                    background: sort === o.id ? `${T.red}14` : "transparent",
                    color: sort === o.id ? T.red : T.text2,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
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
                  onJoined={(groupId) => {
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
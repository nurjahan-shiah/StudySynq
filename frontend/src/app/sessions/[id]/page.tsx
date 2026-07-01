"use client";

// US-C.5 — Session Detail & RSVP Page

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useSessionDetail, useGroup, rsvpSession, type SessionRSVP } from "@/lib/hooks";

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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type RSVPStatus = "attending" | "not_attending" | "maybe";

const RSVP_LABELS: Record<RSVPStatus, string> = {
  attending:     "Attending",
  maybe:         "Maybe",
  not_attending: "Not Attending",
};

const RSVP_COLORS: Record<RSVPStatus, string> = {
  attending:     "#22c55e",
  maybe:         "#f59e0b",
  not_attending: "#ef4444",
};

// ── Attendee pill ─────────────────────────────────────────────────────────────

function AttendeePill({ rsvp }: { rsvp: SessionRSVP }) {
  const status = rsvp.status as RSVPStatus;
  const color  = RSVP_COLORS[status] ?? T.text2;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 12px", borderRadius: 8,
      border: `1px solid ${T.border}`, background: T.bg3,
      gap: 8,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: `${color}22`, color, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, flexShrink: 0,
      }}>
        {rsvp.user_id.slice(0, 1).toUpperCase()}
      </div>
      <span style={{ flex: 1, fontSize: 12, color: T.text2, fontFamily: "monospace" }}>
        {rsvp.user_id.slice(0, 8)}…
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
        background: `${color}18`, color,
      }}>
        {RSVP_LABELS[status] ?? status}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const router   = useRouter();
  const params   = useParams<{ id: string }>();
  const sessionId = params.id;

  const [userId, setUserId]       = useState("");
  const [myRSVP, setMyRSVP]       = useState<RSVPStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rsvpError, setRsvpError]  = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("ss_user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  const { data: session, loading, error, refetch } = useSessionDetail(sessionId);
  const { data: group } = useGroup(session?.group_id ?? "");

  // Sync my current RSVP status once session loads
  useEffect(() => {
    if (!session || !userId) return;
    const mine = session.attendees.find(a => a.user_id === userId);
    setMyRSVP(mine ? (mine.status as RSVPStatus) : null);
  }, [session, userId]);

  async function handleRSVP(status: RSVPStatus) {
    if (submitting) return;
    setSubmitting(true);
    setRsvpError(null);
    const res = await rsvpSession(sessionId, status);
    if (res.error) {
      setRsvpError(res.error);
    } else {
      setMyRSVP(status);
      refetch();
    }
    setSubmitting(false);
  }

  const upcoming = session ? new Date(session.scheduled_at) >= new Date() : false;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button
            onClick={() => router.push("/sessions")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.text2, fontSize: 13 }}
          >
            ← Sessions
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: "80px 0", textAlign: "center", color: T.text2, fontSize: 13 }}>
            Loading session…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: "80px 0", textAlign: "center", color: T.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Content */}
        {!loading && session && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

            {/* ── Left: session info ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Header card */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "22px 24px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 28 }}>▦</span>
                  <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>
                      {session.title}
                    </h1>
                    {group && (
                      <button
                        onClick={() => router.push(`/groups/${session.group_id}`)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.red, padding: 0, fontWeight: 600 }}
                      >
                        ⚇ {group.name}
                      </button>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
                    background: upcoming ? `${T.red}18` : T.bg3,
                    color: upcoming ? T.red : T.text2,
                    border: `1px solid ${upcoming ? `${T.red}30` : T.border}`,
                  }}>
                    {upcoming ? "Upcoming" : "Past"}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <DetailRow icon="▦" label={formatDateTime(session.scheduled_at)} />
                  {session.location && <DetailRow icon="⊙" label={session.location} />}
                </div>
              </div>

              {/* Description */}
              {session.description && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 24px" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
                    Description
                  </p>
                  <p style={{ fontSize: 14, color: T.text, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {session.description}
                  </p>
                </div>
              )}
            </div>

            {/* ── Right: RSVP + attendees ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* RSVP card */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>
                  Your RSVP
                </p>

                {myRSVP && (
                  <p style={{ fontSize: 12, color: RSVP_COLORS[myRSVP], fontWeight: 600, margin: "0 0 10px" }}>
                    ✓ {RSVP_LABELS[myRSVP]}
                  </p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(["attending", "maybe", "not_attending"] as RSVPStatus[]).map(s => {
                    const active = myRSVP === s;
                    const color  = RSVP_COLORS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => handleRSVP(s)}
                        disabled={submitting}
                        style={{
                          padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: `1px solid ${active ? color : T.border}`,
                          background: active ? `${color}18` : "transparent",
                          color: active ? color : T.text2,
                          cursor: submitting ? "not-allowed" : "pointer",
                          textAlign: "left",
                          opacity: submitting ? 0.6 : 1,
                          transition: "all 0.12s",
                        }}
                      >
                        {RSVP_LABELS[s]}
                      </button>
                    );
                  })}
                </div>

                {rsvpError && (
                  <p style={{ fontSize: 11, color: T.red, margin: "8px 0 0" }}>{rsvpError}</p>
                )}
              </div>

              {/* Attendees card */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>
                  Attendees ({session.attendees.length})
                </p>

                {session.attendees.length === 0 ? (
                  <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>No RSVPs yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {session.attendees.map((a: SessionRSVP) => (
                      <AttendeePill key={a.id} rsvp={a} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DetailRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, color: T.text2, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: T.text2 }}>{label}</span>
    </div>
  );
}

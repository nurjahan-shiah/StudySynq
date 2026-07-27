"use client";

/**
 * CourseRequests — "request a course" modal (students) and the pending-request
 * review list (admins), used on /courses.
 * Requesting notifies all admins live; approve/reject notifies the requester.
 */

import { useCallback, useEffect, useState } from "react";
import {
  approveCourseRequest,
  listCourseRequests,
  myCourseRequests,
  rejectCourseRequest,
  requestCourse,
  type CourseRequest,
} from "@/lib/social";

const T = {
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  green:  "var(--ss-green)",
  yellow: "var(--ss-yellow)",
} as const;

// Client-side mirror of the backend's York-code rule ("EECS 4314").
const YORK_CODE_RE = /^[A-Za-z]{2,5}\s?\d{4}$/;

export function normalizeYorkCode(v: string): string {
  const cleaned = v.trim().toUpperCase().replace(/\s+/g, " ");
  const m = cleaned.match(/^([A-Z]{2,5})\s?(\d{4})$/);
  return m ? `${m[1]} ${m[2]}` : cleaned;
}

const STATUS_STYLE: Record<CourseRequest["status"], { bg: string; color: string; label: string }> = {
  pending:  { bg: "rgba(253,203,110,.16)", color: T.yellow, label: "Pending" },
  approved: { bg: "rgba(0,184,148,.14)",   color: T.green,  label: "Approved" },
  rejected: { bg: "rgba(214,48,49,.12)",   color: T.red,    label: "Rejected" },
};

function StatusPill({ status }: { status: CourseRequest["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
      background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      {s.label}
    </span>
  );
}

// ── Request modal (students) ─────────────────────────────────────────────────

export function CourseRequestModal({
  onClose, onRequested,
}: { onClose: () => void; onRequested: (msg: string, ok: boolean) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeValid = YORK_CODE_RE.test(code.trim());

  async function submit() {
    setError(null);
    if (!codeValid) {
      setError("Course code must be a York code like EECS 4314 (2-5 letters + 4 digits).");
      return;
    }
    if (!name.trim() || !dept.trim()) {
      setError("Course name and department are required.");
      return;
    }
    setBusy(true);
    const res = await requestCourse({
      course_code: normalizeYorkCode(code),
      course_name: name.trim(),
      department: dept.trim(),
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onRequested(`Request for ${normalizeYorkCode(code)} sent — admins have been notified.`, true);
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(440px, calc(100vw - 32px))", background: T.bg2,
        border: `1px solid ${T.border}`, borderRadius: 16, zIndex: 301,
        padding: "22px 24px", boxShadow: "0 12px 40px rgba(0,0,0,.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Request a course</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.text2 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: T.text2, margin: "0 0 16px", lineHeight: 1.5 }}>
          Can&apos;t find your course in the catalogue? Request it and an admin will review it.
          You&apos;ll get a notification when it&apos;s accepted or rejected.
        </p>

        <label style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "block", marginBottom: 5 }}>
          Course code (York format)
        </label>
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="e.g. EECS 4314"
          className="ss-input"
          style={{
            width: "100%", marginBottom: 4,
            borderColor: code && !codeValid ? T.red : undefined,
          }}
        />
        <p style={{ fontSize: 10.5, color: code && !codeValid ? T.red : T.text2, margin: "0 0 12px" }}>
          {code && !codeValid ? "Must look like EECS 4314" : "2-5 letters, a space, then 4 digits"}
        </p>

        <label style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "block", marginBottom: 5 }}>Course name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Software Architecture" className="ss-input" style={{ width: "100%", marginBottom: 12 }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "block", marginBottom: 5 }}>Department</label>
        <input value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. EECS" className="ss-input" style={{ width: "100%", marginBottom: 12 }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "block", marginBottom: 5 }}>Why do you need it? (optional)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))} rows={2} className="ss-input" style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />

        {error && <p style={{ fontSize: 12, color: T.red, margin: "0 0 10px" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className="ss-btn-ghost" style={{ fontSize: 12.5, padding: "8px 16px" }}>Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="ss-btn-primary"
            style={{ fontSize: 12.5, padding: "8px 20px", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Shared request row ───────────────────────────────────────────────────────

function RequestRow({
  req, adminActions, onResolve,
}: {
  req: CourseRequest;
  adminActions?: boolean;
  onResolve?: (id: string, action: "approve" | "reject") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    if (!onResolve) return;
    setBusy(action);
    await onResolve(req.id, action);
    setBusy(null);
  }

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            background: `${T.red}15`, color: T.red, padding: "2px 10px",
            borderRadius: 20, fontSize: 11, fontWeight: 700,
          }}>
            {req.course_code}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{req.course_name}</span>
          <StatusPill status={req.status} />
        </div>
        <p style={{ fontSize: 11.5, color: T.text2, margin: "4px 0 0" }}>
          {req.department} · requested by {req.requester_name}
          {req.reason ? ` — "${req.reason}"` : ""}
          {req.admin_note ? ` · Admin: ${req.admin_note}` : ""}
        </p>
      </div>

      {adminActions && req.status === "pending" && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => act("approve")}
            disabled={busy !== null}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: "none", background: "#00b894", color: "#fff",
              cursor: "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={() => act("reject")}
            disabled={busy !== null}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: `1px solid ${T.red}`, background: "transparent", color: T.red,
              cursor: "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Requests panel — admin sees all + can resolve; students see their own ────

export function CourseRequestsPanel({
  isAdmin, onResolved,
}: { isAdmin: boolean; onResolved?: () => void }) {
  const [requests, setRequests] = useState<CourseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = isAdmin ? await listCourseRequests() : await myCourseRequests();
    if (res.error) setError(res.error);
    else setRequests(res.data ?? []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string, action: "approve" | "reject") {
    const res = action === "approve"
      ? await approveCourseRequest(id)
      : await rejectCourseRequest(id);
    if (!res.error && res.data) {
      setRequests(rs => rs.map(r => (r.id === id ? res.data! : r)));
      onResolved?.();
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: T.text2 }}>Loading requests…</p>;
  if (error)   return <p style={{ fontSize: 13, color: T.red }}>Couldn&apos;t load requests: {error}</p>;
  if (requests.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: T.text2 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📨</div>
        <p style={{ fontSize: 13, margin: 0 }}>
          {isAdmin ? "No course requests yet." : "You haven't requested any courses yet."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {requests.map(r => (
        <RequestRow key={r.id} req={r} adminActions={isAdmin} onResolve={resolve} />
      ))}
    </div>
  );
}

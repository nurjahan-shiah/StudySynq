"use client";

import { useState } from "react";
import { apiClient } from "@/lib/apiClient";

interface CourseSuggestion {
  id: string;
  course_code: string;
  course_name: string;
  department: string;
}

interface Props {
  userId: string;
  onDone: () => void;
}

export default function OnboardingCourses({ userId, onDone }: Props) {
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  async function getSuggestions() {
    if (!program.trim() || !year.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.post<{ suggestions: CourseSuggestion[]; source: string }>(
        "/courses/suggest",
        { program, year }
      );
      if (res.error) {
        setError(res.error);
      } else {
        const list = res.data!.suggestions;
        setSuggestions(list);
        setSelected(new Set(list.map(c => c.id)));
        if (list.length === 0) {
          setError(
            res.data!.source === "ai_unavailable"
              ? "Course suggestions aren't available right now — you can add courses later from your dashboard."
              : "No matching courses found — you can add courses later from your dashboard."
          );
        }
      }
    } catch {
      setError("Something went wrong getting suggestions.");
    } finally {
      setFetched(true);
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirmAndContinue() {
    if (selected.size === 0) { onDone(); return; }
    setEnrolling(true);
    await Promise.all(
      Array.from(selected).map(courseId =>
        apiClient.post(`/users/${userId}/enrollments?course_id=${courseId}`, {})
      )
    );
    setEnrolling(false);
    onDone();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(6px)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20,
    }}>
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 20, maxWidth: 440, width: "100%",
        padding: "36px 32px",
      }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
          Quick course setup
        </h2>
        <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 22 }}>
          Tell us your program and year and we'll suggest courses you're likely taking.
        </p>

        {!fetched && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Program</label>
                <input
                  type="text" value={program} onChange={e => setProgram(e.target.value)}
                  placeholder="e.g. Computer Science" className="ss-input"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Year</label>
                <input
                  type="text" value={year} onChange={e => setYear(e.target.value)}
                  placeholder="e.g. 3rd year" className="ss-input"
                />
              </div>
            </div>
            {error && (
              <div style={{ background: "rgba(214,48,49,.08)", border: "1px solid rgba(214,48,49,.3)", borderRadius: 9, padding: "10px 14px", fontSize: "0.85rem", color: "var(--ss-red)", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onDone} className="ss-btn-primary" style={{ flex: 1, justifyContent: "center", background: "var(--bg3)", color: "var(--text2)" }}>
                Skip
              </button>
              <button
                onClick={getSuggestions}
                disabled={!program.trim() || !year.trim() || loading}
                className="ss-btn-primary" style={{ flex: 2, justifyContent: "center", opacity: !program.trim() || !year.trim() || loading ? 0.5 : 1 }}
              >
                {loading ? "Thinking…" : "Get suggestions"}
              </button>
            </div>
          </>
        )}

        {fetched && (
          <>
            {suggestions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 260, overflowY: "auto" }}>
                {suggestions.map(c => (
                  <label key={c.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                    borderRadius: 10, border: "1px solid var(--border)",
                    background: selected.has(c.id) ? "rgba(214,48,49,.06)" : "var(--bg3)",
                    cursor: "pointer",
                  }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ marginTop: 2 }} />
                    <span>
                      <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{c.course_code}</span>
                      <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}> — {c.course_name}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {error && (
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: 16 }}>{error}</div>
            )}
            <button
              onClick={confirmAndContinue}
              disabled={enrolling}
              className="ss-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px", opacity: enrolling ? 0.6 : 1 }}
            >
              {enrolling ? "Enrolling…" : suggestions.length > 0 ? `Enroll in ${selected.size} course${selected.size === 1 ? "" : "s"} & continue` : "Continue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
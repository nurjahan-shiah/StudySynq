"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import Navbar from "../components/Navbar";

type Role = "student" | "admin";

interface PasswordStrength {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
}

function checkPassword(pw: string): PasswordStrength {
  return {
    minLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasLower: /[a-z]/.test(pw),
    hasDigit: /[0-9]/.test(pw),
  };
}
function isStrongEnough(s: PasswordStrength) {
  return s.minLength && s.hasUpper && s.hasLower && s.hasDigit;
}

const ROLES: { value: Role; label: string; desc: string; icon: string }[] = [
  { value: "student", label: "Student", desc: "Join study groups and collaborate",  icon: "📚" },
  { value: "admin",   label: "Admin",   desc: "Full platform management access",    icon: "⚙️" },
];

// US-G.5 — AI Onboarding Course Suggestions (extends US-A.1)
const PROGRAMS = [
  "Software Engineering",
  "Computer Science",
  "Computer Engineering",
  "Electrical Engineering",
  "Data Science",
  "Business Administration",
  "Other",
];
const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "5th year+"];

interface SuggestedCourse {
  id: string;
  course_code: string;
  course_name: string;
  department: string;
}

function StrengthRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.78rem", color: ok ? "var(--ss-green)" : "var(--text2)" }}>
      <span>{ok ? "✓" : "○"}</span>{label}
    </span>
  );
}

function WelcomeModal({ name, role, onContinue }: { name: string; role: Role; onContinue: () => void }) {
  const roleInfo = ROLES.find(r => r.value === role)!;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(6px)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20,
    }}>
      <div className="ss-modal-anim" style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 20, maxWidth: 400, width: "100%",
        padding: "40px 32px", textAlign: "center",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: 16 }}>{roleInfo.icon}</div>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
          Welcome to StudySync, {name.split(" ")[0]}!
        </h2>
        <p style={{ color: "var(--text2)", fontSize: "0.9rem", marginBottom: 6 }}>
          Your account has been created as a{" "}
          <span style={{ color: "var(--ss-red)", fontWeight: 600 }}>{roleInfo.label}</span>.
        </p>
        <p style={{ color: "var(--text2)", fontSize: "0.82rem", marginBottom: 28 }}>{roleInfo.desc}</p>
        <button onClick={onContinue} className="ss-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px" }}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

function SuggestedCoursesModal({
  courses, note, selected, onToggle, onSkip, onEnroll, enrolling, loading,
}: {
  courses: SuggestedCourse[]; note: string | null; selected: Set<string>;
  onToggle: (id: string) => void; onSkip: () => void; onEnroll: () => void;
  enrolling: boolean; loading: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(6px)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20,
    }}>
      <div className="ss-modal-anim" style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 20, maxWidth: 440, width: "100%",
        padding: "36px 32px", textAlign: "left",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: 10, textAlign: "center" }}>✨</div>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text)", marginBottom: 6, textAlign: "center" }}>
          Suggested courses for you
        </h2>
        <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 18, textAlign: "center" }}>
          Based on your program and year, here&apos;s a head start — pick the ones that match your schedule.
        </p>

        {note && (
          <div style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px", fontSize: "0.78rem", color: "var(--text2)", marginBottom: 14 }}>
            {note}
          </div>
        )}

        {courses.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text2)", textAlign: "center", marginBottom: 18 }}>
            {loading
              ? "Finding courses that match your program…"
              : "No matching courses found yet — you can browse and join courses later from your dashboard."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto", marginBottom: 18 }}>
            {courses.map(c => (
              <label key={c.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, border: selected.has(c.id) ? "1.5px solid var(--ss-red)" : "1px solid var(--border)",
                background: selected.has(c.id) ? "rgba(214,48,49,.06)" : "var(--bg3)",
                cursor: "pointer",
              }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} />
                <div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--text)" }}>{c.course_code}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text2)" }}>{c.course_name}</div>
                </div>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onSkip} style={{
            flex: 1, padding: "12px", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--bg3)", color: "var(--text2)", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer",
          }}>
            Skip for now
          </button>
          <button
            type="button" onClick={onEnroll} disabled={enrolling || selected.size === 0}
            className="ss-btn-primary"
            style={{ flex: 1, justifyContent: "center", padding: "12px", opacity: enrolling || selected.size === 0 ? 0.5 : 1 }}
          >
            {enrolling ? "Adding…" : `Add ${selected.size || ""} course${selected.size === 1 ? "" : "s"}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [name, setName]                       = useState("");
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole]                       = useState<Role>("student");
  const [program, setProgram]                 = useState("");
  const [year, setYear]                       = useState("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");
  const [showWelcome, setShowWelcome]         = useState(false);
  const [registeredName, setRegisteredName]   = useState("");
  const [registeredRole, setRegisteredRole]   = useState<Role>("student");
  const [registeredUserId, setRegisteredUserId] = useState("");

  // US-G.5 — AI Onboarding Course Suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestedCourses, setSuggestedCourses] = useState<SuggestedCourse[]>([]);
  const [suggestionNote, setSuggestionNote]   = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling]             = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const strength       = checkPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";
  const formValid      = name.trim() !== "" && email.trim() !== "" && isStrongEnough(strength) && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setError("");
    setLoading(true);
    try {
      const res = await apiClient.post<{
        access_token: string; user_id: string;
        user_email: string; user_role: string; is_first_login: boolean;
      }>("/auth/register", { name, email, password, role });

      if (res.error) { setError(res.error); return; }

      // Keys must match what dashboard/page.tsx reads
      localStorage.setItem("ss_token",      res.data!.access_token);
      localStorage.setItem("ss_user_id",    res.data!.user_id);
      localStorage.setItem("ss_user_email", res.data!.user_email);
      localStorage.setItem("ss_user_role",  res.data!.user_role);
      localStorage.setItem("ss_user_name",  name);

      setRegisteredName(name);
      setRegisteredRole(role);
      setRegisteredUserId(res.data!.user_id);
      setShowWelcome(true);

      // US-G.5 — kick off course suggestions in the background for students
      // who told us their program/year, so they're ready the moment the
      // welcome modal is dismissed.
      if (role === "student" && program && year) {
        setSuggestionsLoading(true);
        apiClient
          .post<{ courses: SuggestedCourse[]; note: string | null }>(
            "/users/onboarding/suggest-courses",
            { program, year }
          )
          .then((sres) => {
            if (sres.data) {
              setSuggestedCourses(sres.data.courses);
              setSuggestionNote(sres.data.note ?? null);
            }
          })
          .catch(() => {
            /* suggestions are a nice-to-have — silently skip on failure */
          })
          .finally(() => setSuggestionsLoading(false));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleCourse(id: string) {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function goToDashboard() {
    setShowSuggestions(false);
    router.push("/dashboard");
  }

  async function handleEnrollSelected() {
    setEnrolling(true);
    try {
      await Promise.all(
        Array.from(selectedCourses).map(courseId =>
          apiClient.post(`/users/${registeredUserId}/enrollments?course_id=${courseId}`, {})
        )
      );
    } catch {
      /* best-effort — a failed enrollment here isn't fatal to onboarding */
    } finally {
      setEnrolling(false);
      goToDashboard();
    }
  }

  return (
    <>
      {showWelcome && (
        <WelcomeModal
          name={registeredName}
          role={registeredRole}
          onContinue={() => {
            setShowWelcome(false);
            if (registeredRole === "student" && program && year) {
              setShowSuggestions(true);
            } else {
              router.push("/dashboard");
            }
          }}
        />
      )}

      {showSuggestions && (
        <SuggestedCoursesModal
          courses={suggestedCourses}
          note={suggestionNote}
          selected={selectedCourses}
          onToggle={toggleCourse}
          onSkip={goToDashboard}
          onEnroll={handleEnrollSelected}
          enrolling={enrolling}
          loading={suggestionsLoading}
        />
      )}

      <div className="ss-stripe-bar" />
      <Navbar
        rightSlot={
          <span style={{ fontSize: "0.88rem", color: "var(--text2)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--ss-red)", fontWeight: 600, textDecoration: "none" }}>
              Log in
            </Link>
          </span>
        }
      />

      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: "100px 20px 60px",
      }}>
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ width: 60, height: 4, borderRadius: 2, marginBottom: 20,
              background: "linear-gradient(90deg, var(--ss-blue), var(--ss-green), var(--ss-yellow), var(--ss-red))" }} />
            <h1 style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px", marginBottom: 8 }}>
              Create your account
            </h1>
            <p style={{ color: "var(--text2)", fontSize: "0.92rem" }}>
              Join StudySync to collaborate with your classmates.
            </p>
          </div>

          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 20, padding: "36px 32px", boxShadow: "var(--shadow)",
          }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 7 }}>Full name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" required className="ss-input" />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 7 }}>University email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@yorku.ca" required className="ss-input" />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 10 }}>I am joining as</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {ROLES.map(r => (
                    <button key={r.value} type="button" onClick={() => setRole(r.value)} style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      padding: "12px 8px", borderRadius: 10, textAlign: "center",
                      border: role === r.value ? "1.5px solid var(--ss-red)" : "1px solid var(--border)",
                      background: role === r.value ? "rgba(214,48,49,.08)" : "var(--bg3)",
                      color: role === r.value ? "var(--ss-red)" : "var(--text2)",
                      cursor: "pointer", transition: "all 0.2s",
                    }}>
                      <span style={{ fontSize: "1.2rem" }}>{r.icon}</span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{r.label}</span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text2)", marginTop: 8 }}>
                  {ROLES.find(r => r.value === role)!.desc}
                </p>
              </div>

              {role === "student" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 7 }}>
                      Program <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <select value={program} onChange={e => setProgram(e.target.value)} className="ss-input">
                      <option value="">Select program</option>
                      {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 7 }}>
                      Year <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <select value={year} onChange={e => setYear(e.target.value)} className="ss-input">
                      <option value="">Select year</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {(program || year) && (
                    <p style={{ gridColumn: "1 / -1", fontSize: "0.76rem", color: "var(--text2)", marginTop: -2 }}>
                      We&apos;ll suggest a few courses that match this once your account is created.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 7 }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a strong password" required className="ss-input" />
                {password.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 10 }}>
                    <StrengthRow ok={strength.minLength} label="8+ characters" />
                    <StrengthRow ok={strength.hasUpper}  label="Uppercase" />
                    <StrengthRow ok={strength.hasLower}  label="Lowercase" />
                    <StrengthRow ok={strength.hasDigit}  label="Number" />
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text2)", marginBottom: 7 }}>Confirm password</label>
                <input
                  type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password" required className="ss-input"
                  style={{ borderColor: confirmPassword.length > 0 && !passwordsMatch ? "var(--ss-red)" : undefined }}
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p style={{ fontSize: "0.78rem", color: "var(--ss-red)", marginTop: 6 }}>Passwords don&apos;t match</p>
                )}
              </div>

              {error && (
                <div style={{ background: "rgba(214,48,49,.08)", border: "1px solid rgba(214,48,49,.3)", borderRadius: 9, padding: "10px 14px", fontSize: "0.88rem", color: "var(--ss-red)" }}>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={!formValid || loading} className="ss-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "1rem", borderRadius: 10, marginTop: 4, opacity: !formValid || loading ? 0.45 : 1, cursor: !formValid || loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>

            <p style={{ fontSize: "0.78rem", color: "var(--text2)", textAlign: "center", marginTop: 20 }}>
              By signing up, you agree to StudySync&apos;s{" "}
              <Link href="#" style={{ color: "var(--ss-red)" }}>terms of service</Link>.
            </p>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.88rem", color: "var(--text2)", marginTop: 20 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--ss-red)", fontWeight: 600, textDecoration: "none" }}>Log in</Link>
          </p>
        </div>
      </div>
    </>
  );
}
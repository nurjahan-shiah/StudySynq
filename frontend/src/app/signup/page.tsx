"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import Navbar from "../components/Navbar";

type Role = "student" | "group_leader" | "admin";

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
  { value: "student",      label: "Student",      desc: "Join study groups and collaborate",  icon: "📚" },
  { value: "group_leader", label: "Group Leader", desc: "Create and manage study groups",     icon: "🎯" },
  { value: "admin",        label: "Admin",        desc: "Full platform management access",    icon: "⚙️" },
];

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
          Go to Dashboard →
        </button>
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
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");
  const [showWelcome, setShowWelcome]         = useState(false);
  const [registeredName, setRegisteredName]   = useState("");
  const [registeredRole, setRegisteredRole]   = useState<Role>("student");

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
      setShowWelcome(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showWelcome && (
        <WelcomeModal
          name={registeredName}
          role={registeredRole}
          onContinue={() => { setShowWelcome(false); router.push("/dashboard"); }}
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
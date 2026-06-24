"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Role Options ─────────────────────────────────────────────────────────────

const ROLES: { value: Role; label: string; desc: string; icon: string }[] = [
  {
    value: "student",
    label: "Student",
    desc: "Join study groups and collaborate",
    icon: "📚",
  },
  {
    value: "group_leader",
    label: "Group Leader",
    desc: "Create and manage study groups",
    icon: "🎯",
  },
  {
    value: "admin",
    label: "Admin",
    desc: "Full platform management access",
    icon: "⚙️",
  },
];

// ─── Strength Indicator ───────────────────────────────────────────────────────

function StrengthRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-1 text-xs ${
        ok ? "text-emerald-600" : "text-gray-400"
      }`}
    >
      <span>{ok ? "✓" : "○"}</span>
      {label}
    </span>
  );
}

// ─── Welcome Modal ────────────────────────────────────────────────────────────

function WelcomeModal({
  name,
  role,
  onContinue,
}: {
  name: string;
  role: Role;
  onContinue: () => void;
}) {
  const roleLabel = ROLES.find((r) => r.value === role)!;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center animate-in fade-in zoom-in duration-200">
        <div className="text-5xl mb-4">{roleLabel.icon}</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Welcome to StudySync, {name.split(" ")[0]}!
        </h2>
        <p className="text-sm text-gray-500 mb-2">
          Your account has been created as a{" "}
          <span className="font-medium text-emerald-700">{roleLabel.label}</span>.
        </p>
        <p className="text-xs text-gray-400 mb-6">{roleLabel.desc}</p>
        <button
          onClick={onContinue}
          className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition"
        >
          Go to Dashboard →
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("student");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [registeredName, setRegisteredName] = useState("");
  const [registeredRole, setRegisteredRole] = useState<Role>("student");

  const strength = checkPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";
  const formValid =
    name.trim() !== "" &&
    email.trim() !== "" &&
    isStrongEnough(strength) &&
    passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;

    setError("");
    setLoading(true);

    try {
      const res = await apiClient.post<{
        access_token: string;
        user_id: string;
        user_email: string;
        user_role: string;
        is_first_login: boolean;
      }>("/auth/register", { name, email, password, role });

      if (res.error) {
        setError(res.error);
        return;
      }

      // Store token + user info
      localStorage.setItem("token", res.data!.access_token);
      localStorage.setItem("user_id", res.data!.user_id);
      localStorage.setItem("user_email", res.data!.user_email);
      localStorage.setItem("user_role", res.data!.user_role);

      // Show welcome modal on first login
      setRegisteredName(name);
      setRegisteredRole(role);
      setShowWelcome(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleWelcomeContinue() {
    setShowWelcome(false);
    router.push("/dashboard");
  }

  return (
    <>
      {showWelcome && (
        <WelcomeModal
          name={registeredName}
          role={registeredRole}
          onContinue={handleWelcomeContinue}
        />
      )}

      <div className="min-h-screen bg-white font-sans">
        {/* Nav */}
        <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
          <a href="/" className="flex items-center gap-2 text-lg font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
            StudySync
          </a>
          <span className="text-sm text-gray-400">
            Already have an account?{" "}
            <a
              href="/login"
              className="text-emerald-700 hover:underline font-medium"
            >
              Log in
            </a>
          </span>
        </nav>

        {/* Form */}
        <div className="max-w-md mx-auto px-6 pt-12 pb-16">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Create your account
            </h1>
            <p className="text-sm text-gray-500">
              Join StudySync to collaborate with your classmates.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@yorku.ca"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                I am joining as
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition ${
                      role === r.value
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    <span className="text-lg">{r.icon}</span>
                    <span className="text-xs font-medium">{r.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {ROLES.find((r) => r.value === role)!.desc}
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              {/* Strength checklist */}
              {password.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                  <StrengthRow ok={strength.minLength} label="8+ characters" />
                  <StrengthRow ok={strength.hasUpper} label="Uppercase" />
                  <StrengthRow ok={strength.hasLower} label="Lowercase" />
                  <StrengthRow ok={strength.hasDigit} label="Number" />
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                  confirmPassword.length > 0 && !passwordsMatch
                    ? "border-red-300"
                    : "border-gray-200"
                }`}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 mt-1">
                  Passwords don&apos;t match
                </p>
              )}
            </div>

            {/* API Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!formValid || loading}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            By signing up, you agree to StudySync&apos;s terms of service.
          </p>
        </div>
      </div>
    </>
  );
}
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Navbar from "./components/Navbar";

// ─── Logo icon (the colored stripes) — kept for FeatureCard only ──────────────
function LogoIcon({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: "var(--bg3)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ transform: "rotate(-20deg)", display: "flex", flexDirection: "column", gap: 3 }}>
        {[
          { w: size * 0.6,  bg: "var(--ss-blue)"   },
          { w: size * 0.54, bg: "var(--ss-green)"  },
          { w: size * 0.48, bg: "var(--ss-yellow)" },
          { w: size * 0.42, bg: "var(--ss-red)"    },
        ].map((s, i) => (
          <span key={i} style={{ display: "block", height: 3.5, width: s.w, borderRadius: 2, background: s.bg }} />
        ))}
      </div>
    </div>
  );
}

// ─── Wordmark ─────────────────────────────────────────────────────────────────
function Wordmark({ size = "1.3rem" }: { size?: string }) {
  return (
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.5px" }}>
      <span style={{ color: "var(--text)" }}>study</span>
      <span style={{ color: "var(--ss-red)" }}>Sync</span>
    </span>
  );
}

// ─── Stripe divider ───────────────────────────────────────────────────────────
function StripeDivider() {
  return (
    <div style={{
      width: 80, height: 5, borderRadius: 3, margin: "0 auto 16px",
      background: "linear-gradient(90deg, var(--ss-blue), var(--ss-red))",
    }} />
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({
  icon, iconBg, title, desc, delay = 0,
}: { icon: string; iconBg: string; title: string; desc: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.unobserve(el); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="ss-card ss-reveal"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.4rem", marginBottom: 20,
      }}>
        {icon}
      </div>
      <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>{title}</h3>
      <p style={{ color: "var(--text2)", fontSize: "0.92rem", lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const features = [
    { icon: "📚", iconBg: "rgba(9,132,227,.12)",  title: "Course Hub",           desc: "Organize all your courses, syllabi, deadlines, and materials in one clean dashboard." },
    { icon: "👥", iconBg: "rgba(0,184,148,.12)",  title: "Study Groups",         desc: "Create or join study groups, share notes, and coordinate sessions effortlessly." },
    { icon: "🗂️", iconBg: "rgba(253,203,110,.12)", title: "Smart Resources",      desc: "Upload, tag, and discover course materials. AI surfaces what's relevant when you need it." },
    { icon: "📅", iconBg: "rgba(214,48,49,.12)",  title: "Session Planner",      desc: "Schedule group study sessions and get smart reminders so nothing falls through." },
    { icon: "🤖", iconBg: "rgba(9,132,227,.12)",  title: "AI Recommendations",   desc: "Personalized resource and group recommendations based on your courses and habits." },
    { icon: "🔒", iconBg: "rgba(0,184,148,.12)",  title: "Secure & Private",     desc: "Your data stays yours. We never sell your information or show you ads." },
  ];

  const stats = [
    { num: "k+", label: "Active students" },
    { num: "5+", label: "Study groups" },
    { num: "98%",  label: "Satisfaction rate" },
    { num: "2+",  label: "Universities" },
  ];

  return (
    <>
      {/* Top stripe bar */}
      <div className="ss-stripe-bar" />

      {/* ── NAV ── */}
      <Navbar
        rightSlot={
          <>
            <Link href="/login" className="ss-btn-ghost">Log in</Link>
            <Link href="/signup" className="ss-btn-primary">Get Started</Link>
          </>
        }
      />

      {/* ── HERO ── */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "120px 5% 80px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Glow blobs */}
        <div style={{
          position: "absolute", width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(214,48,49,.16) 0%, transparent 70%)",
          filter: "blur(80px)", top: "10%", right: "-10%", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(9,132,227,.13) 0%, transparent 70%)",
          filter: "blur(80px)", bottom: "5%", left: "-5%", pointerEvents: "none",
        }} />

        <h1 style={{
          fontSize: "clamp(2.4rem, 6vw, 4.2rem)", fontWeight: 800,
          lineHeight: 1.1, letterSpacing: "-1.5px", marginBottom: 22, color: "var(--text)",
        }}>
          Study smarter.<br />
          Sync <span style={{ color: "var(--ss-red)" }}>together.</span>
        </h1>

        <p style={{
          fontSize: "clamp(1rem, 2vw, 1.2rem)", color: "var(--text2)",
          maxWidth: 560, lineHeight: 1.7, marginBottom: 40,
        }}>
          StudySync brings your classes, study groups, and resources into one seamless workspace -
          built for the way students actually learn.
        </p>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="ss-btn-primary ss-btn-lg">Start for free</Link>
          <a
            href="#features"
            className="ss-btn-ghost ss-btn-lg"
            onClick={e => {
              e.preventDefault();
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            See how it works
          </a>
        </div>
      </section>

      {/* ── STATS BAND ── */}
      <div style={{
        background: "var(--bg3)",
        borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        padding: "48px 5%", display: "flex", justifyContent: "center",
        flexWrap: "wrap",
      }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{
            flex: 1, minWidth: 180, textAlign: "center", padding: "16px 24px",
            borderRight: i < stats.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <span style={{ fontSize: "2.4rem", fontWeight: 800, color: "var(--ss-red)", letterSpacing: "-1px", display: "block" }}>
              {s.num}
            </span>
            <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "90px 5%" }}>
        <p style={{ textAlign: "center", fontSize: "0.8rem", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--ss-red)", marginBottom: 12 }}>
          Features
        </p>
        <StripeDivider />
        <h2 style={{ textAlign: "center", fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 14, color: "var(--text)" }}>
          Everything you need to excel
        </h2>
        <p style={{ textAlign: "center", color: "var(--text2)", maxWidth: 480, margin: "0 auto 56px", lineHeight: 1.7 }}>
          Tools designed for real students — not enterprise teams in suits.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, maxWidth: 1100, margin: "0 auto" }}>
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} delay={i * 80} />
          ))}
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <div style={{
        padding: "90px 5%", display: "flex", flexDirection: "column",
        alignItems: "center", textAlign: "center",
        background: "var(--bg2)", borderTop: "1px solid var(--border)",
      }}>
        <StripeDivider />
        <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 16, color: "var(--text)" }}>
          Ready to sync your success?
        </h2>
        <p style={{ color: "var(--text2)", maxWidth: 440, marginBottom: 36, lineHeight: 1.7 }}>
          Join thousands of students already using StudySync to study smarter and stress less.
        </p>
        <Link href="/signup" className="ss-btn-primary ss-btn-lg">
          Create your free account
        </Link>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: "36px 5%", textAlign: "center",
        borderTop: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.85rem",
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          study<span style={{ color: "var(--ss-red)" }}>Sync</span>
        </div>
        <p>© 2026 StudySync · Group 4 · York University</p>
      </footer>
    </>
  );
}
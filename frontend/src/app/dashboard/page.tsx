"use client";

import { ReactNode, CSSProperties } from "react";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";

const T = {
  bg:     "var(--bg)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
} as const;

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

function Empty({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0", color: T.text2 }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 13, margin: 0 }}>{msg}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: T.bg3, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.border}` }}>
      <p style={{ fontSize: 11, color: T.text2, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0 }}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

        {/* Top bar: title left, profile button right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Your workspace</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          <StatCard label="My groups"         value={0} />
          <StatCard label="Upcoming sessions" value={0} />
          <StatCard label="Recommended"       value={0} />
          <StatCard label="Role"              value="—" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card><Empty icon="⚇" msg="No groups yet." /></Card>
          <Card><Empty icon="▦" msg="No upcoming sessions." /></Card>
          <Card><Empty icon="✦" msg="No recommendations yet." /></Card>
          <Card><Empty icon="◎" msg="No courses enrolled." /></Card>
        </div>
      </main>
    </div>
  );
}
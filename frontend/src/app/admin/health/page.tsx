"use client";

// US-A.5 @author: Uzma Alam — System Health Dashboard

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { apiClient } from "@/lib/apiClient";

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

const STATUS_COLORS = {
  ok:      "#22c55e",
  degraded: "#f59e0b",
  down:    "#ef4444",
  unknown: "#6b7280",
};

const STATUS_LABELS = {
  ok:      "Healthy",
  degraded: "Degraded",
  down:    "Down",
  unknown: "Unknown",
};

interface ServiceHealth {
  status: "ok" | "degraded" | "down" | "unknown";
  status_code: number | null;
  response_ms: number;
  error?: string;
}

interface HealthResponse {
  services: Record<string, ServiceHealth>;
  checked_at: string;
}

function ServiceCard({ name, health }: { name: string; health: ServiceHealth }) {
  const color = STATUS_COLORS[health.status] ?? STATUS_COLORS.unknown;
  const label = STATUS_LABELS[health.status] ?? "Unknown";

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, textTransform: "capitalize" }}>
          {name.replace(/-/g, " ")}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
          background: `${color}18`, color, border: `1px solid ${color}30`,
        }}>
          {label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div>
          <p style={{ fontSize: 10, color: T.text2, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Response</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>
            {health.response_ms}ms
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: T.text2, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status Code</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>
            {health.status_code ?? "—"}
          </p>
        </div>
      </div>

      {health.error && (
        <p style={{ fontSize: 11, color: STATUS_COLORS.down, margin: 0, wordBreak: "break-all" }}>
          {health.error}
        </p>
      )}

      {/* Response time bar */}
      <div style={{ height: 4, borderRadius: 2, background: T.bg3, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2, background: color,
          width: `${Math.min((health.response_ms / 3000) * 100, 100)}%`,
          transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

export default function HealthDashboardPage() {
  const router = useRouter();
  const [health, setHealth]       = useState<HealthResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<HealthResponse>("/health/services");
    if (res.error) {
      setError(res.error);
    } else {
      setHealth(res.data ?? null);
      setLastRefresh(new Date());
    }
    setLoading(false);
  }, []);

  // Auth guard — admin only
  useEffect(() => {
    const role = localStorage.getItem("ss_user_role");
    if (!role) { router.push("/login"); return; }
    if (role !== "admin") { router.push("/dashboard"); return; }
    fetchHealth();
  }, [router, fetchHealth]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const services = health?.services ?? {};
  const total    = Object.keys(services).length;
  const healthy  = Object.values(services).filter(s => s.status === "ok").length;
  const degraded = Object.values(services).filter(s => s.status === "degraded").length;
  const down     = Object.values(services).filter(s => s.status === "down").length;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>
              System Health
            </h1>
            {lastRefresh && (
              <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
                Last checked: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setAutoRefresh(a => !a)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: `1px solid ${T.border}`,
                background: autoRefresh ? `${T.red}15` : "transparent",
                color: autoRefresh ? T.red : T.text2,
                cursor: "pointer",
              }}
            >
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </button>
            <button
              onClick={fetchHealth}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: "none", background: T.red, color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Checking…" : "Refresh Now"}
            </button>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Summary strip */}
        {health && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24,
          }}>
            {[
              { label: "Total Services", value: total, color: T.text },
              { label: "Healthy",        value: healthy,  color: STATUS_COLORS.ok },
              { label: "Degraded",       value: degraded, color: STATUS_COLORS.degraded },
              { label: "Down",           value: down,     color: STATUS_COLORS.down },
            ].map(s => (
              <div key={s.label} style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 12, padding: "14px 18px",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 11, color: T.text2 }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "14px 18px", borderRadius: 10, marginBottom: 20,
            background: `${STATUS_COLORS.down}12`, border: `1px solid ${STATUS_COLORS.down}30`,
            color: STATUS_COLORS.down, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Service cards */}
        {loading && !health && (
          <div style={{ padding: "60px 0", textAlign: "center", color: T.text2, fontSize: 13 }}>
            Checking all services…
          </div>
        )}

        {health && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}>
            {Object.entries(services).map(([name, svc]) => (
              <ServiceCard key={name} name={name} health={svc} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
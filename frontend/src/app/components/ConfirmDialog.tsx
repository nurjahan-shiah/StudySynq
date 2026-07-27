"use client";

/**
 * components/ConfirmDialog.tsx
 * Shared in-app replacement for window.confirm() — used anywhere a
 * destructive action (delete task/resource/announcement/etc.) needs a
 * confirmation step without a native browser dialog.
 */

const T = {
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

export function ConfirmDialog({ title, message, confirmLabel, busy, onCancel, onConfirm }: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: "28px 32px", width: 420, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: T.text2, margin: 0, lineHeight: 1.6 }}>{message}</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${T.border}`, background: "transparent", color: T.text2,
            cursor: busy ? "not-allowed" : "pointer",
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: "none", background: T.red, color: "#fff",
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
          }}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;

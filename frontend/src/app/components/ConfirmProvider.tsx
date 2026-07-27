"use client";

/**
 * components/ConfirmProvider.tsx
 *
 * Promise-based, in-app replacement for window.confirm(). The plain
 * <ConfirmDialog /> component needs open/pending state wired up at every call
 * site, which is why call sites kept falling back to the native dialog. This
 * wraps it in a context so a confirmation is a single awaited call:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete post", message: "…" }))) return;
 *
 * Mounted once in app/layout.tsx, so it's available on every page.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const T = {
  card: "var(--card-bg)",
  border: "var(--border)",
  text: "var(--text)",
  text2: "var(--text2)",
  red: "var(--ss-red)",
} as const;

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button red. Defaults to true — most uses are deletes. */
  destructive?: boolean;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Returns an async confirm(). Resolves true if the user confirms, false if they
 * cancel, press Escape, or click the backdrop.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setOptions(null);
    // Guard against a double-settle leaving a stale resolver behind.
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  // Escape cancels, Enter confirms — matching native dialog behaviour.
  useEffect(() => {
    if (!options) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [options, settle]);

  const destructive = options?.destructive !== false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {options && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ss-confirm-title"
          onClick={() => settle(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: 16,
          }}
        >
          <div
            className="ss-modal-anim"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 16,
              padding: "26px 28px",
              width: "100%",
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
            }}
          >
            <h2
              id="ss-confirm-title"
              style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}
            >
              {options.title}
            </h2>

            {options.message && (
              <p
                style={{
                  fontSize: 13,
                  color: T.text2,
                  margin: 0,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {options.message}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={() => settle(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  color: T.text2,
                  cursor: "pointer",
                }}
              >
                {options.cancelLabel ?? "Cancel"}
              </button>

              <button
                autoFocus
                onClick={() => settle(true)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  background: destructive ? T.red : "var(--ss-blue)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export default ConfirmProvider;
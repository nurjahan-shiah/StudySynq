"use client";

/**
 * components/ThemeToggle.tsx
 * Sun/moon button that switches dark ↔ light mode.
 * Reads & writes localStorage("ss-theme") and sets data-theme on <html>.
 * Drop this anywhere — it self-initialises on mount.
 */

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync with whatever the layout script set before hydration
  useEffect(() => {
    const stored = (localStorage.getItem("ss-theme") as Theme) || "dark";
    setTheme(stored);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ss-theme", next);
  }

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      style={{
        width:           40,
        height:          40,
        borderRadius:    10,
        background:      "var(--bg3)",
        border:          "1px solid var(--border)",
        color:           "var(--text)",
        cursor:          "pointer",
        fontSize:        "1.1rem",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        transition:      "border-color 0.2s",
        flexShrink:      0,
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

export default ThemeToggle;
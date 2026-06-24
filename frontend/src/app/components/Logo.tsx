/**
 * components/Logo.tsx
 * Reusable StudySync logo — icon + wordmark.
 * Used on every page/navbar. Single source of truth for the brand.
 */

import Link from "next/link";

interface LogoProps {
  /** Size of the icon square in px (default 36) */
  iconSize?: number;
  /** Font size of the wordmark (default "1.3rem") */
  wordmarkSize?: string;
  /** Whether to wrap the logo in a link to "/" (default true) */
  linked?: boolean;
}

/** The four coloured stripe icon */
export function LogoIcon({ size = 36 }: { size?: number }) {
  const stripes = [
    { w: size * 0.60, color: "var(--ss-blue)"   },
    { w: size * 0.54, color: "var(--ss-green)"  },
    { w: size * 0.48, color: "var(--ss-yellow)" },
    { w: size * 0.42, color: "var(--ss-red)"    },
  ];

  return (
    <div
      style={{
        width:          size,
        height:         size,
        borderRadius:   size * 0.22,
        background:     "var(--bg3)",
        border:         "1px solid var(--border)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
        flexShrink:     0,
      }}
    >
      <div
        style={{
          transform:      "rotate(-20deg)",
          display:        "flex",
          flexDirection:  "column",
          gap:            Math.max(2, size * 0.08),
        }}
      >
        {stripes.map((s, i) => (
          <span
            key={i}
            style={{
              display:      "block",
              height:       Math.max(3, size * 0.095),
              width:        s.w,
              borderRadius: 2,
              background:   s.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** "study" + red "Sync" text */
export function LogoWordmark({ size = "1.3rem" }: { size?: string }) {
  return (
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.5px" }}>
      <span style={{ color: "var(--text)" }}>study</span>
      <span style={{ color: "var(--ss-red)" }}>Sync</span>
    </span>
  );
}

/** Full logo: icon + wordmark side by side */
export function Logo({ iconSize = 36, wordmarkSize = "1.3rem", linked = true }: LogoProps) {
  const inner = (
    <span
      style={{
        display:     "flex",
        alignItems:  "center",
        gap:         10,
        textDecoration: "none",
      }}
    >
      <LogoIcon size={iconSize} />
      <LogoWordmark size={wordmarkSize} />
    </span>
  );

  if (!linked) return inner;

  return (
    <Link href="/" style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}

export default Logo;
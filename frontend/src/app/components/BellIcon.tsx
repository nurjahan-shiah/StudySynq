/**
 * components/BellIcon.tsx — minimal line-style bell that inherits `currentColor`,
 * so it matches the flat grey of the other nav icons (and turns red when active).
 */
interface BellIconProps {
  size?: number;
}

export function BellIcon({ size = 18 }: BellIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export default BellIcon;

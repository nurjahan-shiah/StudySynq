"use client";

/**
 * components/Navbar.tsx
 * Shared top navigation bar used on every page.
 *
 * Usage:
 *   import Navbar from "@/components/navbar";
 *   <Navbar rightSlot={<>...custom buttons...</>} />
 *
 * The ThemeToggle is always shown on the right.
 * Pass `rightSlot` to add page-specific buttons next to it.
 */

import { ReactNode } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

interface NavbarProps {
  /** Extra content rendered to the right of the theme toggle */
  rightSlot?: ReactNode;
}

export function Navbar({ rightSlot }: NavbarProps) {
  return (
    <nav className="ss-nav">
      <Logo iconSize={36} wordmarkSize="1.3rem" linked />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ThemeToggle />
        {rightSlot}
      </div>
    </nav>
  );
}

export default Navbar;
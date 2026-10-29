"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/neuxus", label: "NEUXUS" },
  { href: "/chat", label: "Chat" },
] as const;

/** The single bridge between the chat and neuxus UIs. */
export function ModeSwitcher() {
  const pathname = usePathname();
  const isNeuxus = pathname.startsWith("/neuxus");

  return (
    <nav
      aria-label="Switch app"
      className="fixed top-3 left-3 z-50 flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-sm"
    >
      {MODES.map((mode) => {
        const active = mode.href === "/neuxus" ? isNeuxus : !isNeuxus;
        return (
          <Link
            key={mode.href}
            href={mode.href}
            className={
              active
                ? "rounded-full bg-accent px-3 py-1 font-display text-white text-xs no-underline"
                : "rounded-full px-3 py-1 font-display text-muted text-xs no-underline hover:text-ink"
            }
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}

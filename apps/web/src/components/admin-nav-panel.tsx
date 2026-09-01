"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ApiUser } from "@/lib/api";
import { apiBaseUrl } from "@/lib/api-client";
import { displayName } from "@/lib/display-name";
import { AdminBadge } from "./admin-badge";

type NavItem =
  | { href: string; label: string; external?: false }
  | { href: string; label: string; external: true };

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/server-settings", label: "Server settings" },
  { href: "/knowledge-base", label: "Knowledge base" },
  { href: `${apiBaseUrl()}/openapi`, label: "OpenAPI", external: true },
];

function navItemClass(selected: boolean): string {
  return selected
    ? "flex w-full rounded border border-accent border-l-4 bg-accent/15 px-2 py-1.5 font-display text-ink text-sm no-underline"
    : "flex w-full rounded border border-line bg-canvas px-2 py-1.5 font-display text-ink text-sm no-underline hover:border-accent";
}

export function AdminNavPanel({ user }: { user: ApiUser }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-3 border-line border-r bg-surface p-4">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Link
          href="/ask"
          className="m-0 font-display text-ink text-xl uppercase no-underline hover:text-accent"
        >
          neuxus
        </Link>
      </div>
      <div className="shrink-0 border-line border-t" />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-1">
        <h3 className="m-0 font-display text-base text-ink">Admin</h3>
        <p className="m-0 shrink-0 text-muted text-xs">
          Provider config and knowledge-base inspection.
        </p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {NAV_ITEMS.map((item) => {
            const selected =
              !item.external &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`));
            const className = navItemClass(selected);
            return (
              <li key={item.href}>
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link href={item.href} className={className}>
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-line border-t pt-3">
        <h2 className="m-0 flex items-center gap-2 font-display text-ink text-lg">
          {displayName(user.id)}
          <AdminBadge />
        </h2>
        <Link
          href="/ask"
          className="rounded border border-line bg-transparent px-2 py-1.5 text-center text-muted text-xs no-underline hover:border-ink hover:text-ink"
        >
          Back to Ask
        </Link>
        <Link
          href={`/settings/${encodeURIComponent(user.id)}`}
          className="rounded border border-line bg-transparent px-2 py-1.5 text-center text-muted text-xs no-underline hover:border-ink hover:text-ink"
        >
          Settings
        </Link>
        <Link
          href="/auth"
          className="rounded border border-line bg-transparent px-2 py-1.5 text-center text-muted text-xs no-underline hover:border-ink hover:text-ink"
        >
          Switch Account
        </Link>
      </div>
    </aside>
  );
}

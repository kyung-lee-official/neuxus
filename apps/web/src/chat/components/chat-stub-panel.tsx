"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useActiveUserStore } from "@/chat/lib/active-user-store";
import {
  chatApiBaseUrl,
  getHealth,
  listUsers,
  UserQueryKey,
} from "@/chat/lib/api";
import { ActiveUserPanel } from "./active-user-panel";
import { SessionStatusChip } from "./session-status-chip";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ChatStubPanel() {
  const router = useRouter();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const activeSessionId = useActiveUserStore((s) => s.activeSessionId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    setStoreReady(useActiveUserStore.persist.hasHydrated());
    return useActiveUserStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

  const healthQuery = useQuery({
    queryKey: UserQueryKey.Health,
    queryFn: getHealth,
  });

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: storeReady,
  });

  const active = useMemo(() => {
    const users = usersQuery.data;
    if (!users || !activeUserId) return null;
    return users.find((u) => u.id === activeUserId) ?? null;
  }, [usersQuery.data, activeUserId]);

  useEffect(() => {
    if (!storeReady) return;
    if (!activeUserId) {
      router.replace("/chat/auth");
      return;
    }
    const users = usersQuery.data;
    if (!users) return;
    if (!users.some((u) => u.id === activeUserId)) {
      setActiveUserId(null);
      router.replace("/chat/auth");
    }
  }, [storeReady, activeUserId, usersQuery.data, router, setActiveUserId]);

  if (!storeReady || !activeUserId || !active) {
    return (
      <p className="m-0 px-5 py-8 text-muted text-sm">
        {!storeReady ? "Loading session…" : "Redirecting to sign in…"}
      </p>
    );
  }

  const healthOk = healthQuery.data?.ok === true;
  const healthError = healthQuery.isError
    ? errorMessage(healthQuery.error)
    : null;

  return (
    <div className="flex h-dvh overflow-hidden">
      <ActiveUserPanel active={active} />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute top-3 left-3 z-20">
          <div className="pointer-events-auto">
            <SessionStatusChip
              apiUrl={chatApiBaseUrl()}
              sessionId={activeSessionId}
              healthLoading={healthQuery.isLoading}
              healthOk={healthOk}
              healthError={healthError}
            />
          </div>
        </div>

        <main className="flex min-h-0 flex-1 items-center justify-center px-5 py-10">
          <section className="w-full max-w-xl rounded-md border border-line bg-surface p-6 text-center shadow-sm">
            <p className="m-0 font-display text-muted text-xs uppercase tracking-wide">
              neuxus chat
            </p>
            <h1 className="mt-2 mb-0 font-display text-2xl text-ink">
              Chat is being refactored
            </h1>
            <p className="mt-3 mb-0 text-muted text-sm">
              Sign-in, users, sessions, and settings are live against{" "}
              <code className="font-mono text-xs">api-chat</code>. The dialog
              will return once the neuxus call is wired.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                href={`/chat/settings/${encodeURIComponent(active.id)}`}
                className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white no-underline"
              >
                Open settings
              </Link>
              <Link
                href="/chat/settings/logs"
                className="rounded border border-line bg-transparent px-3.5 py-2 text-ink text-sm no-underline hover:border-ink"
              >
                My logs
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

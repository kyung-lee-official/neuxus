"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useActiveUserStore } from "@/chat/lib/active-user-store";
import { listUsers, UserQueryKey } from "@/chat/lib/api";
import { AgentSettingsBlock } from "./agent-settings-block";

export function GlobalSettingsPanel() {
  const router = useRouter();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    setStoreReady(useActiveUserStore.persist.hasHydrated());
    return useActiveUserStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: storeReady,
  });

  const active = useMemo(() => {
    const users = usersQuery.data;
    if (!users || !activeUserId) return null;
    return users.find((user) => user.id === activeUserId) ?? null;
  }, [usersQuery.data, activeUserId]);

  useEffect(() => {
    if (!storeReady) return;
    if (!activeUserId) {
      router.replace("/chat/auth");
      return;
    }
    const users = usersQuery.data;
    if (!users) return;
    if (!users.some((user) => user.id === activeUserId)) {
      setActiveUserId(null);
      router.replace("/chat/auth");
    }
  }, [storeReady, activeUserId, usersQuery.data, router, setActiveUserId]);

  if (!storeReady || !activeUserId) {
    return (
      <p className="m-0 text-muted text-sm">
        {!storeReady ? "Loading…" : "Redirecting…"}
      </p>
    );
  }

  if (usersQuery.isLoading) {
    return <p className="m-0 text-muted text-sm">Loading user…</p>;
  }

  if (!active) {
    return (
      <p className="m-0 text-danger text-sm">
        User not found.{" "}
        <Link href="/chat/auth" className="text-accent">
          Sign in
        </Link>
      </p>
    );
  }

  if (active.role !== "admin") {
    return (
      <section className="w-full max-w-2xl rounded-md border border-line bg-surface p-6">
        <h1 className="m-0 font-display text-ink text-xl">Admin only</h1>
        <p className="mt-2 mb-4 text-muted text-sm">
          Global chat settings can only be changed by an admin.
        </p>
        <Link
          href="/chat"
          className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm no-underline hover:border-ink"
        >
          Back to chat
        </Link>
      </section>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <section className="flex items-center justify-between gap-2">
        <div>
          <h1 className="m-0 font-display text-2xl text-ink">
            Global settings
          </h1>
          <p className="mt-1 mb-0 text-muted text-sm">
            Applies to every chat user and agent run.
          </p>
        </div>
        <Link
          href="/chat"
          className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs no-underline hover:border-ink hover:text-ink"
        >
          Back to chat
        </Link>
      </section>

      <AgentSettingsBlock apiKey={active.apiKey} />
    </div>
  );
}

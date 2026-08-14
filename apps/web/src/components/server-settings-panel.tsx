"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import { listUsers, UserQueryKey } from "@/lib/api";

export function ServerSettingsPanel() {
  const router = useRouter();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
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
    enabled: storeReady && Boolean(activeUserId),
  });

  const user = usersQuery.data?.find((u) => u.id === activeUserId) ?? null;

  useEffect(() => {
    if (!storeReady) return;
    if (!activeUserId) {
      router.replace("/auth");
      return;
    }
    if (usersQuery.isLoading || !usersQuery.data) return;
    if (!user || user.role !== "admin") {
      router.replace("/ask");
    }
  }, [
    storeReady,
    activeUserId,
    usersQuery.isLoading,
    usersQuery.data,
    user,
    router,
  ]);

  if (!storeReady || !activeUserId) {
    return (
      <p className="m-0 text-muted text-sm">
        {!storeReady ? "Loading…" : "Redirecting…"}
      </p>
    );
  }

  if (usersQuery.isLoading) {
    return <p className="m-0 text-muted text-sm">Loading…</p>;
  }

  if (!user || user.role !== "admin") {
    return <p className="m-0 text-muted text-sm">Redirecting…</p>;
  }

  return (
    <section className="flex w-full max-w-md flex-col gap-4 rounded-md border border-line bg-surface p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 font-display text-2xl text-ink">Server settings</h1>
        <Link href="/ask" className="text-accent text-sm">
          Back to Ask
        </Link>
      </div>
      <p className="m-0 text-muted text-sm">
        Embed and synthesis provider settings will live here. Admin only.
      </p>
    </section>
  );
}

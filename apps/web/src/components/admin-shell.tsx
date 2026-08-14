"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import { type ApiUser, listUsers, UserQueryKey } from "@/lib/api";
import { AdminNavPanel } from "./admin-nav-panel";

const AdminUserContext = createContext<ApiUser | null>(null);

export function useAdminUser(): ApiUser {
  const user = useContext(AdminUserContext);
  if (!user) {
    throw new Error("useAdminUser must be used within AdminShell");
  }
  return user;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
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
      <p className="m-0 px-5 py-8 text-muted text-sm">
        {!storeReady ? "Loading…" : "Redirecting…"}
      </p>
    );
  }

  if (usersQuery.isLoading) {
    return <p className="m-0 px-5 py-8 text-muted text-sm">Loading…</p>;
  }

  if (!user || user.role !== "admin") {
    return <p className="m-0 px-5 py-8 text-muted text-sm">Redirecting…</p>;
  }

  return (
    <AdminUserContext.Provider value={user}>
      <div className="flex h-dvh overflow-hidden">
        <AdminNavPanel user={user} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-8 pb-16">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </div>
      </div>
    </AdminUserContext.Provider>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiError, listKnowledgeBases } from "@/neuxus/lib/api";
import { useNeuxusAuthStore } from "@/neuxus/lib/auth-store";
import { NeuxusAuthPanel } from "./neuxus-auth-panel";
import { NeuxusNavPanel } from "./neuxus-nav-panel";

type NeuxusAuthContextValue = {
  token: string;
  signOut: () => void;
};

const NeuxusAuthContext = createContext<NeuxusAuthContextValue | null>(null);

export function useNeuxusAuth(): NeuxusAuthContextValue {
  const value = useContext(NeuxusAuthContext);
  if (!value) {
    throw new Error("useNeuxusAuth must be used within NeuxusShell");
  }
  return value;
}

export function useNeuxusToken(): string {
  return useNeuxusAuth().token;
}

export function NeuxusShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const token = useNeuxusAuthStore((s) => s.token);
  const clear = useNeuxusAuthStore((s) => s.clear);
  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    setStoreReady(useNeuxusAuthStore.persist.hasHydrated());
    return useNeuxusAuthStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

  // A knowledge-base read is the cheapest authenticated probe. An empty list
  // is still a valid token.
  const validation = useQuery({
    queryKey: ["neuxus-session", token],
    queryFn: () => listKnowledgeBases(token ?? ""),
    enabled: storeReady && Boolean(token),
    retry: false,
  });

  function signOut() {
    clear();
    router.replace("/neuxus");
  }

  if (!storeReady) {
    return <p className="m-0 px-5 py-8 text-muted text-sm">Loading…</p>;
  }

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-5 py-10">
        <NeuxusAuthPanel />
      </main>
    );
  }

  if (validation.isLoading) {
    return <p className="m-0 px-5 py-8 text-muted text-sm">Loading…</p>;
  }

  if (validation.isError) {
    const message =
      validation.error instanceof ApiError && validation.error.status === 401
        ? "Invalid neuxus service token."
        : validation.error instanceof Error
          ? validation.error.message
          : "Could not authenticate with neuxus.";
    return (
      <main className="flex min-h-dvh items-center justify-center px-5 py-10">
        <NeuxusAuthPanel error={message} />
      </main>
    );
  }

  return (
    <NeuxusAuthContext.Provider value={{ token, signOut }}>
      <div className="flex h-dvh overflow-hidden">
        <NeuxusNavPanel onSignOut={signOut} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-8 pb-16">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </div>
      </div>
    </NeuxusAuthContext.Provider>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import { ApiError, listUsers, nukeDatabase, UserQueryKey } from "@/lib/api";
import { EmbedSettingsBlock } from "./embed-settings-block";
import { Modal } from "./modal";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ServerSettingsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [storeReady, setStoreReady] = useState(false);
  const [nukeConfirmOpen, setNukeConfirmOpen] = useState(false);

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
    <div className="flex w-full max-w-lg flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 font-display text-2xl text-ink">
            Server settings
          </h1>
          <Link href="/ask" className="text-accent text-sm">
            Back to Ask
          </Link>
        </div>
        <p className="m-0 text-muted text-sm">
          Admin-only provider config. Synthesis settings come next.
        </p>
      </section>
      <EmbedSettingsBlock actorApiKey={user.apiKey} />
      <NukeDbBlock
        actorApiKey={user.apiKey}
        confirmOpen={nukeConfirmOpen}
        onConfirmOpen={setNukeConfirmOpen}
        onNuked={() => {
          setActiveUserId(null);
          queryClient.clear();
          router.replace("/auth");
        }}
      />
    </div>
  );
}

function NukeDbBlock({
  actorApiKey,
  confirmOpen,
  onConfirmOpen,
  onNuked,
}: {
  actorApiKey: string;
  confirmOpen: boolean;
  onConfirmOpen: (open: boolean) => void;
  onNuked: () => void;
}) {
  const nukeMutation = useMutation({
    mutationFn: () => nukeDatabase({ apiKey: actorApiKey, target: "app" }),
    onSuccess: () => {
      onConfirmOpen(false);
      onNuked();
    },
  });

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Danger zone</h2>
      <p className="m-0 text-muted text-sm">
        Hard-wipe the neuxus database. Re-run Prisma migrate and seed afterward.
      </p>
      {nukeMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(nukeMutation.error)}
        </p>
      ) : null}
      <button
        type="button"
        className="self-start rounded border border-danger bg-transparent px-3.5 py-2 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={nukeMutation.isPending}
        onClick={() => onConfirmOpen(true)}
      >
        Nuke DB
      </button>
      <Modal
        open={confirmOpen}
        title="Nuke DB?"
        titleId="nuke-dialog-title"
        onClose={() => onConfirmOpen(false)}
        closeDisabled={nukeMutation.isPending}
      >
        <p className="m-0 text-muted text-sm">
          Drops the entire <code className="font-mono text-xs">public</code>{" "}
          schema on <code className="font-mono text-xs">DATABASE_URL</code>{" "}
          (tables and extensions). Cannot be undone. Afterward run Prisma
          migrate and <code className="font-mono text-xs">bun run seed</code>.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded border border-danger bg-danger px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={nukeMutation.isPending}
            onClick={() => nukeMutation.mutate()}
          >
            {nukeMutation.isPending ? "Nuking…" : "Nuke DB"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

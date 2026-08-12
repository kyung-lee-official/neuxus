"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useActiveUserStore } from "@/lib/active-user-store";
import {
  ApiError,
  createUser,
  deleteUser,
  listUsers,
  nukeDatabase,
  regenerateUserKey,
  UserQueryKey,
} from "@/lib/api";
import { displayName } from "@/lib/display-name";
import { Modal } from "./modal";

const createUserSchema = z.object({
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z][a-z0-9_-]{0,63}$/,
      "Use a lowercase id (letter, then letters/digits/_/-)",
    ),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function AuthPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedInUserId = useActiveUserStore((s) => s.activeUserId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [storeReady, setStoreReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  });

  const users = usersQuery.data ?? [];

  useEffect(() => {
    if (!storeReady || users.length === 0) return;
    setSelectedId((prev) => {
      if (prev && users.some((u) => u.id === prev)) return prev;
      if (signedInUserId && users.some((u) => u.id === signedInUserId)) {
        return signedInUserId;
      }
      return users[0]?.id ?? null;
    });
  }, [storeReady, users, signedInUserId]);

  const actorApiKey = useMemo(() => {
    const byId = (id: string | null) =>
      id ? (users.find((u) => u.id === id)?.apiKey ?? null) : null;
    return byId(signedInUserId) ?? byId(selectedId) ?? users[0]?.apiKey ?? null;
  }, [users, signedInUserId, selectedId]);

  const createForm = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { id: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateUserValues) =>
      createUser({ id: values.id, actorApiKey }),
    onSuccess: async (user) => {
      createForm.reset({ id: "" });
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      setSelectedId(user.id);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => {
      if (!actorApiKey) throw new Error("Need an actor API key.");
      return regenerateUserKey({ id, actorApiKey });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!actorApiKey) throw new Error("Need an actor API key to delete.");
      return deleteUser({ id, actorApiKey });
    },
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      if (id === signedInUserId) setActiveUserId(null);
      setSelectedId((prev) => (prev === id ? null : prev));
    },
  });

  const nukeMutation = useMutation({
    mutationFn: () => nukeDatabase("app"),
    onSuccess: async () => {
      setNukeConfirmOpen(false);
      setActiveUserId(null);
      setSelectedId(null);
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
    },
  });

  const busy =
    usersQuery.isFetching ||
    createMutation.isPending ||
    regenerateMutation.isPending ||
    deleteMutation.isPending ||
    nukeMutation.isPending ||
    createForm.formState.isSubmitting;

  const actionError =
    (createMutation.isError ? errorMessage(createMutation.error) : null) ||
    (regenerateMutation.isError
      ? errorMessage(regenerateMutation.error)
      : null) ||
    (deleteMutation.isError ? errorMessage(deleteMutation.error) : null) ||
    (nukeMutation.isError ? errorMessage(nukeMutation.error) : null) ||
    (usersQuery.isError ? errorMessage(usersQuery.error) : null);

  function signIn() {
    if (!selectedId) return;
    setActiveUserId(selectedId);
    router.push("/ask");
  }

  return (
    <section className="flex w-full max-w-md flex-col overflow-hidden rounded-md border border-line bg-surface shadow-sm">
      <div className="shrink-0 px-6 pt-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="m-0 font-display text-2xl text-ink">Sign in</h1>
          <button
            type="button"
            className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void usersQuery.refetch()}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
        <p className="mt-0 mb-4 text-muted text-sm">
          Select a user, then Sign in. Switching users here does not change the
          conversation session until you sign in.
        </p>
        {signedInUserId ? (
          <p className="mt-0 mb-4 text-muted text-sm">
            Currently signed in as{" "}
            <strong className="text-ink">{signedInUserId}</strong>. You can keep
            that session or sign in as someone else.
          </p>
        ) : null}
        {actionError ? (
          <p className="mt-0 mb-3 text-danger text-sm">{actionError}</p>
        ) : null}
      </div>

      <div className="max-h-66 min-h-0 overflow-y-auto px-6">
        {usersQuery.isLoading ? (
          <p className="m-0 text-muted text-sm">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="m-0 text-muted text-sm">
            No users yet. Create one below to get started.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 pb-2">
            {users.map((user) => {
              const selected = user.id === selectedId;
              const signedIn = user.id === signedInUserId;
              return (
                <li
                  key={user.id}
                  className={
                    selected
                      ? "flex w-full items-stretch gap-2 rounded border border-accent border-l-4 bg-accent/15 px-2.5 py-2"
                      : "flex w-full items-stretch gap-2 rounded border border-line bg-canvas px-2.5 py-2"
                  }
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setSelectedId(user.id)}
                    disabled={busy}
                  >
                    <span className="flex items-baseline gap-2 font-display text-base">
                      {displayName(user.id)}
                      {signedIn ? (
                        <span className="font-mono text-muted text-xs">
                          (signed in)
                        </span>
                      ) : null}
                    </span>
                    <code className="break-all font-mono text-muted text-xs">
                      {user.apiKey}
                    </code>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => regenerateMutation.mutate(user.id)}
                      disabled={busy || !actorApiKey}
                      title="Regenerate API key"
                    >
                      New key
                    </button>
                    <button
                      type="button"
                      className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete user "${user.id}"? Memories and chat will cascade.`,
                          )
                        ) {
                          return;
                        }
                        deleteMutation.mutate(user.id);
                      }}
                      disabled={busy || !actorApiKey}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-line border-t px-6 pt-4 pb-6">
        <button
          type="button"
          className="mb-4 w-full rounded border border-accent bg-accent px-3.5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy || !selectedId}
          onClick={signIn}
        >
          Sign in{selectedId ? ` as ${displayName(selectedId)}` : ""}
        </button>

        <form
          className="flex flex-col gap-2"
          onSubmit={createForm.handleSubmit((values) =>
            createMutation.mutate(values),
          )}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>New user id</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder="e.g. mina"
              disabled={busy}
              {...createForm.register("id")}
            />
          </label>
          {createForm.formState.errors.id ? (
            <p className="m-0 text-danger text-sm">
              {createForm.formState.errors.id.message}
            </p>
          ) : null}
          <button
            type="submit"
            className="self-start rounded border border-line bg-transparent px-3.5 py-1.5 text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            Create user
          </button>
        </form>

        <div className="mt-6 border-line border-t pt-4">
          <p className="mt-0 mb-2 text-muted text-xs">
            Hard-wipe the neuxus database. Re-run Prisma migrate and seed
            afterward.
          </p>
          <button
            type="button"
            className="w-full rounded border border-danger bg-transparent px-3.5 py-2 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => setNukeConfirmOpen(true)}
          >
            Nuke DB
          </button>
        </div>
      </div>

      <Modal
        open={nukeConfirmOpen}
        title="Nuke DB?"
        titleId="nuke-dialog-title"
        onClose={() => setNukeConfirmOpen(false)}
        closeDisabled={nukeMutation.isPending}
      >
        <p className="m-0 text-muted text-sm">
          Drops the entire <code className="font-mono text-xs">public</code>{" "}
          schema on <code className="font-mono text-xs">DATABASE_URL</code>{" "}
          (tables and extensions). Cannot be undone. Afterward run Prisma
          migrate and <code className="font-mono text-xs">bun run seed</code>.
        </p>
        {nukeMutation.isError ? (
          <p className="mt-3 mb-0 text-danger text-sm">
            {errorMessage(nukeMutation.error)}
          </p>
        ) : null}
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

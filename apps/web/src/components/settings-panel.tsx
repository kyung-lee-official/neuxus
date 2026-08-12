"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useActiveUserStore } from "@/lib/active-user-store";
import {
  ApiError,
  deleteUserMemory,
  getUserData,
  listUsers,
  postRemember,
  regenerateUserKey,
  type UserDataDump,
  UserQueryKey,
} from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { displayName } from "@/lib/display-name";

const rememberSchema = z.object({
  content: z.string().trim().min(1, "content is required"),
});

type RememberValues = z.infer<typeof rememberSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function SettingsPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const [storeReady, setStoreReady] = useState(false);
  const [rememberNotice, setRememberNotice] = useState<string | null>(null);

  useEffect(() => {
    setStoreReady(useActiveUserStore.persist.hasHydrated());
    return useActiveUserStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    if (!activeUserId) {
      router.replace("/auth");
      return;
    }
    if (activeUserId !== userId) {
      router.replace(`/settings/${encodeURIComponent(activeUserId)}`);
    }
  }, [storeReady, activeUserId, userId, router]);

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: storeReady && Boolean(activeUserId),
  });

  const user = usersQuery.data?.find((u) => u.id === userId) ?? null;

  const dataQuery = useQuery({
    queryKey: UserQueryKey.Data(userId, 1),
    queryFn: () => {
      if (!user) throw new Error("User not found");
      return getUserData({ id: user.id, apiKey: user.apiKey, messagePage: 1 });
    },
    enabled: Boolean(user),
  });

  const rememberForm = useForm<RememberValues>({
    resolver: zodResolver(rememberSchema),
    defaultValues: { content: "" },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("User not found.");
      return regenerateUserKey({ id: user.id, actorApiKey: user.apiKey });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.DataRoot(userId),
      });
    },
  });

  const rememberMutation = useMutation({
    mutationFn: (values: RememberValues) => {
      if (!user) throw new Error("User not found.");
      return postRemember({ apiKey: user.apiKey, content: values.content });
    },
    onSuccess: async (data) => {
      rememberForm.reset({ content: "" });
      setRememberNotice(
        data.slug ? `Saved note as ${data.slug}.` : "Saved note.",
      );
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.DataRoot(userId),
      });
    },
    onError: (err) => setRememberNotice(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: number) => {
      if (!user) throw new Error("User not found.");
      return deleteUserMemory({
        userId: user.id,
        memoryId,
        apiKey: user.apiKey,
      });
    },
    onMutate: async (memoryId) => {
      const key = UserQueryKey.Data(userId, 1);
      await queryClient.cancelQueries({
        queryKey: UserQueryKey.DataRoot(userId),
      });
      const previous = queryClient.getQueryData<UserDataDump>(key);
      queryClient.setQueryData<UserDataDump>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          memories: old.memories.filter((m) => m.id !== memoryId),
        };
      });
      return { previous, key };
    },
    onError: (_err, _memoryId, ctx) => {
      if (ctx?.previous && ctx.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.DataRoot(userId),
      });
    },
  });

  if (!storeReady || !activeUserId || activeUserId !== userId) {
    return (
      <p className="m-0 text-muted text-sm">
        {!storeReady ? "Loading…" : "Redirecting…"}
      </p>
    );
  }

  if (usersQuery.isLoading) {
    return <p className="m-0 text-muted text-sm">Loading user…</p>;
  }

  if (!user) {
    return (
      <p className="m-0 text-danger text-sm">
        User not found.{" "}
        <Link href="/auth" className="text-accent">
          Sign in
        </Link>
      </p>
    );
  }

  const memories = dataQuery.data?.memories ?? [];
  const actionError =
    (regenerateMutation.isError
      ? errorMessage(regenerateMutation.error)
      : null) ||
    (deleteMutation.isError ? errorMessage(deleteMutation.error) : null) ||
    (dataQuery.isError ? errorMessage(dataQuery.error) : null);

  const busy =
    regenerateMutation.isPending ||
    rememberMutation.isPending ||
    deleteMutation.isPending ||
    rememberForm.formState.isSubmitting;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 font-display text-2xl text-ink">
            {displayName(user.id)} settings
          </h1>
          <Link
            href="/ask"
            className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs no-underline hover:border-ink hover:text-ink"
          >
            Back to chat
          </Link>
        </div>

        <div className="flex flex-col gap-2 rounded border border-line bg-canvas px-3 py-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-muted text-xs">User id</span>
            <code className="font-mono text-ink text-sm">{user.id}</code>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted text-xs">API key</span>
            <code className="break-all font-mono text-ink text-sm">
              {user.apiKey}
            </code>
          </div>
          {user.createdAt ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">Created</span>
              <span className="font-mono text-ink text-sm">
                {formatDateTime(user.createdAt)}
              </span>
            </div>
          ) : null}
        </div>

        {actionError ? (
          <p className="m-0 text-danger text-sm">{actionError}</p>
        ) : null}

        <button
          type="button"
          className="self-start rounded border border-line bg-transparent px-3 py-1.5 text-ink text-sm hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={() => regenerateMutation.mutate()}
        >
          New key
        </button>
      </section>

      <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 font-display text-ink text-lg">
            Memories ({memories.length})
          </h2>
          <button
            type="button"
            className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void dataQuery.refetch()}
            disabled={dataQuery.isFetching || busy}
          >
            Refresh
          </button>
        </div>
        <p className="m-0 text-muted text-sm">
          Personal notes in{" "}
          <code className="font-mono text-xs">app_memories</code> for this user.
        </p>

        <form
          className="flex flex-col gap-2.5"
          onSubmit={rememberForm.handleSubmit((values) => {
            setRememberNotice(null);
            rememberMutation.mutate(values);
          })}
        >
          <textarea
            className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
            rows={3}
            placeholder="My favorite coffee is oat latte."
            disabled={busy}
            {...rememberForm.register("content")}
          />
          {rememberForm.formState.errors.content ? (
            <p className="m-0 text-danger text-sm">
              {rememberForm.formState.errors.content.message}
            </p>
          ) : null}
          {rememberNotice ? (
            <p
              className={
                rememberMutation.isError
                  ? "m-0 text-danger text-sm"
                  : "m-0 text-ok text-sm"
              }
            >
              {rememberNotice}
            </p>
          ) : null}
          <button
            type="submit"
            className="self-start rounded border border-accent bg-accent px-3.5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            Add a Memory
          </button>
        </form>

        {dataQuery.isLoading ? (
          <p className="m-0 text-muted text-sm">Loading…</p>
        ) : memories.length === 0 ? (
          <p className="m-0 text-muted text-sm">No memories yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-1 rounded border border-line bg-canvas p-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-muted text-xs">
                    <span>#{m.id}</span>
                    <code className="text-ink">{m.slug}</code>
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(`Delete memory #${m.id} (${m.slug})?`)
                      ) {
                        return;
                      }
                      deleteMutation.mutate(m.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words font-display text-ink text-sm leading-snug">
                  {m.content}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

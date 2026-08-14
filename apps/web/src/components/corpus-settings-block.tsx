"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  cloneCorpus,
  getCorpusSettings,
  pullCorpus,
  putCorpusSettings,
  UserQueryKey,
} from "@/lib/api";

const corpusSchema = z.object({
  repoUrl: z.string(),
  branch: z.string(),
  docsRoot: z.string(),
});

type CorpusValues = z.infer<typeof corpusSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function blankToNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

export function CorpusSettingsBlock({ actorApiKey }: { actorApiKey: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.CorpusSettings,
    queryFn: () => getCorpusSettings(actorApiKey),
  });

  const form = useForm<CorpusValues>({
    resolver: zodResolver(corpusSchema),
    defaultValues: {
      repoUrl: "",
      branch: "",
      docsRoot: "",
    },
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    form.reset({
      repoUrl: data.repoUrl ?? "",
      branch: data.branch ?? "",
      docsRoot: data.docsRoot ?? "",
    });
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: CorpusValues) =>
      putCorpusSettings({
        apiKey: actorApiKey,
        settings: {
          repoUrl: blankToNull(values.repoUrl),
          branch: blankToNull(values.branch),
          docsRoot: blankToNull(values.docsRoot),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.CorpusSettings,
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => cloneCorpus(actorApiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.CorpusSettings,
      });
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => pullCorpus(actorApiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.CorpusSettings,
      });
    },
  });

  const busy =
    settingsQuery.isFetching ||
    saveMutation.isPending ||
    cloneMutation.isPending ||
    pullMutation.isPending ||
    form.formState.isSubmitting;

  const actionError =
    (saveMutation.isError ? errorMessage(saveMutation.error) : null) ||
    (cloneMutation.isError ? errorMessage(cloneMutation.error) : null) ||
    (pullMutation.isError ? errorMessage(pullMutation.error) : null) ||
    (settingsQuery.isError ? errorMessage(settingsQuery.error) : null);

  const lastSyncedSha = settingsQuery.data?.lastSyncedSha;
  const hasSavedRepo = Boolean(settingsQuery.data?.repoUrl);

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Corpus repo</h2>
      <p className="m-0 text-muted text-sm">
        Git remote for markdown sync. Empty URL means no clone.
      </p>
      <p className="m-0 text-danger/60 text-sm">
        Add this machine's SSH public key to the git repo (deploy key or
        collaborator). Otherwise clone and pull may fail.
      </p>

      {settingsQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading corpus settings…</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Repo URL</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder="https://github.com/org/kb.git"
              disabled={busy}
              {...form.register("repoUrl")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Branch</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder="main"
              disabled={busy}
              {...form.register("branch")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Docs root</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder="docs"
              disabled={busy}
              {...form.register("docsRoot")}
            />
          </label>
          <p className="m-0 font-mono text-muted text-xs">
            Last synced SHA: {lastSyncedSha ?? "none"}
          </p>
          {actionError ? (
            <p className="m-0 text-danger text-sm">{actionError}</p>
          ) : null}
          {saveMutation.isSuccess ? (
            <p className="m-0 text-ok text-sm">Saved.</p>
          ) : null}
          {cloneMutation.isSuccess ? (
            <p className="m-0 text-ok text-sm">Cloned.</p>
          ) : null}
          {pullMutation.isSuccess ? (
            <p className="m-0 text-ok text-sm">Pulled.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
            >
              {saveMutation.isPending ? "Saving…" : "Save corpus"}
            </button>
            <button
              type="button"
              className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasSavedRepo}
              onClick={() => cloneMutation.mutate()}
            >
              {cloneMutation.isPending ? "Cloning…" : "Clone"}
            </button>
            <button
              type="button"
              className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasSavedRepo}
              onClick={() => pullMutation.mutate()}
            >
              {pullMutation.isPending ? "Pulling…" : "Pull"}
            </button>
          </div>
          <p className="m-0 text-muted text-xs">
            Clone and Pull use the last saved URL and branch.
          </p>
        </form>
      )}
    </section>
  );
}

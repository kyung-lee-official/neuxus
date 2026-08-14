"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  type CorpusSyncStatus,
  cloneCorpus,
  getCorpusSettings,
  pullCorpus,
  putCorpusSettings,
  startCorpusSync,
  subscribeCorpusSyncEvents,
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

function stageLabel(status: CorpusSyncStatus | null): string | null {
  if (!status?.running) return null;
  if (status.stage === "pull") return "Pulling corpus…";
  if (status.stage === "ingest") return "Ingesting pages…";
  if (status.stage === "embed") return "Embedding…";
  return "Syncing…";
}

export function CorpusSettingsBlock({ actorApiKey }: { actorApiKey: string }) {
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<CorpusSyncStatus | null>(null);
  const wasRunning = useRef(false);
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

  useEffect(() => {
    const ac = new AbortController();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(resolve, ms);
        ac.signal.addEventListener("abort", () => {
          clearTimeout(id);
          resolve();
        });
      });

    const run = async () => {
      while (!ac.signal.aborted) {
        try {
          await subscribeCorpusSyncEvents(
            actorApiKey,
            setSyncStatus,
            ac.signal,
          );
        } catch {
          if (ac.signal.aborted) return;
        }
        if (ac.signal.aborted) return;
        await sleep(2000);
      }
    };
    void run();
    return () => ac.abort();
  }, [actorApiKey]);

  useEffect(() => {
    const running = syncStatus?.running ?? false;
    if (wasRunning.current && !running) {
      void queryClient.invalidateQueries({
        queryKey: UserQueryKey.CorpusSettings,
      });
    }
    wasRunning.current = running;
  }, [syncStatus?.running, queryClient]);

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

  const syncMutation = useMutation({
    mutationFn: () => startCorpusSync(actorApiKey),
  });

  const syncRunning = syncStatus?.running === true;
  const busy =
    settingsQuery.isFetching ||
    saveMutation.isPending ||
    cloneMutation.isPending ||
    pullMutation.isPending ||
    syncMutation.isPending ||
    syncRunning ||
    form.formState.isSubmitting;

  const actionError =
    (saveMutation.isError ? errorMessage(saveMutation.error) : null) ||
    (cloneMutation.isError ? errorMessage(cloneMutation.error) : null) ||
    (pullMutation.isError ? errorMessage(pullMutation.error) : null) ||
    (syncMutation.isError ? errorMessage(syncMutation.error) : null) ||
    syncStatus?.lastError ||
    (settingsQuery.isError ? errorMessage(settingsQuery.error) : null);

  const lastSyncedSha = settingsQuery.data?.lastSyncedSha;
  const hasSavedRepo = Boolean(settingsQuery.data?.repoUrl);
  const syncStageText = stageLabel(syncStatus);

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
          {syncStageText ? (
            <p className="m-0 text-muted text-sm">{syncStageText}</p>
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
            <button
              type="button"
              className="rounded border border-accent bg-transparent px-3.5 py-1.5 text-accent text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasSavedRepo}
              onClick={() => syncMutation.mutate()}
            >
              {syncRunning ? "Syncing…" : "Sync"}
            </button>
          </div>
          <p className="m-0 text-muted text-xs">
            Sync clones if needed, then ingest, chunkify, and embed. Clone and
            Pull only update the git checkout.
          </p>
        </form>
      )}
    </section>
  );
}

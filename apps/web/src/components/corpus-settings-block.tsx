"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  type CorpusOperation,
  type CorpusStatus,
  cloneCorpus,
  getCorpusSettings,
  listKnowledgePages,
  pullCorpus,
  putCorpusSettings,
  startChunkify,
  startCorpusSync,
  startEmbed,
  subscribeCorpusEvents,
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

type SyncHint = {
  tone: "muted" | "ok" | "danger";
  text: string;
};

function hintClass(tone: SyncHint["tone"]): string {
  if (tone === "ok") return "m-0 text-ok text-sm";
  if (tone === "danger") return "m-0 text-danger text-sm";
  return "m-0 text-muted text-sm";
}

const STAGE_LABELS: Record<Exclude<CorpusStatus["stage"], null>, string> = {
  clone: "Cloning",
  fetch: "Fetching",
  checkout: "Checking out",
  merge: "Merging",
  ingest: "Ingesting",
  chunkify: "Chunkifying",
  embed: "Embedding",
};

function stageLabel(stage: CorpusStatus["stage"]): string {
  if (!stage) return "Working";
  return STAGE_LABELS[stage];
}

const OPERATION_PAST: Record<CorpusOperation, string> = {
  clone: "Clone",
  pull: "Pull",
  chunkify: "Chunkify",
  embed: "Embed",
  sync: "Sync",
};

function progressText(progress: CorpusStatus["progress"]): string | null {
  if (!progress) return null;
  const { phase, percent, processed, total } = progress;
  const phaseLabel =
    phase === "receiving"
      ? "Receiving objects"
      : phase === "resolving"
        ? "Resolving deltas"
        : "Checking out files";
  if (processed !== undefined && total !== undefined) {
    return `${phaseLabel}: ${percent}% (${processed}/${total})`;
  }
  return `${phaseLabel}: ${percent}%`;
}

function operationHint(args: {
  status: CorpusStatus | null;
  mutationError: string | null;
  hasSavedRepo: boolean;
  finished: CorpusOperation | null;
}): SyncHint | null {
  const { status, mutationError, hasSavedRepo, finished } = args;
  if (status?.running) {
    const stageText = stageLabel(status.stage);
    const p = progressText(status.progress);
    return {
      tone: "muted",
      text: p ? `${stageText} — ${p}` : `${stageText}…`,
    };
  }
  if (mutationError) {
    return { tone: "danger", text: mutationError };
  }
  if (status?.lastError) {
    return {
      tone: "danger",
      text: `Corpus operation failed: ${status.lastError}`,
    };
  }
  if (finished) {
    return { tone: "ok", text: `${OPERATION_PAST[finished]} finished.` };
  }
  if (!hasSavedRepo) {
    return {
      tone: "muted",
      text: "Save a repo URL before cloning, pulling, or syncing.",
    };
  }
  return null;
}

export function CorpusSettingsBlock({ actorApiKey }: { actorApiKey: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CorpusStatus | null>(null);
  const [finished, setFinished] = useState<CorpusOperation | null>(null);
  const wasRunning = useRef(false);
  const lastOpRef = useRef<CorpusOperation | null>(null);
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.CorpusSettings,
    queryFn: () => getCorpusSettings(actorApiKey),
  });
  const pagesQuery = useQuery({
    queryKey: UserQueryKey.KnowledgePages,
    queryFn: () => listKnowledgePages(actorApiKey),
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
          await subscribeCorpusEvents(actorApiKey, setStatus, ac.signal);
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
    const running = status?.running ?? false;
    if (running) {
      setFinished(null);
      if (status?.operation) lastOpRef.current = status.operation;
    }
    if (wasRunning.current && !running) {
      setFinished(status?.lastError ? null : lastOpRef.current);
      void queryClient.invalidateQueries({
        queryKey: UserQueryKey.CorpusSettings,
      });
      void queryClient.invalidateQueries({
        queryKey: UserQueryKey.KnowledgePages,
      });
    }
    wasRunning.current = running;
  }, [status, queryClient]);

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

  const chunkifyMutation = useMutation({
    mutationFn: () => startChunkify(actorApiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.KnowledgePages,
      });
    },
  });

  const embedMutation = useMutation({
    mutationFn: () => startEmbed(actorApiKey),
  });

  const syncMutation = useMutation({
    mutationFn: () => startCorpusSync(actorApiKey),
  });

  const running = status?.running === true;
  const busy =
    settingsQuery.isFetching ||
    saveMutation.isPending ||
    cloneMutation.isPending ||
    pullMutation.isPending ||
    chunkifyMutation.isPending ||
    embedMutation.isPending ||
    syncMutation.isPending ||
    running ||
    form.formState.isSubmitting;

  const actionError =
    (saveMutation.isError ? errorMessage(saveMutation.error) : null) ||
    (cloneMutation.isError ? errorMessage(cloneMutation.error) : null) ||
    (pullMutation.isError ? errorMessage(pullMutation.error) : null) ||
    (chunkifyMutation.isError ? errorMessage(chunkifyMutation.error) : null) ||
    (embedMutation.isError ? errorMessage(embedMutation.error) : null) ||
    (syncMutation.isError ? errorMessage(syncMutation.error) : null) ||
    (settingsQuery.isError ? errorMessage(settingsQuery.error) : null);

  const lastSyncedSha = settingsQuery.data?.lastSyncedSha;
  const hasSavedRepo = Boolean(settingsQuery.data?.repoUrl);
  const hasPages = (pagesQuery.data?.pages.length ?? 0) > 0;
  const hint = operationHint({
    status,
    mutationError: actionError,
    hasSavedRepo,
    finished,
  });

  const opButtonLabel = (op: CorpusOperation, idle: string) =>
    running && status?.operation === op ? `${stageLabel(status.stage)}…` : idle;

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
              placeholder="repo root if empty"
              disabled={busy}
              {...form.register("docsRoot")}
            />
          </label>
          <p className="m-0 font-mono text-muted text-xs">
            Last synced SHA: {lastSyncedSha ?? "none"}
          </p>
          {hint ? <p className={hintClass(hint.tone)}>{hint.text}</p> : null}
          {saveMutation.isSuccess ? (
            <p className="m-0 text-ok text-sm">Saved.</p>
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
              {opButtonLabel("clone", "Clone")}
            </button>
            <button
              type="button"
              className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasSavedRepo}
              onClick={() => pullMutation.mutate()}
            >
              {opButtonLabel("pull", "Pull")}
            </button>
            <button
              type="button"
              className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasPages}
              onClick={() => chunkifyMutation.mutate()}
            >
              {opButtonLabel("chunkify", "Chunkify")}
            </button>
            <button
              type="button"
              className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasPages}
              onClick={() => embedMutation.mutate()}
            >
              {opButtonLabel("embed", "Embed")}
            </button>
            <button
              type="button"
              className="rounded border border-accent bg-transparent px-3.5 py-1.5 text-accent text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !hasSavedRepo}
              onClick={() => syncMutation.mutate()}
            >
              {opButtonLabel("sync", "Sync")}
            </button>
          </div>
          {!running ? (
            <p className="m-0 text-muted text-xs">
              Sync clones if needed, then ingests, chunkifies, and embeds. Clone
              and Pull only update the git checkout. Chunkify re-chunks all
              pages; Embed fills stale embeddings.
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  getEmbedSettings,
  putEmbedSettings,
  UserQueryKey,
} from "@/lib/api";

const embedSchema = z.object({
  provider: z.string(),
  embeddingModel: z.string(),
  host: z.string(),
  port: z.string(),
  apiKey: z.string(),
});

type EmbedValues = z.infer<typeof embedSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function blankToNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

function parsePort(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function EmbedSettingsBlock({ actorApiKey }: { actorApiKey: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.EmbedSettings,
    queryFn: () => getEmbedSettings(actorApiKey),
  });

  const form = useForm<EmbedValues>({
    resolver: zodResolver(embedSchema),
    defaultValues: {
      provider: "",
      embeddingModel: "",
      host: "",
      port: "",
      apiKey: "",
    },
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    form.reset({
      provider: data.provider,
      embeddingModel: data.embeddingModel,
      host: data.host,
      port: String(data.port),
      apiKey: data.apiKey ?? "",
    });
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: EmbedValues) =>
      putEmbedSettings({
        apiKey: actorApiKey,
        settings: {
          provider: blankToNull(values.provider),
          embeddingModel: blankToNull(values.embeddingModel),
          host: blankToNull(values.host),
          port: parsePort(values.port),
          apiKey: blankToNull(values.apiKey),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.EmbedSettings,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      putEmbedSettings({
        apiKey: actorApiKey,
        settings: {
          provider: null,
          embeddingModel: null,
          host: null,
          port: null,
          apiKey: null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.EmbedSettings,
      });
    },
  });

  const busy =
    settingsQuery.isFetching ||
    saveMutation.isPending ||
    resetMutation.isPending ||
    form.formState.isSubmitting;

  const actionError =
    (saveMutation.isError ? errorMessage(saveMutation.error) : null) ||
    (resetMutation.isError ? errorMessage(resetMutation.error) : null) ||
    (settingsQuery.isError ? errorMessage(settingsQuery.error) : null);

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Embedder</h2>
      <p className="m-0 text-muted text-sm">
        Ollama connection for child and question embeddings. Empty fields reset
        to app defaults on save.
      </p>

      {settingsQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading embedder settings…</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Provider</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              disabled={busy}
              {...form.register("provider")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Model</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              disabled={busy}
              {...form.register("embeddingModel")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Host</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              disabled={busy}
              {...form.register("host")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Port</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              disabled={busy}
              {...form.register("port")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>API key</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              type="password"
              autoComplete="off"
              disabled={busy}
              {...form.register("apiKey")}
            />
          </label>
          {actionError ? (
            <p className="m-0 text-danger text-sm">{actionError}</p>
          ) : null}
          {saveMutation.isSuccess || resetMutation.isSuccess ? (
            <p className="m-0 text-ok text-sm">Saved.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
            >
              {saveMutation.isPending ? "Saving…" : "Save embedder"}
            </button>
            <button
              type="button"
              className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => resetMutation.mutate()}
            >
              Reset to defaults
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

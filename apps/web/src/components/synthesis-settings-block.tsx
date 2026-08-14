"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  getSynthesisSettings,
  putSynthesisSettings,
  resetSynthesisSettings,
  UserQueryKey,
} from "@/lib/api";

const synthesisSchema = z.object({
  provider: z.string(),
  synthesisModel: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  maxTokens: z.string(),
  contextWindowTokens: z.string(),
});

type SynthesisValues = z.infer<typeof synthesisSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function blankToNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

function parsePositiveInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function SynthesisSettingsBlock({
  actorApiKey,
}: {
  actorApiKey: string;
}) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.SynthesisSettings,
    queryFn: () => getSynthesisSettings(actorApiKey),
  });

  const form = useForm<SynthesisValues>({
    resolver: zodResolver(synthesisSchema),
    defaultValues: {
      provider: "",
      synthesisModel: "",
      baseUrl: "",
      apiKey: "",
      maxTokens: "",
      contextWindowTokens: "",
    },
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    form.reset({
      provider: data.provider ?? "",
      synthesisModel: data.synthesisModel ?? "",
      baseUrl: data.baseUrl ?? "",
      apiKey: data.apiKey ?? "",
      maxTokens: data.maxTokens != null ? String(data.maxTokens) : "",
      contextWindowTokens:
        data.contextWindowTokens != null
          ? String(data.contextWindowTokens)
          : "",
    });
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: SynthesisValues) =>
      putSynthesisSettings({
        apiKey: actorApiKey,
        settings: {
          provider: blankToNull(values.provider),
          synthesisModel: blankToNull(values.synthesisModel),
          baseUrl: blankToNull(values.baseUrl),
          apiKey: blankToNull(values.apiKey),
          maxTokens: parsePositiveInt(values.maxTokens),
          contextWindowTokens: parsePositiveInt(values.contextWindowTokens),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.SynthesisSettings,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetSynthesisSettings(actorApiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.SynthesisSettings,
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

  const placeholders = settingsQuery.data?.defaults;

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Synthesis</h2>
      <p className="m-0 text-muted text-sm">
        Ask answer provider. Empty fields use app defaults at runtime. Context
        window is required for non-default models.
      </p>

      {settingsQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading synthesis settings…</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Provider</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder={placeholders?.provider}
              disabled={busy}
              {...form.register("provider")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Model</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder={placeholders?.synthesisModel}
              disabled={busy}
              {...form.register("synthesisModel")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Base URL</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              placeholder={placeholders?.baseUrl}
              disabled={busy}
              {...form.register("baseUrl")}
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Max tokens</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders ? String(placeholders.maxTokens) : undefined
              }
              disabled={busy}
              {...form.register("maxTokens")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Context window tokens</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders
                  ? String(placeholders.contextWindowTokens)
                  : undefined
              }
              disabled={busy}
              {...form.register("contextWindowTokens")}
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
              {saveMutation.isPending ? "Saving…" : "Save synthesis"}
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

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  getRetrieveSettings,
  putRetrieveSettings,
  resetRetrieveSettings,
  UserQueryKey,
} from "@/lib/api";

const retrieveSchema = z.object({
  childLimit: z.string(),
  maxParents: z.string(),
  maxCharacters: z.string(),
});

type RetrieveValues = z.infer<typeof retrieveSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function parsePositiveInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function RetrieveSettingsBlock({
  actorApiKey,
}: {
  actorApiKey: string;
}) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.RetrieveSettings,
    queryFn: () => getRetrieveSettings(actorApiKey),
  });

  const form = useForm<RetrieveValues>({
    resolver: zodResolver(retrieveSchema),
    defaultValues: {
      childLimit: "",
      maxParents: "",
      maxCharacters: "",
    },
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    form.reset({
      childLimit: data.childLimit != null ? String(data.childLimit) : "",
      maxParents: data.maxParents != null ? String(data.maxParents) : "",
      maxCharacters:
        data.maxCharacters != null ? String(data.maxCharacters) : "",
    });
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: RetrieveValues) =>
      putRetrieveSettings({
        apiKey: actorApiKey,
        settings: {
          childLimit: parsePositiveInt(values.childLimit),
          maxParents: parsePositiveInt(values.maxParents),
          maxCharacters: parsePositiveInt(values.maxCharacters),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.RetrieveSettings,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetRetrieveSettings(actorApiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.RetrieveSettings,
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
      <h2 className="m-0 font-display text-ink text-lg">Retrieve</h2>
      <p className="m-0 text-muted text-sm">
        Knobs for the Ask-mode KB retrieval pass: top-K child hits from cosine
        search, then dedupe + cap by parent count and total parent text. Empty
        fields use app defaults at runtime.
      </p>

      {settingsQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading retrieve settings…</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Child limit</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders ? String(placeholders.childLimit) : undefined
              }
              disabled={busy}
              {...form.register("childLimit")}
            />
            <span className="text-muted text-xs">
              Top-K child rows from the vector distance scan, before deduping by
              parent.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Max parents</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders ? String(placeholders.maxParents) : undefined
              }
              disabled={busy}
              {...form.register("maxParents")}
            />
            <span className="text-muted text-xs">
              Max unique parents included in the LLM context.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Max characters (parent text)</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders ? String(placeholders.maxCharacters) : undefined
              }
              disabled={busy}
              {...form.register("maxCharacters")}
            />
            <span className="text-muted text-xs">
              Hard cap on total parent-text characters (truncates after this).
            </span>
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
              {saveMutation.isPending ? "Saving…" : "Save retrieve settings"}
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

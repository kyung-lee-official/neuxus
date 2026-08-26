"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  getLogSettings,
  type LogSink,
  purgeLogSettings,
  putLogSettings,
  resetLogSettings,
  UserQueryKey,
} from "@/lib/api";
import { Modal } from "./modal";

const logSchema = z.object({
  console: z.boolean(),
  postgres: z.boolean(),
  queueSize: z.string(),
  drainTimeoutMs: z.string(),
  pretty: z.boolean(),
});

type LogValues = z.infer<typeof logSchema>;

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

function sinksFromForm(values: LogValues): readonly LogSink[] | null {
  const sinks: LogSink[] = [];
  if (values.console) sinks.push("console");
  if (values.postgres) sinks.push("postgres");
  return sinks.length > 0 ? sinks : null;
}

export function LogSettingsBlock({ actorApiKey }: { actorApiKey: string }) {
  const queryClient = useQueryClient();
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    deleted: number;
  } | null>(null);
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.LogSettings,
    queryFn: () => getLogSettings(actorApiKey),
  });

  const form = useForm<LogValues>({
    resolver: zodResolver(logSchema),
    defaultValues: {
      console: true,
      postgres: false,
      queueSize: "",
      drainTimeoutMs: "",
      pretty: false,
    },
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    form.reset({
      console: data.sinks.includes("console"),
      postgres: data.sinks.includes("postgres"),
      queueSize: data.queueSize != null ? String(data.queueSize) : "",
      drainTimeoutMs:
        data.drainTimeoutMs != null ? String(data.drainTimeoutMs) : "",
      pretty: data.pretty ?? false,
    });
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: LogValues) =>
      putLogSettings({
        apiKey: actorApiKey,
        settings: {
          sinks: sinksFromForm(values),
          queueSize: parsePositiveInt(values.queueSize),
          drainTimeoutMs: parsePositiveInt(values.drainTimeoutMs),
          pretty: values.pretty,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.LogSettings,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetLogSettings(actorApiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.LogSettings,
      });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: () => purgeLogSettings(actorApiKey),
    onSuccess: (result) => {
      setPurgeConfirmOpen(false);
      setPurgeResult({ deleted: result.deleted });
    },
  });

  const busy =
    settingsQuery.isFetching ||
    saveMutation.isPending ||
    resetMutation.isPending ||
    purgeMutation.isPending ||
    form.formState.isSubmitting;

  const actionError =
    (saveMutation.isError ? errorMessage(saveMutation.error) : null) ||
    (resetMutation.isError ? errorMessage(resetMutation.error) : null) ||
    (purgeMutation.isError ? errorMessage(purgeMutation.error) : null) ||
    (settingsQuery.isError ? errorMessage(settingsQuery.error) : null);

  const placeholders = settingsQuery.data?.defaults;
  const defaultSinks = useMemo(
    () => new Set(placeholders?.sinks ?? []),
    [placeholders],
  );

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Logger</h2>
      <p className="m-0 text-muted text-sm">
        Runtime config for the structured logger. Empty fields use app defaults
        at runtime. Changes apply to new log records only — the process must be
        restarted to apply a new queue capacity.
      </p>

      {settingsQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading log settings…</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        >
          <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
            <legend className="px-1 text-sm">Sinks</legend>
            <p className="m-0 text-muted text-xs">
              Defaults:{" "}
              {Array.from(defaultSinks).length > 0
                ? Array.from(defaultSinks).join(", ")
                : "—"}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={busy}
                {...form.register("console")}
              />
              <span>
                <code className="font-mono text-xs">console</code> — stdout
                (always available)
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={busy}
                {...form.register("postgres")}
              />
              <span>
                <code className="font-mono text-xs">postgres</code> — INSERT
                rows into <code className="font-mono text-xs">app_log</code>
              </span>
            </label>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Queue size</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders ? String(placeholders.queueSize) : undefined
              }
              disabled={busy}
              {...form.register("queueSize")}
            />
            <span className="text-muted text-xs">
              Bounded queue capacity for the postgres sink. Records past the cap
              are dropped (oldest first).
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Drain timeout (ms)</span>
            <input
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              inputMode="numeric"
              placeholder={
                placeholders ? String(placeholders.drainTimeoutMs) : undefined
              }
              disabled={busy}
              {...form.register("drainTimeoutMs")}
            />
            <span className="text-muted text-xs">
              Budget for draining the queue on shutdown / SIGTERM.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy}
              {...form.register("pretty")}
            />
            <span>Pretty stdout (pino-pretty)</span>
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
              {saveMutation.isPending ? "Saving…" : "Save log settings"}
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

      <div className="mt-2 flex flex-col gap-2 border-line border-t pt-3">
        <h3 className="m-0 font-display text-base text-danger">Danger zone</h3>
        <p className="m-0 text-muted text-sm">
          Drop every row currently in{" "}
          <code className="font-mono text-xs">app_log</code>. Configuration is
          untouched.
        </p>
        {purgeMutation.isError ? (
          <p className="m-0 text-danger text-sm">{actionError}</p>
        ) : null}
        <button
          type="button"
          className="self-start rounded border border-danger bg-transparent px-3.5 py-2 text-danger text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={() => setPurgeConfirmOpen(true)}
        >
          Delete all logs
        </button>
      </div>

      <Modal
        open={purgeConfirmOpen}
        title="Delete all logs?"
        titleId="purge-logs-dialog-title"
        onClose={() => {
          if (!purgeMutation.isPending) setPurgeConfirmOpen(false);
        }}
        closeDisabled={purgeMutation.isPending}
      >
        <p className="m-0 text-ink text-sm">
          Delete every row in <code className="font-mono text-xs">app_log</code>
          ?
        </p>
        <p className="mt-2 mb-0 text-muted text-sm">
          This cannot be undone. Log configuration (sinks, queue size, drain
          timeout, pretty) is not affected.
        </p>
        {purgeMutation.isError ? (
          <p className="mt-3 mb-0 text-danger text-sm">
            {errorMessage(purgeMutation.error)}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-line bg-transparent px-3.5 py-2 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={purgeMutation.isPending}
            onClick={() => setPurgeConfirmOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded border border-danger bg-danger px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={purgeMutation.isPending}
            onClick={() => purgeMutation.mutate()}
          >
            {purgeMutation.isPending ? "Deleting…" : "Delete all logs"}
          </button>
        </div>
      </Modal>

      <Modal
        open={purgeResult !== null}
        title="Logs deleted"
        titleId="purge-logs-result-dialog-title"
        onClose={() => setPurgeResult(null)}
      >
        <p className="m-0 text-ink text-sm">
          Deleted <strong>{purgeResult?.deleted ?? 0}</strong> log{" "}
          {purgeResult?.deleted === 1 ? "row" : "rows"} from{" "}
          <code className="font-mono text-xs">app_log</code>.
        </p>
        <p className="mt-2 mb-0 text-muted text-sm">
          Log configuration is unchanged. New records will be written according
          to the active sinks.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white"
            onClick={() => setPurgeResult(null)}
          >
            Close
          </button>
        </div>
      </Modal>
    </section>
  );
}

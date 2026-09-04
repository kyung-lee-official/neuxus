"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getModelConfig,
  type ModelConfig,
  type ModelConnection,
  type ModelInfo,
  type ProviderInfo,
  putModelConfig,
  UserQueryKey,
} from "@/lib/api";
import { useAdminUser } from "./admin-shell";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Mirrors `isFullyConfigured` in `shared/models/config.ts`. */
function checkConfigured(
  conn: ModelConnection,
  provider: ProviderInfo,
): { ok: true } | { ok: false; missing: string } {
  for (const field of provider.userInputs) {
    if (field === "apiKey" && !conn.apiKey)
      return { ok: false, missing: "api key" };
    if (field === "baseUrl" && !conn.baseUrl)
      return { ok: false, missing: "base URL" };
    if (field === "port" && !conn.port) return { ok: false, missing: "port" };
  }
  return { ok: true };
}

const CAPABILITY_LABEL = {
  embedding: "Embedding",
  llm: "LLM",
  vision: "Vision",
} as const;

export function ProvidersConfigPanel() {
  const user = useAdminUser();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getModelConfig(user.apiKey),
  });

  const providers = configQuery.data?.providers ?? [];
  const models = configQuery.data?.models ?? [];
  const config = configQuery.data?.config;

  const providerById = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers],
  );

  const saveMutation = useMutation({
    mutationFn: (patch: {
      connections?: Record<string, ModelConnection | null>;
    }) => putModelConfig({ apiKey: user.apiKey, patch }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.ModelConfig,
      });
    },
  });

  function persist(modelId: string, next: ModelConnection | null) {
    saveMutation.mutate({
      connections: { [modelId]: next },
    });
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Providers</h1>
        <p className="m-0 text-muted text-sm">
          Configure connection settings for each catalog model. Tasks on the
          Server settings page only see fully-configured models — finish each
          row's required fields to make it available in the task dropdowns.
        </p>
      </section>

      {configQuery.isLoading || !config ? (
        <p className="m-0 text-muted text-sm">Loading providers…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {models.map((m) => {
            const provider = providerById.get(m.providerId);
            if (!provider) return null;
            return (
              <ProviderModelRow
                key={m.id}
                model={m}
                provider={provider}
                connection={config.connections[m.id]}
                isTaskActive={isModelUsedByAnyTask(config, m.id)}
                busy={saveMutation.isPending}
                onChange={(next) => persist(m.id, next)}
              />
            );
          })}
          {saveMutation.isError ? (
            <p className="m-0 text-danger text-sm">
              {errorMessage(saveMutation.error)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function isModelUsedByAnyTask(config: ModelConfig, modelId: string): boolean {
  return Object.values(config.tasks).some((id) => id === modelId);
}

function ProviderModelRow({
  model,
  provider,
  connection,
  isTaskActive,
  busy,
  onChange,
}: {
  model: ModelInfo;
  provider: ProviderInfo;
  connection: ModelConnection | undefined;
  isTaskActive: boolean;
  busy: boolean;
  onChange: (next: ModelConnection | null) => void;
}) {
  // `local` is what the server currently holds (or the empty default).
  // Memoize so the reference is stable between refetches — otherwise the
  // useEffect below would fire on every render and call setDraft, looping.
  const local = useMemo<ModelConnection>(
    () => connection ?? { apiKey: null, baseUrl: null, port: null },
    [connection],
  );
  const [draft, setDraft] = useState<ModelConnection>(local);
  const dirty = !sameConnection(draft, local);

  // Refresh draft when the persisted connection changes (after a save
  // refetches). Keyed by `connection` (not `local`) so the effect only
  // fires when the row's data actually changes.
  useEffect(() => {
    setDraft(connection ?? { apiKey: null, baseUrl: null, port: null });
  }, [connection]);

  const check = checkConfigured(draft, provider);
  const fullyConfigured = check.ok;

  const capabilityTags = (
    Object.entries(model.capabilities) as Array<
      [keyof typeof CAPABILITY_LABEL, true | undefined]
    >
  )
    .filter(([, v]) => v === true)
    .map(([k]) => CAPABILITY_LABEL[k]);

  function save() {
    onChange(draft);
    // Saving even when not fully-configured: server accepts partial entries
    // (they just stay out of task dropdowns until filled).
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 font-display text-ink text-lg">
            {model.displayName}
          </h2>
          <p className="m-0 text-muted text-xs">
            <span className="font-mono">{model.id}</span>
            {" · "}
            <span>{provider.displayName}</span>
            {" · "}
            <span className="font-mono">{provider.baseUrl}</span>
          </p>
          <p className="m-0 text-muted text-xs">
            Capabilities:{" "}
            {capabilityTags.length > 0 ? capabilityTags.join(", ") : "—"}
            {isTaskActive ? (
              <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                in use
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fullyConfigured ? (
            <span className="rounded bg-ok/15 px-2 py-0.5 font-mono text-ok text-xs">
              fully configured
            </span>
          ) : (
            <span className="rounded bg-warning/15 px-2 py-0.5 font-mono text-warning text-xs">
              missing {check.ok ? "" : check.missing}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {provider.userInputs.includes("apiKey") ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              value={draft.apiKey ?? ""}
              disabled={busy}
              placeholder="Paste your provider API key"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  apiKey: e.target.value === "" ? null : e.target.value,
                })
              }
            />
          </label>
        ) : null}

        {provider.userInputs.includes("baseUrl") ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Base URL</span>
            <input
              type="text"
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              value={draft.baseUrl ?? ""}
              disabled={busy}
              placeholder={provider.baseUrl}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  baseUrl: e.target.value === "" ? null : e.target.value,
                })
              }
            />
          </label>
        ) : null}

        {provider.userInputs.includes("port") ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Port</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              value={draft.port ?? ""}
              disabled={busy}
              placeholder="11434"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setDraft({ ...draft, port: null });
                  return;
                }
                const n = Number.parseInt(raw, 10);
                setDraft({
                  ...draft,
                  port: Number.isInteger(n) && n > 0 && n <= 65535 ? n : null,
                });
              }}
            />
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy || !dirty}
          onClick={save}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {local.apiKey || local.baseUrl || local.port ? (
          <button
            type="button"
            className="rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => onChange(null)}
          >
            Delete connection
          </button>
        ) : null}
        {dirty ? (
          <span className="text-muted text-xs">unsaved changes</span>
        ) : null}
      </div>
    </section>
  );
}

function sameConnection(a: ModelConnection, b: ModelConnection): boolean {
  return (
    (a.apiKey ?? null) === (b.apiKey ?? null) &&
    (a.baseUrl ?? null) === (b.baseUrl ?? null) &&
    (a.port ?? null) === (b.port ?? null)
  );
}

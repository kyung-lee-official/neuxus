"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type EmbedTestResult,
  getModelConfig,
  type ModelConfig,
  type ModelInfo,
  type ProviderConnection,
  type ProviderInfo,
  putModelConfig,
  testEmbed,
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
  conn: ProviderConnection,
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

/**
 * `/server-settings/providers/[providerId]` — edit the connection for
 * `providerId` and read-only list the catalog models that resolve to it.
 *
 * Connection settings are provider-level: every model under this
 * provider shares the same key, base URL, and port. Configuring the
 * provider once enables every model that points at it.
 */
export function ProviderModelsPanel({ providerId }: { providerId: string }) {
  const user = useAdminUser();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getModelConfig(user.apiKey),
  });

  const providers = configQuery.data?.providers ?? [];
  const provider = providers.find((p) => p.id === providerId);
  const allModels = configQuery.data?.models ?? [];
  const models = useMemo(
    () => allModels.filter((m) => m.providerId === providerId),
    [allModels, providerId],
  );
  const config = configQuery.data?.config;

  const saveMutation = useMutation({
    mutationFn: (patch: {
      providerConnections?: Record<string, ProviderConnection | null>;
    }) => putModelConfig({ apiKey: user.apiKey, patch }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.ModelConfig,
      });
    },
  });

  function persist(providerId: string, next: ProviderConnection | null) {
    saveMutation.mutate({
      providerConnections: { [providerId]: next },
    });
  }

  // Loading state — wait until the catalog arrives so we can decide
  // whether `providerId` is valid before showing the "not found" UI.
  if (configQuery.isLoading) {
    return <p className="m-0 text-muted text-sm">Loading provider…</p>;
  }

  if (!provider) {
    return (
      <div className="flex w-full flex-col gap-4">
        <Breadcrumb providerLabel={providerId} />
        <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
          <h1 className="m-0 font-display text-2xl text-ink">
            Provider not found
          </h1>
          <p className="m-0 text-muted text-sm">
            No provider with id <span className="font-mono">{providerId}</span>{" "}
            in the catalog.
          </p>
          <Link
            href="/server-settings/providers"
            className="self-start rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm no-underline hover:border-accent"
          >
            ← Back to providers
          </Link>
        </section>
      </div>
    );
  }

  // The per-model "Test embed" runs against the *saved* provider
  // connection, so it only makes sense once a fully-configured
  // connection for this provider is persisted (the card above may hold
  // an unsaved draft).
  const savedConnection = config?.providerConnections[provider.id];
  const canTestEmbed = Boolean(
    config && savedConnection && checkConfigured(savedConnection, provider).ok,
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <Breadcrumb providerLabel={provider.displayName} />

      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">
          {provider.displayName}
        </h1>
        <p className="m-0 text-muted text-xs">
          <span className="font-mono">{provider.id}</span>
          {" · "}
          <span className="font-mono">{provider.baseUrl}</span>
          {" · "}
          <span>{describeRequestShape(provider.requestShape)}</span>
        </p>
        <p className="m-0 text-muted text-sm">
          Connection settings apply to every model under this provider. Save
          once; fully-configured models become selectable on the Server settings
          page.
        </p>
      </section>

      <ProviderConnectionCard
        provider={provider}
        connection={config?.providerConnections[provider.id]}
        busy={saveMutation.isPending}
        onChange={(next) => persist(provider.id, next)}
      />

      {models.length === 0 ? (
        <section className="rounded-md border border-line bg-surface p-6 text-muted text-sm">
          No models are catalogued under this provider.
        </section>
      ) : (
        <ModelsUnderProvider
          config={config}
          models={models}
          canTestEmbed={canTestEmbed}
        />
      )}

      {saveMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(saveMutation.error)}
        </p>
      ) : null}
    </div>
  );
}

function ProviderConnectionCard({
  provider,
  connection,
  busy,
  onChange,
}: {
  provider: ProviderInfo;
  connection: ProviderConnection | undefined;
  busy: boolean;
  onChange: (next: ProviderConnection | null) => void;
}) {
  // `local` is what the server currently holds (or the empty default).
  // Memoize so the reference is stable between refetches — otherwise the
  // useEffect below would fire on every render and call setDraft, looping.
  const local = useMemo<ProviderConnection>(
    () => connection ?? { apiKey: null, baseUrl: null, port: null },
    [connection],
  );
  const [draft, setDraft] = useState<ProviderConnection>(local);
  const dirty = !sameConnection(draft, local);

  // Refresh draft when the persisted connection changes (after a save
  // refetches). Keyed by `connection` (not `local`) so the effect only
  // fires when the row's data actually changes.
  useEffect(() => {
    setDraft(connection ?? { apiKey: null, baseUrl: null, port: null });
  }, [connection]);

  const check = checkConfigured(draft, provider);
  const fullyConfigured = check.ok;

  const hostPlaceholder = hostFromUrl(provider.baseUrl) || "127.0.0.1";

  function save() {
    onChange(draft);
    // Saving even when not fully-configured: server accepts partial entries
    // (the provider just stays out of task dropdowns until filled).
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-ink text-lg">Connection</h2>
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
            <span>Host</span>
            <input
              type="text"
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              value={draft.baseUrl ?? ""}
              disabled={busy}
              placeholder={hostPlaceholder}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  baseUrl: e.target.value === "" ? null : e.target.value,
                })
              }
            />
            <span className="text-muted text-xs">
              Hostname or IP, e.g.{" "}
              <span className="font-mono">{hostPlaceholder}</span>. Scheme and
              port come from the URL field below + the Port field.
            </span>
          </label>
        ) : null}

        {provider.userInputs.includes("port") ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Port</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
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

function ModelsUnderProvider({
  config,
  models,
  canTestEmbed,
}: {
  config: ModelConfig | undefined;
  models: ModelInfo[];
  canTestEmbed: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Models</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {models.map((m) => {
          const capabilityTags = (
            Object.entries(m.capabilities) as Array<
              [keyof typeof CAPABILITY_LABEL, true | undefined]
            >
          )
            .filter(([, v]) => v === true)
            .map(([k]) => CAPABILITY_LABEL[k]);
          const inUse = config
            ? Object.values(config.tasks).some((id) => id === m.id)
            : false;
          return (
            <ModelRow
              key={m.id}
              model={m}
              capabilityTags={capabilityTags}
              inUse={inUse}
              canTestEmbed={canTestEmbed}
            />
          );
        })}
      </ul>
    </section>
  );
}

function ModelRow({
  model,
  capabilityTags,
  inUse,
  canTestEmbed,
}: {
  model: ModelInfo;
  capabilityTags: string[];
  inUse: boolean;
  canTestEmbed: boolean;
}) {
  const user = useAdminUser();
  const mutation = useMutation({
    mutationFn: () => testEmbed(user.apiKey, model.id),
  });
  const supportsEmbed = model.capabilities.embedding === true;

  return (
    <li className="flex flex-col gap-2 rounded border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="m-0 font-display text-ink text-sm">
            {model.displayName}
          </p>
          <p className="m-0 font-mono text-muted text-xs">{model.id}</p>
          <p className="m-0 text-muted text-xs">
            Capabilities:{" "}
            {capabilityTags.length > 0 ? capabilityTags.join(", ") : "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {supportsEmbed ? (
            <button
              type="button"
              className="rounded border border-accent bg-accent px-3 py-1 text-white text-xs disabled:cursor-not-allowed disabled:opacity-60"
              disabled={mutation.isPending || !canTestEmbed}
              title={
                canTestEmbed
                  ? "Embed a diagnostic string with this model"
                  : "Save a fully-configured connection above to test this model"
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Embedding…" : "Test embed"}
            </button>
          ) : null}
          {inUse ? (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent text-xs">
              in use
            </span>
          ) : null}
        </div>
      </div>
      {supportsEmbed && !canTestEmbed ? (
        <p className="m-0 text-muted text-xs">
          Save a fully-configured connection above to test this model.
        </p>
      ) : null}
      {supportsEmbed ? <EmbedTestPanel mutation={mutation} /> : null}
    </li>
  );
}

function EmbedTestPanel({
  mutation,
}: {
  mutation: ReturnType<typeof useMutation<EmbedTestResult, Error>>;
}) {
  if (mutation.isPending) {
    return (
      <p className="m-0 text-muted text-xs">Embedding the diagnostic string…</p>
    );
  }
  if (mutation.isError) {
    return (
      <p className="m-0 text-danger text-xs">
        {mutation.error instanceof Error
          ? mutation.error.message
          : String(mutation.error)}
      </p>
    );
  }
  if (!mutation.data) return null;
  const { embedding, modelId, dim, inputText } = mutation.data;
  const previewCount = Math.min(8, embedding.length);
  const preview = embedding.slice(0, previewCount).map((v) => v.toFixed(4));
  return (
    <div className="flex flex-col gap-1 rounded border border-line bg-surface p-2 text-xs">
      <p className="m-0 text-muted">
        Embedded{" "}
        <span className="font-mono text-ink">&ldquo;{inputText}&rdquo;</span>{" "}
        via <span className="font-mono text-ink">{modelId}</span>
      </p>
      <p className="m-0 text-muted">
        Dim <span className="font-mono text-ink">{dim}</span> · first{" "}
        {previewCount} values:{" "}
        <span className="break-all font-mono text-ink">
          [{preview.join(", ")}
          {embedding.length > previewCount ? ", …" : ""}]
        </span>
      </p>
    </div>
  );
}

function Breadcrumb({ providerLabel }: { providerLabel: string }) {
  return (
    <nav className="flex items-center gap-1 text-muted text-sm">
      <Link
        href="/server-settings/providers"
        className="text-accent no-underline hover:underline"
      >
        Providers
      </Link>
      <span>/</span>
      <span className="text-ink">{providerLabel}</span>
    </nav>
  );
}

function describeRequestShape(shape: ProviderInfo["requestShape"]): string {
  switch (shape) {
    case "anthropic-messages":
      return "Anthropic-compatible Messages";
    case "openai-embeddings":
      return "OpenAI-compatible embeddings";
    case "ollama-embed":
      return "Ollama /api/embed";
  }
}

/** Pull just the hostname out of a base URL for placeholder display. */
function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function sameConnection(a: ProviderConnection, b: ProviderConnection): boolean {
  return (
    (a.apiKey ?? null) === (b.apiKey ?? null) &&
    (a.baseUrl ?? null) === (b.baseUrl ?? null) &&
    (a.port ?? null) === (b.port ?? null)
  );
}

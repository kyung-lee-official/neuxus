"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getProviderConnection,
  getProviders,
  getTaskModelMap,
  type ModelInfo,
  type ProviderConnection,
  type ProviderInfo,
  putProviderConnection,
  UserQueryKey,
} from "@/lib/api";
import { useAdminUser } from "./admin-shell";
import {
  EmbeddingTester,
  ImageChatTester,
  TextChatTester,
} from "./model-testers";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Connection fields per provider id (mirrors the server's provider schema). */
function connectionFields(providerId: string): string[] {
  return providerId === "ollama" ? ["baseUrl", "port"] : ["apiKey"];
}

const FIELD_LABEL: Record<string, string> = {
  apiKey: "API key",
  baseUrl: "Base URL",
  port: "Port",
};

/**
 * `/server-settings/providers/[providerId]` — edit the connection for
 * `providerId` and list the catalog models it serves.
 */
export function ProviderModelsPanel({ providerId }: { providerId: string }) {
  const user = useAdminUser();
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getProviders(user.apiKey),
  });
  const tasksQuery = useQuery({
    queryKey: UserQueryKey.TaskModelMap,
    queryFn: () => getTaskModelMap(user.apiKey),
  });
  const connectionQuery = useQuery({
    queryKey: ["server-setting", "provider-connection", providerId],
    queryFn: () => getProviderConnection(user.apiKey, providerId),
  });

  const providers = providersQuery.data?.providers ?? [];
  const provider = providers.find((p) => p.id === providerId);
  const models = provider?.models ?? [];
  const connection = connectionQuery.data?.connection ?? null;

  const assigned = useMemo(
    () => new Set(Object.values(tasksQuery.data?.tasks ?? {}).filter(Boolean)),
    [tasksQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: (next: ProviderConnection) =>
      putProviderConnection({
        apiKey: user.apiKey,
        providerId,
        connection: next,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["server-setting", "provider-connection", providerId],
      });
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.ModelConfig,
      });
    },
  });

  if (providersQuery.isLoading) {
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

  return (
    <div className="flex w-full flex-col gap-4">
      <Breadcrumb providerLabel={provider.displayName} />

      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">
          {provider.displayName}
        </h1>
        <p className="m-0 text-muted text-xs">
          <span className="font-mono">{provider.id}</span>
          {provider.baseUrl ? (
            <>
              {" · "}
              <span className="font-mono">{provider.baseUrl}</span>
            </>
          ) : null}
        </p>
      </section>

      <ProviderConnectionCard
        provider={provider}
        connection={connection}
        busy={saveMutation.isPending}
        onSave={(next) => saveMutation.mutate(next)}
      />

      {models.length === 0 ? (
        <section className="rounded-md border border-line bg-surface p-6 text-muted text-sm">
          No models are catalogued under this provider.
        </section>
      ) : (
        <ModelsUnderProvider
          providerId={provider.id}
          models={models}
          assigned={assigned}
          canTest={Boolean(connection)}
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
  onSave,
}: {
  provider: ProviderInfo;
  connection: ProviderConnection | null;
  busy: boolean;
  onSave: (next: ProviderConnection) => void;
}) {
  const fields = connectionFields(provider.id);
  const [draft, setDraft] = useState<ProviderConnection>(connection ?? {});
  const dirty = JSON.stringify(draft) !== JSON.stringify(connection ?? {});

  useEffect(() => {
    setDraft(connection ?? {});
  }, [connection]);

  const fullyConfigured = fields.every((field) => {
    const value = draft[field];
    return value !== null && value !== undefined && value !== "";
  });

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-ink text-lg">Connection</h2>
        {fullyConfigured ? (
          <span className="rounded bg-ok/15 px-2 py-0.5 font-mono text-ok text-xs">
            fully configured
          </span>
        ) : (
          <span className="rounded bg-warning/15 px-2 py-0.5 font-mono text-warning text-xs">
            incomplete
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <label key={field} className="flex flex-col gap-1.5 text-sm">
            <span>{FIELD_LABEL[field] ?? field}</span>
            <input
              type={field === "apiKey" ? "password" : "text"}
              autoComplete="off"
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              value={String(draft[field] ?? "")}
              disabled={busy}
              onChange={(e) => {
                const raw = e.target.value;
                setDraft({
                  ...draft,
                  [field]:
                    raw === "" ? null : field === "port" ? Number(raw) : raw,
                });
              }}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy || !dirty}
          onClick={() => onSave(draft)}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {dirty ? (
          <span className="text-muted text-xs">unsaved changes</span>
        ) : null}
      </div>
    </section>
  );
}

function ModelsUnderProvider({
  providerId,
  models,
  assigned,
  canTest,
}: {
  providerId: string;
  models: ModelInfo[];
  assigned: Set<string | null>;
  canTest: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Models</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {models.map((model) => (
          <ModelRow
            key={model.identifier}
            providerId={providerId}
            model={model}
            inUse={assigned.has(model.identifier)}
            canTest={canTest}
          />
        ))}
      </ul>
    </section>
  );
}

const CAPABILITY_LABEL = {
  embedding: "Embedding",
  text: "Text",
  vision: "Vision",
} as const;

function ModelRow({
  providerId,
  model,
  inUse,
  canTest,
}: {
  providerId: string;
  model: ModelInfo;
  inUse: boolean;
  canTest: boolean;
}) {
  const user = useAdminUser();

  return (
    <li className="flex flex-col gap-3 rounded border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="m-0 font-display text-ink text-sm">
            {model.displayName}
          </p>
          <p className="m-0 font-mono text-muted text-xs">{model.identifier}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Object.keys(model.capabilities).map((cap) => (
            <span
              key={cap}
              className="rounded bg-line/40 px-1.5 py-0.5 font-mono text-muted text-xs"
            >
              {CAPABILITY_LABEL[cap as keyof typeof CAPABILITY_LABEL] ?? cap}
            </span>
          ))}
          {inUse ? (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent text-xs">
              in use
            </span>
          ) : null}
        </div>
      </div>

      {model.capabilities.embedding ? (
        <EmbeddingTester
          apiKey={user.apiKey}
          providerId={providerId}
          modelId={model.modelId}
          disabled={!canTest}
        />
      ) : null}
      {model.capabilities.text ? (
        <TextChatTester
          apiKey={user.apiKey}
          providerId={providerId}
          modelId={model.modelId}
          disabled={!canTest}
        />
      ) : null}
      {model.capabilities.vision ? (
        <ImageChatTester
          apiKey={user.apiKey}
          providerId={providerId}
          modelId={model.modelId}
          disabled={!canTest}
        />
      ) : null}
    </li>
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

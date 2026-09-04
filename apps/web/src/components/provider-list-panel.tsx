"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import {
  getModelConfig,
  type ModelConfig,
  type ModelInfo,
  type ProviderConnection,
  type ProviderInfo,
  UserQueryKey,
} from "@/lib/api";
import { useAdminUser } from "./admin-shell";

const CAPABILITY_LABEL = {
  embedding: "Embedding",
  llm: "LLM",
  vision: "Vision",
} as const;

function isFullyConfiguredClient(
  conn: ProviderConnection | undefined,
  required: ProviderInfo["userInputs"],
): boolean {
  if (!conn) return false;
  if (required.includes("apiKey") && !conn.apiKey) return false;
  if (required.includes("baseUrl") && !conn.baseUrl) return false;
  if (required.includes("port") && !conn.port) return false;
  return true;
}

/**
 * `/server-settings/providers` — list every catalog provider as a
 * navigation entry. Each row links to `/server-settings/providers/[providerId]`
 * where the user configures that provider's connection. Every model
 * under a fully-configured provider becomes selectable in the task
 * dropdowns on the Server settings page.
 */
export function ProviderListPanel() {
  const user = useAdminUser();

  const configQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getModelConfig(user.apiKey),
  });

  const providers = configQuery.data?.providers ?? [];
  const models = configQuery.data?.models ?? [];
  const config = configQuery.data?.config;

  const rows = useMemo(
    () => buildRows(providers, models, config),
    [providers, models, config],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Providers</h1>
        <p className="m-0 text-muted text-sm">
          Each provider hosts one or more catalog models. Pick a provider to
          configure its connection — fully-configured providers make every model
          under them selectable on the Server settings page.
        </p>
      </section>

      {configQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading providers…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <ProviderRow key={row.provider.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

type ProviderRow = {
  provider: ProviderInfo;
  modelCount: number;
  configured: boolean;
  capabilities: string[];
  anyInUse: boolean;
};

function buildRows(
  providers: ProviderInfo[],
  models: ModelInfo[],
  config: ModelConfig | undefined,
): ProviderRow[] {
  return providers.map((provider) => {
    const providerModels = models.filter((m) => m.providerId === provider.id);
    const conn = config?.providerConnections[provider.id];
    const configured = isFullyConfiguredClient(conn, provider.userInputs);

    let anyInUse = false;
    if (config) {
      for (const m of providerModels) {
        for (const id of Object.values(config.tasks)) {
          if (id === m.id) {
            anyInUse = true;
            break;
          }
        }
        if (anyInUse) break;
      }
    }

    const caps = new Set<string>();
    for (const m of providerModels) {
      for (const k of Object.keys(m.capabilities) as Array<
        keyof typeof CAPABILITY_LABEL
      >) {
        if (m.capabilities[k] === true) caps.add(CAPABILITY_LABEL[k]);
      }
    }
    return {
      provider,
      modelCount: providerModels.length,
      configured,
      capabilities: Array.from(caps),
      anyInUse,
    };
  });
}

function ProviderRow({ row }: { row: ProviderRow }) {
  const { provider, modelCount, configured, capabilities, anyInUse } = row;
  return (
    <Link
      href={`/server-settings/providers/${encodeURIComponent(provider.id)}`}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 no-underline hover:border-accent"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 font-display text-ink text-lg">
            {provider.displayName}
          </h2>
          <p className="m-0 text-muted text-xs">
            <span className="font-mono">{provider.id}</span>
            {" · "}
            <span className="font-mono">{provider.baseUrl}</span>
          </p>
          <p className="m-0 text-muted text-xs">
            Capabilities:{" "}
            {capabilities.length > 0 ? capabilities.join(", ") : "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {anyInUse ? (
            <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-accent text-xs">
              in use
            </span>
          ) : null}
          {modelCount === 0 ? (
            <span className="rounded bg-line px-2 py-0.5 font-mono text-muted text-xs">
              no models
            </span>
          ) : configured ? (
            <span className="rounded bg-ok/15 px-2 py-0.5 font-mono text-ok text-xs">
              configured · {modelCount} model{modelCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="rounded bg-warning/15 px-2 py-0.5 font-mono text-warning text-xs">
              not configured · {modelCount} model{modelCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

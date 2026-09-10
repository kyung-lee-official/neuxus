"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import {
  ApiError,
  getProviderConnections,
  getProviders,
  getTaskModelMap,
  type ModelCapability,
  type ModelInfo,
  type ProviderConnection,
  type ProviderInfo,
  putTaskModelMap,
  type TaskId,
  type TaskLinks,
  UserQueryKey,
} from "@/lib/api";
import { useAdminUser } from "./admin-shell";

type Scenario = TaskId;

const TASK_IDS: readonly TaskId[] = [
  "embedding",
  "text-synthesis",
  "md-image-captioning",
];

const SCENARIO_META: Record<
  Scenario,
  {
    title: string;
    description: string;
    requiredCapabilities: ModelCapability[];
  }
> = {
  embedding: {
    title: "Embedding",
    description:
      "Vector model that turns knowledge-base children and user questions into vectors for cosine search.",
    requiredCapabilities: ["embedding"],
  },
  "text-synthesis": {
    title: "Text synthesis",
    description:
      "Model that answers Ask queries from retrieved knowledge-base parents and chat history.",
    requiredCapabilities: ["text"],
  },
  "md-image-captioning": {
    title: "Markdown image captioning",
    description:
      "Model that generates one-sentence descriptions for `![…](…)` images in ingested pages.",
    requiredCapabilities: ["text", "vision"],
  },
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Required connection fields per provider id (mirrors the server's provider schema). */
function isConfigured(
  conn: ProviderConnection | null | undefined,
  providerId: string,
): boolean {
  if (!conn) return false;
  const fields = providerId === "ollama" ? ["baseUrl", "port"] : ["apiKey"];
  return fields.every((field) => {
    const value = conn[field];
    return value !== null && value !== undefined && value !== "";
  });
}

type ConfiguredModel = {
  model: ModelInfo;
  provider: ProviderInfo;
};

export function ModelConfigPanel() {
  const user = useAdminUser();

  const providersQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getProviders(user.apiKey),
  });
  const tasksQuery = useQuery({
    queryKey: UserQueryKey.TaskModelMap,
    queryFn: () => getTaskModelMap(user.apiKey),
  });

  const providers = providersQuery.data?.providers ?? [];
  const tasks = tasksQuery.data?.tasks;

  const connectionsQuery = useQuery({
    queryKey: [
      "server-setting",
      "provider-connections",
      providers.map((p) => p.id),
    ],
    queryFn: () =>
      getProviderConnections(
        user.apiKey,
        providers.map((p) => p.id),
      ),
    enabled: providers.length > 0,
  });
  const connections = connectionsQuery.data ?? {};

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Models</h1>
        <p className="m-0 text-muted text-sm">
          Pick a configured model for each business task. Configure connections
          (API keys, base URLs) on the{" "}
          <a
            className="text-accent underline"
            href="/server-settings/providers"
          >
            Providers
          </a>{" "}
          page first — only fully-configured models appear in each dropdown.
        </p>
      </section>

      {providersQuery.isLoading || tasksQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading model tasks…</p>
      ) : tasksQuery.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(tasksQuery.error)}
        </p>
      ) : tasks ? (
        <>
          {TASK_IDS.map((scenario) => (
            <ScenarioPanel
              key={scenario}
              scenario={scenario}
              tasks={tasks}
              providers={providers}
              connections={connections}
              apiKey={user.apiKey}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function ScenarioPanel({
  scenario,
  tasks,
  providers,
  connections,
  apiKey,
}: {
  scenario: Scenario;
  tasks: TaskLinks;
  providers: ProviderInfo[];
  connections: Record<string, ProviderConnection | null>;
  apiKey: string;
}) {
  const queryClient = useQueryClient();
  const meta = SCENARIO_META[scenario];
  const chosen = tasks[scenario] ?? null;

  const configured = useMemo<ConfiguredModel[]>(() => {
    const out: ConfiguredModel[] = [];
    for (const provider of providers) {
      if (!isConfigured(connections[provider.id], provider.id)) continue;
      for (const model of provider.models) {
        const ok = meta.requiredCapabilities.every(
          (cap) => model.capabilities[cap] === true,
        );
        if (ok) out.push({ model, provider });
      }
    }
    return out;
  }, [providers, connections, meta.requiredCapabilities]);

  const updateMutation = useMutation({
    mutationFn: (next: string | null) =>
      putTaskModelMap({ apiKey, tasks: { [scenario]: next } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.TaskModelMap,
      });
    },
  });

  const chosenModel = configured.find((c) => c.model.identifier === chosen);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-ink text-lg">{meta.title}</h2>
        <p className="m-0 text-muted text-sm">{meta.description}</p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span>Model</span>
        <select
          className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
          value={chosen ?? ""}
          disabled={updateMutation.isPending}
          onChange={(e) => {
            const v = e.target.value;
            updateMutation.mutate(v === "" ? null : v);
          }}
        >
          <option value="">— select a configured model —</option>
          {configured.map(({ model, provider }) => (
            <option key={model.identifier} value={model.identifier}>
              {model.displayName} · {provider.displayName}
            </option>
          ))}
        </select>
        <span className="text-muted text-xs">
          {configured.length === 0
            ? "No fully-configured models for this task yet. Visit Providers to set one up."
            : `${configured.length} configured model${configured.length === 1 ? "" : "s"} available.`}
        </span>
      </label>

      {updateMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(updateMutation.error)}
        </p>
      ) : null}
      {updateMutation.isSuccess ? (
        <p className="m-0 text-ok text-sm">Saved.</p>
      ) : null}

      {chosenModel ? (
        <Link
          className="self-start text-accent text-sm underline"
          href={`/server-settings/providers/${chosenModel.provider.id}`}
        >
          Test the model on provider page
        </Link>
      ) : null}
    </section>
  );
}

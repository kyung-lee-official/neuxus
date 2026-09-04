"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  type EmbeddingTestResult,
  getModelConfig,
  type ModelConfig,
  type ModelInfo,
  type ModelTaskPointers,
  type ProviderInfo,
  putModelConfig,
  testEmbedSearch,
  testModelChat,
  testModelVision,
  UserQueryKey,
} from "@/lib/api";
import { useAdminUser } from "./admin-shell";

type Scenario = "embedding" | "llm" | "vision";

const SCENARIO_META: Record<Scenario, { title: string; description: string }> =
  {
    embedding: {
      title: "Embedding",
      description:
        "Vector model that turns knowledge-base children and user questions into vectors for cosine search.",
    },
    llm: {
      title: "LLM (chat / synthesis)",
      description:
        "Model that answers Ask queries from retrieved knowledge-base parents and chat history.",
    },
    vision: {
      title: "Vision (image description)",
      description:
        "Model that generates one-sentence descriptions for `![…](…)` images in ingested pages. Used by the image-enrichment pipeline.",
    },
  };

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * A model is "fully configured" iff every provider-declared user input
 * field is non-empty. Mirrors the server's check (`isFullyConfigured`
 * in `shared/models/config.ts`).
 */
function isFullyConfiguredClient(
  conn:
    | { apiKey: string | null; baseUrl: string | null; port: number | null }
    | undefined,
  required: ProviderInfo["userInputs"],
): boolean {
  if (!conn) return false;
  if (required.includes("apiKey") && !conn.apiKey) return false;
  if (required.includes("baseUrl") && !conn.baseUrl) return false;
  if (required.includes("port") && !conn.port) return false;
  return true;
}

export function ModelConfigPanel() {
  const user = useAdminUser();

  const configQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getModelConfig(user.apiKey),
  });

  const providers = configQuery.data?.providers ?? [];
  const models = configQuery.data?.models ?? [];
  const config = configQuery.data?.config;

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

      {configQuery.isLoading || !config ? (
        <p className="m-0 text-muted text-sm">Loading model registry…</p>
      ) : (
        <>
          {(["embedding", "llm", "vision"] as const).map((scenario) => (
            <ScenarioPanel
              key={scenario}
              scenario={scenario}
              config={config}
              models={models}
              providers={providers}
              apiKey={user.apiKey}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ScenarioPanel({
  scenario,
  config,
  models,
  providers,
  apiKey,
}: {
  scenario: Scenario;
  config: ModelConfig;
  models: ModelInfo[];
  providers: ProviderInfo[];
  apiKey: string;
}) {
  const queryClient = useQueryClient();
  const meta = SCENARIO_META[scenario];
  const chosenId = config.tasks[scenario];

  const configured = useMemo(() => {
    return models
      .filter((m) => m.capabilities[scenario] === true)
      .filter((m) => {
        const provider = providers.find((p) => p.id === m.providerId);
        if (!provider) return false;
        return isFullyConfiguredClient(
          config.connections[m.id],
          provider.userInputs,
        );
      });
  }, [models, providers, scenario, config.connections]);

  const updateMutation = useMutation({
    mutationFn: (next: string | null) =>
      putModelConfig({
        apiKey,
        patch: {
          tasks: { [scenario]: next } as Partial<ModelTaskPointers>,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.ModelConfig,
      });
    },
  });

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
          value={chosenId ?? ""}
          disabled={updateMutation.isPending}
          onChange={(e) => {
            const v = e.target.value;
            updateMutation.mutate(v === "" ? null : v);
          }}
        >
          <option value="">— select a configured {scenario} model —</option>
          {configured.map((m) => {
            const provider = providers.find((p) => p.id === m.providerId);
            return (
              <option key={m.id} value={m.id}>
                {m.displayName} · {provider?.displayName ?? m.providerId}
              </option>
            );
          })}
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

      {chosenId ? <ScenarioTester scenario={scenario} apiKey={apiKey} /> : null}
    </section>
  );
}

function ScenarioTester({
  scenario,
  apiKey,
}: {
  scenario: Scenario;
  apiKey: string;
}) {
  if (scenario === "embedding") {
    return <EmbeddingTester apiKey={apiKey} />;
  }
  if (scenario === "llm") {
    return <LlmTester apiKey={apiKey} />;
  }
  return <VisionTester apiKey={apiKey} />;
}

function EmbeddingTester({ apiKey }: { apiKey: string }) {
  const [query, setQuery] = useState("");
  const mutation = useMutation({
    mutationFn: () => testEmbedSearch(apiKey, { query, limit: 10 }),
  });

  const result: EmbeddingTestResult | null = mutation.data ?? null;

  return (
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">
        Test embedding (top-K)
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim() === "" || mutation.isPending) return;
          mutation.mutate();
        }}
      >
        <div className="flex gap-2">
          <input
            type="search"
            className="flex-1 rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm disabled:opacity-60"
            placeholder="Search the knowledge base by vector cosine similarity"
            value={query}
            disabled={mutation.isPending}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={query.trim() === "" || mutation.isPending}
          >
            {mutation.isPending ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.isPending ? (
        <p className="m-0 text-muted text-sm">Embedding query…</p>
      ) : null}
      {result && !mutation.isPending ? (
        <>
          <p className="m-0 text-muted text-xs">
            {result.results.length === 0
              ? "No pages match this query."
              : `${result.results.length} result${result.results.length === 1 ? "" : "s"}.`}
          </p>
          {result.results.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {result.results.map((p) => (
                <li
                  key={p.id}
                  className="rounded border border-line bg-canvas p-2 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-display text-ink">{p.title}</div>
                    <div className="shrink-0 font-mono text-muted text-xs">
                      Cosine: {p.score.toFixed(4)}
                    </div>
                  </div>
                  <div className="break-all font-mono text-muted text-xs">
                    {p.slug}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LlmTester({ apiKey }: { apiKey: string }) {
  const [prompt, setPrompt] = useState("");
  const mutation = useMutation({
    mutationFn: () => testModelChat(apiKey, prompt),
  });

  return (
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">Test LLM</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim() === "" || mutation.isPending) return;
          mutation.mutate();
        }}
      >
        <textarea
          className="min-h-20 rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm disabled:opacity-60"
          placeholder="Ask the configured LLM anything."
          value={prompt}
          disabled={mutation.isPending}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          type="submit"
          className="self-start rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={prompt.trim() === "" || mutation.isPending}
        >
          {mutation.isPending ? "Sending…" : "Send"}
        </button>
      </form>
      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.isPending ? (
        <p className="m-0 text-muted text-sm">Waiting for LLM…</p>
      ) : null}
      {mutation.data && !mutation.isPending ? (
        <TestResultPanel
          caption={`response (${mutation.data.prompt.length} prompt chars)`}
          text={mutation.data.response}
        />
      ) : null}
    </div>
  );
}

function VisionTester({ apiKey }: { apiKey: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (f: File) => testModelVision(apiKey, f),
  });

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function pickFile(next: File | null) {
    if (mutation.isPending) return;
    setFile(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit() {
    if (!file || mutation.isPending) return;
    mutation.mutate(file);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">Test vision</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="block w-full max-w-md rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:text-white disabled:opacity-60"
          disabled={mutation.isPending}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            pickFile(next);
          }}
        />
        <button
          type="button"
          className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!file || mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending ? "Describing…" : "Send to vision LLM"}
        </button>
        {file && !mutation.isPending ? (
          <button
            type="button"
            className="rounded border border-line bg-transparent px-3.5 py-2 text-ink text-sm"
            onClick={() => pickFile(null)}
          >
            Clear
          </button>
        ) : null}
      </div>

      {previewUrl && file ? (
        <div className="flex items-start gap-3">
          {/* biome-ignore lint/performance/noImgElement: blob URL preview of a user-selected local file; next/image cannot optimize it. */}
          <img
            src={previewUrl}
            alt={file.name}
            className="max-h-48 max-w-xs rounded border border-line bg-canvas object-contain"
          />
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-muted text-xs">
            <dt>name</dt>
            <dd className="m-0 break-all text-ink">{file.name}</dd>
            <dt>type</dt>
            <dd className="m-0 text-ink">{file.type || "—"}</dd>
            <dt>size</dt>
            <dd className="m-0 text-ink">{file.size} bytes</dd>
          </dl>
        </div>
      ) : null}

      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.isPending ? (
        <p className="m-0 text-muted text-sm">Waiting for vision LLM…</p>
      ) : null}
      {mutation.data && !mutation.isPending ? (
        <TestResultPanel
          caption={`${mutation.data.name} · ${mutation.data.mimeType || "unknown"} · ${mutation.data.sizeBytes} bytes`}
          text={mutation.data.description}
        />
      ) : null}
    </div>
  );
}

function TestResultPanel({ caption, text }: { caption: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded border border-line bg-canvas p-2.5">
      <div className="font-mono text-muted text-xs">{caption}</div>
      <p className="m-0 whitespace-pre-wrap text-ink text-sm">{text}</p>
    </div>
  );
}

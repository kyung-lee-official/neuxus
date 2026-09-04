"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getModelConfig,
  type ModelConfig,
  type ModelInfo,
  type ModelSlot,
  type ProviderInfo,
  putModelConfig,
  testEmbedSearch,
  testModelChat,
  testModelVision,
  UserQueryKey,
} from "@/lib/api";
import { useAdminUser } from "./admin-shell";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

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
        "Model that generates one-sentence descriptions for `![…](…)` images in ingested pages. Used by the image-enrichment pipeline and the test panel below.",
    },
  };

export function ModelConfigPanel() {
  const user = useAdminUser();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: UserQueryKey.ModelConfig,
    queryFn: () => getModelConfig(user.apiKey),
  });

  const saveMutation = useMutation({
    mutationFn: (config: ModelConfig) =>
      putModelConfig({ apiKey: user.apiKey, config }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.ModelConfig,
      });
    },
  });

  const currentConfig = configQuery.data?.config;
  const providers = configQuery.data?.providers ?? [];
  const models = configQuery.data?.models ?? [];

  const updateSlot = (scenario: Scenario, slot: ModelSlot | null) => {
    if (!currentConfig) return;
    saveMutation.mutate({
      ...currentConfig,
      [scenario]: slot,
    });
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Models</h1>
        <p className="m-0 text-muted text-sm">
          Pick a model for each business task. Every dropdown only lists models
          that support the task; the per-model connection fields appear below
          the dropdown once you choose one.
        </p>
      </section>

      {configQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading model registry…</p>
      ) : (
        <>
          {(["embedding", "llm", "vision"] as const).map((scenario) => (
            <ScenarioPanel
              key={scenario}
              scenario={scenario}
              slot={currentConfig?.[scenario] ?? null}
              models={models}
              providers={providers}
              busy={saveMutation.isPending}
              error={
                saveMutation.isError ? errorMessage(saveMutation.error) : null
              }
              onChange={(slot) => updateSlot(scenario, slot)}
              apiKey={user.apiKey}
            />
          ))}
          {saveMutation.isSuccess ? (
            <p className="m-0 text-ok text-sm">Saved.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function ScenarioPanel({
  scenario,
  slot,
  models,
  providers,
  busy,
  error,
  onChange,
  apiKey,
}: {
  scenario: Scenario;
  slot: ModelSlot | null;
  models: ModelInfo[];
  providers: ProviderInfo[];
  busy: boolean;
  error: string | null;
  onChange: (slot: ModelSlot | null) => void;
  apiKey: string;
}) {
  const meta = SCENARIO_META[scenario];
  const supported = useMemo(
    () => models.filter((m) => m.capabilities[scenario] === true),
    [models, scenario],
  );

  const chosen = slot
    ? (models.find((m) => m.id === slot.modelId) ?? null)
    : null;
  const provider = chosen
    ? (providers.find((p) => p.id === chosen.providerId) ?? null)
    : null;

  function setField<K extends keyof ModelSlot>(key: K, value: ModelSlot[K]) {
    if (!slot) return;
    onChange({ ...slot, [key]: value });
  }

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
          value={slot?.modelId ?? ""}
          disabled={busy}
          onChange={(e) => {
            const modelId = e.target.value;
            if (modelId === "") {
              onChange(null);
            } else {
              onChange({ modelId, apiKey: null, baseUrl: null, port: null });
            }
          }}
        >
          <option value="">— select a {scenario} model —</option>
          {supported.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName} ·{" "}
              {providers.find((p) => p.id === m.providerId)?.displayName ??
                m.providerId}
            </option>
          ))}
        </select>
      </label>

      {chosen && provider ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-muted text-xs">
            Provider:{" "}
            <span className="font-mono text-ink">{provider.displayName}</span>
            {" · "}
            baseUrl:{" "}
            <span className="font-mono text-ink">{provider.baseUrl}</span>
          </p>

          {provider.userInputs.includes("apiKey") ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span>API key</span>
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
                value={slot?.apiKey ?? ""}
                disabled={busy}
                placeholder={
                  provider.id.startsWith("minimax")
                    ? "Minimax API key"
                    : "API key"
                }
                onChange={(e) =>
                  setField(
                    "apiKey",
                    e.target.value === "" ? null : e.target.value,
                  )
                }
              />
            </label>
          ) : null}

          {provider.userInputs.includes("baseUrl") ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span>Base URL (host)</span>
              <input
                type="text"
                className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
                value={slot?.baseUrl ?? ""}
                disabled={busy}
                placeholder="http://127.0.0.1"
                onChange={(e) =>
                  setField(
                    "baseUrl",
                    e.target.value === "" ? null : e.target.value,
                  )
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
                value={slot?.port ?? ""}
                disabled={busy}
                placeholder="11434"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setField("port", null);
                    return;
                  }
                  const n = Number.parseInt(raw, 10);
                  setField("port", Number.isInteger(n) && n > 0 ? n : null);
                }}
              />
            </label>
          ) : null}

          <ScenarioTester scenario={scenario} apiKey={apiKey} disabled={busy} />
        </div>
      ) : null}

      {error ? <p className="m-0 text-danger text-sm">{error}</p> : null}
    </section>
  );
}

function ScenarioTester({
  scenario,
  apiKey,
  disabled,
}: {
  scenario: Scenario;
  apiKey: string;
  disabled: boolean;
}) {
  if (scenario === "embedding") {
    return <EmbeddingTester apiKey={apiKey} disabled={disabled} />;
  }
  if (scenario === "llm") {
    return <LlmTester apiKey={apiKey} disabled={disabled} />;
  }
  return <VisionTester apiKey={apiKey} disabled={disabled} />;
}

function EmbeddingTester({
  apiKey,
  disabled,
}: {
  apiKey: string;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const mutation = useMutation({
    mutationFn: () => testEmbedSearch(apiKey, { query, limit: 10 }),
  });

  const result =
    mutation.data && "results" in mutation.data ? mutation.data : null;

  return (
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">
        Test embedding (top-K)
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim() === "" || disabled) return;
          mutation.mutate();
        }}
      >
        <div className="flex gap-2">
          <input
            type="search"
            className="flex-1 rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm disabled:opacity-60"
            placeholder="Search the knowledge base by vector cosine similarity"
            value={query}
            disabled={disabled || mutation.isPending}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || query.trim() === "" || mutation.isPending}
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
        <p className="m-0 text-muted text-xs">
          {result.results.length === 0
            ? "No pages match this query."
            : `${result.results.length} result${result.results.length === 1 ? "" : "s"}.`}
        </p>
      ) : null}
      {result && result.results.length > 0 ? (
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
    </div>
  );
}

function LlmTester({
  apiKey,
  disabled,
}: {
  apiKey: string;
  disabled: boolean;
}) {
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
          if (prompt.trim() === "" || disabled) return;
          mutation.mutate();
        }}
      >
        <textarea
          className="min-h-20 rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm disabled:opacity-60"
          placeholder="Ask the configured LLM anything."
          value={prompt}
          disabled={disabled || mutation.isPending}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          type="submit"
          className="self-start rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || prompt.trim() === "" || mutation.isPending}
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
        <p className="m-0 text-muted text-sm">Waiting for vision… err, LLM…</p>
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

function VisionTester({
  apiKey,
  disabled,
}: {
  apiKey: string;
  disabled: boolean;
}) {
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
          disabled={disabled || mutation.isPending}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            pickFile(next);
          }}
        />
        <button
          type="button"
          className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || !file || mutation.isPending}
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

      {previewUrl ? (
        <div className="flex items-start gap-3">
          {/* biome-ignore lint/performance/noImgElement: blob URL preview of a user-selected local file; next/image cannot optimize it. */}
          <img
            src={previewUrl}
            alt={file?.name ?? "Selected image preview"}
            className="max-h-48 max-w-xs rounded border border-line bg-canvas object-contain"
          />
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-muted text-xs">
            <dt>name</dt>
            <dd className="m-0 break-all text-ink">{file?.name ?? "—"}</dd>
            <dt>type</dt>
            <dd className="m-0 text-ink">{file?.type || "—"}</dd>
            <dt>size</dt>
            <dd className="m-0 text-ink">
              {file ? `${file.size} bytes` : "—"}
            </dd>
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

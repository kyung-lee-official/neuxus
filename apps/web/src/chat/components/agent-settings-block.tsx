"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ApiError,
  getChatAgentSettings,
  putChatAgentSettings,
  UserQueryKey,
} from "@/chat/lib/api";

const inputClass =
  "w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60";
const primaryButton =
  "rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function positiveInt(raw: string, label: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

/** Admin-only agent budgets and tool credentials. */
export function AgentSettingsBlock({ apiKey }: { apiKey: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: UserQueryKey.AgentSettings,
    queryFn: () => getChatAgentSettings(apiKey),
  });

  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [maxToolIterations, setMaxToolIterations] = useState("");
  const [streamTimeoutMs, setStreamTimeoutMs] = useState("");
  const [runMaxAttempts, setRunMaxAttempts] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setDeepseekApiKey("");
    setClearKey(false);
    setMaxToolIterations(String(data.maxToolIterations));
    setStreamTimeoutMs(String(data.streamTimeoutMs));
    setRunMaxAttempts(String(data.runMaxAttempts));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const nextMaxIterations = positiveInt(
        maxToolIterations,
        "Max tool iterations",
      );
      const nextStreamTimeout = positiveInt(streamTimeoutMs, "Stream timeout");
      const nextRunAttempts = positiveInt(runMaxAttempts, "Run max attempts");
      const key = deepseekApiKey.trim();
      return putChatAgentSettings({
        apiKey,
        settings: {
          ...(key !== ""
            ? { deepseekApiKey: key }
            : clearKey
              ? { deepseekApiKey: null }
              : {}),
          maxToolIterations: nextMaxIterations,
          streamTimeoutMs: nextStreamTimeout,
          runMaxAttempts: nextRunAttempts,
        },
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(UserQueryKey.AgentSettings, data);
      setDeepseekApiKey("");
      setClearKey(false);
      setNotice("Saved agent settings.");
    },
    onError: () => setNotice(null),
  });

  const defaults = settingsQuery.data?.defaults;
  const busy = settingsQuery.isLoading || saveMutation.isPending;
  const error =
    (settingsQuery.isError ? errorMessage(settingsQuery.error) : null) ||
    (saveMutation.isError ? errorMessage(saveMutation.error) : null);

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <div>
        <h2 className="m-0 font-display text-ink text-lg">Agent settings</h2>
        <p className="mt-1 mb-0 text-muted text-sm">
          Admin-only configuration stored in <code>agent_settings</code>. The
          DeepSeek key is stored server-side, never returned by the API, and is
          not encrypted at rest.
        </p>
      </div>

      {settingsQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading agent settings…</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            saveMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5 text-sm">
            <span>DeepSeek API key</span>
            <p className="m-0 text-muted text-xs">
              {settingsQuery.data?.hasDeepseekApiKey
                ? "A key is configured. Leave blank to keep it."
                : "No key is configured. fetch_url is unavailable until one is saved."}
            </p>
            <input
              type="password"
              autoComplete="off"
              className={inputClass}
              value={deepseekApiKey}
              placeholder={
                settingsQuery.data?.hasDeepseekApiKey ? "••••••••" : "sk-…"
              }
              disabled={busy}
              onChange={(event) => {
                setDeepseekApiKey(event.target.value);
                setClearKey(false);
              }}
            />
            {settingsQuery.data?.hasDeepseekApiKey ? (
              <label className="flex items-center gap-2 text-muted text-xs">
                <input
                  type="checkbox"
                  checked={clearKey}
                  disabled={busy || deepseekApiKey !== ""}
                  onChange={(event) => setClearKey(event.target.checked)}
                />
                Clear the stored key
              </label>
            ) : null}
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Max tool iterations</span>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={maxToolIterations}
              placeholder={defaults ? String(defaults.maxToolIterations) : "4"}
              disabled={busy}
              onChange={(event) => setMaxToolIterations(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Stream timeout (ms)</span>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={streamTimeoutMs}
              placeholder={
                defaults ? String(defaults.streamTimeoutMs) : "300000"
              }
              disabled={busy}
              onChange={(event) => setStreamTimeoutMs(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>Run max attempts</span>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={runMaxAttempts}
              placeholder={defaults ? String(defaults.runMaxAttempts) : "2"}
              disabled={busy}
              onChange={(event) => setRunMaxAttempts(event.target.value)}
            />
          </label>

          {error ? <p className="m-0 text-danger text-sm">{error}</p> : null}
          {notice ? <p className="m-0 text-ok text-sm">{notice}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton} disabled={busy}>
              {saveMutation.isPending ? "Saving…" : "Save agent settings"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy || !defaults}
              onClick={() => {
                if (!defaults) return;
                setMaxToolIterations(String(defaults.maxToolIterations));
                setStreamTimeoutMs(String(defaults.streamTimeoutMs));
                setRunMaxAttempts(String(defaults.runMaxAttempts));
                setNotice(null);
              }}
            >
              Use defaults
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

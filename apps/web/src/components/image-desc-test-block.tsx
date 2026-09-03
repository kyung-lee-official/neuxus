"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  type ImageTestResult,
  testImageDescription,
} from "@/lib/api";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ImageDescTestBlock({ actorApiKey }: { actorApiKey: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImageTestResult | null>(null);

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

  const mutation = useMutation({
    mutationFn: (f: File) => testImageDescription(actorApiKey, f),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  function pickFile(next: File | null) {
    if (mutation.isPending) return;
    setResult(null);
    setFile(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit() {
    if (!file || mutation.isPending) return;
    mutation.mutate(file);
  }

  const busy = mutation.isPending;
  const actionError = mutation.isError ? errorMessage(mutation.error) : null;

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Image description</h2>
      <p className="m-0 text-muted text-sm">
        Send an image to the configured vision LLM (same provider the enricher
        uses) and see the description it returns.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="block w-full max-w-md rounded border border-line bg-canvas px-2.5 py-2 text-ink text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:text-white disabled:opacity-60"
            disabled={busy}
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              pickFile(next);
            }}
          />
          <button
            type="button"
            className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!file || busy}
            onClick={submit}
          >
            {busy ? "Describing…" : "Send to vision LLM"}
          </button>
          {file && !busy ? (
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

        {actionError ? (
          <p className="m-0 text-danger text-sm">{actionError}</p>
        ) : null}

        {busy ? (
          <p className="m-0 text-muted text-sm">Waiting for vision LLM…</p>
        ) : null}

        {result && !busy ? (
          <div className="flex flex-col gap-2 rounded border border-line bg-canvas p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-ink text-sm">Description</span>
              <span className="font-mono text-muted text-xs">
                {result.name} · {result.mimeType || "unknown"} ·{" "}
                {result.sizeBytes} bytes
              </span>
            </div>
            <p className="m-0 whitespace-pre-wrap text-ink text-sm">
              {result.description}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

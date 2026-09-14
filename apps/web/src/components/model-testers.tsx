"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ApiError,
  type EmbedTestResult,
  testChat,
  testEmbed,
  testImage,
} from "@/lib/api";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

const BUTTON_CLASS =
  "rounded border border-accent bg-accent px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60";

/** Wraps to its own full-width line inside the model row's flex-wrap header. */
const RESULT_CLASS = "m-0 basis-full text-xs";

type TesterProps = {
  apiKey: string;
  providerId: string;
  modelId: string;
  disabled?: boolean;
};

export function EmbeddingTester({
  apiKey,
  providerId,
  modelId,
  disabled = false,
}: TesterProps) {
  const mutation = useMutation({
    mutationFn: () => testEmbed({ apiKey, providerId, modelId }),
  });
  const result: EmbedTestResult | null = mutation.data ?? null;
  const preview = result ? result.embedding.slice(0, 8) : [];

  return (
    <>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Embedding…" : "Test embed"}
      </button>
      {mutation.isError ? (
        <p className={`${RESULT_CLASS} text-danger`}>
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {result && !mutation.isPending ? (
        <p className={`${RESULT_CLASS} text-muted`}>
          dim {result.dim} ·{" "}
          <span className="break-all font-mono text-ink">
            [{preview.map((n) => n.toFixed(4)).join(", ")}
            {result.embedding.length > preview.length ? ", …" : ""}]
          </span>
        </p>
      ) : null}
    </>
  );
}

export function TextChatTester({
  apiKey,
  providerId,
  modelId,
  disabled = false,
}: TesterProps) {
  const mutation = useMutation({
    mutationFn: () => testChat({ apiKey, providerId, modelId }),
  });

  return (
    <>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Sending…" : "Test chat"}
      </button>
      {mutation.isError ? (
        <p className={`${RESULT_CLASS} text-danger`}>
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.data && !mutation.isPending ? (
        <p className={`${RESULT_CLASS} whitespace-pre-wrap text-ink`}>
          {mutation.data.response}
        </p>
      ) : null}
    </>
  );
}

export function ImageChatTester({
  apiKey,
  providerId,
  modelId,
  disabled = false,
}: TesterProps) {
  const mutation = useMutation({
    mutationFn: () => testImage({ apiKey, providerId, modelId }),
  });

  return (
    <>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Sending…" : "Test image"}
      </button>
      {mutation.isError ? (
        <p className={`${RESULT_CLASS} text-danger`}>
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.data && !mutation.isPending ? (
        <p className={`${RESULT_CLASS} whitespace-pre-wrap text-ink`}>
          {mutation.data.response}
        </p>
      ) : null}
    </>
  );
}

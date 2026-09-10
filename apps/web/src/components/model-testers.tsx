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
  "self-start rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60";

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
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">Test embedding</p>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Embedding…" : "Embed diagnostic string"}
      </button>
      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {result && !mutation.isPending ? (
        <p className="m-0 text-muted text-xs">
          &ldquo;{result.inputText}&rdquo; · {result.modelId} · dim {result.dim}{" "}
          ·{" "}
          <span className="break-all font-mono text-ink">
            [{preview.map((n) => n.toFixed(4)).join(", ")}
            {result.embedding.length > preview.length ? ", …" : ""}]
          </span>
        </p>
      ) : null}
    </div>
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
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">Test text chat</p>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Sending…" : "Send “Hello!”"}
      </button>
      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.data && !mutation.isPending ? (
        <TestResultPanel caption="response" text={mutation.data.response} />
      ) : null}
    </div>
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
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <p className="m-0 font-display text-ink text-sm">Test image chat</p>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Sending…" : "Send test image"}
      </button>
      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {mutation.data && !mutation.isPending ? (
        <TestResultPanel caption="response" text={mutation.data.response} />
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

import type { CloneProgress } from "./git.ts";

export type CorpusOperation = "clone" | "pull" | "chunkify" | "embed" | "sync";

export type CorpusStage =
  | "clone"
  | "fetch"
  | "checkout"
  | "merge"
  | "ingest"
  | "chunkify"
  | "embed";

export type CorpusProgress = CloneProgress;

export type CorpusStatus = {
  running: boolean;
  operation: CorpusOperation | null;
  stage: CorpusStage | null;
  progress: CorpusProgress | null;
  lastError: string | null;
};

const PING_MS = 15_000;

let running = false;
let operation: CorpusOperation | null = null;
let stage: CorpusStage | null = null;
let progress: CorpusProgress | null = null;
let lastError: string | null = null;

const listeners = new Set<(status: CorpusStatus) => void>();

export function getCorpusStatus(): CorpusStatus {
  return { running, operation, stage, progress, lastError };
}

export function subscribeCorpusStatus(
  listener: (status: CorpusStatus) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function broadcast(): void {
  const snapshot = getCorpusStatus();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function startOp(op: CorpusOperation): boolean {
  if (running) return false;
  running = true;
  operation = op;
  stage = initialStage(op);
  progress = null;
  lastError = null;
  broadcast();
  return true;
}

function initialStage(op: CorpusOperation): CorpusStage {
  switch (op) {
    case "clone":
      return "clone";
    case "pull":
      return "fetch";
    case "chunkify":
      return "chunkify";
    case "embed":
      return "embed";
    case "sync":
      return "fetch";
  }
}

export function tryStartCorpusOp(op: CorpusOperation): boolean {
  return startOp(op);
}

export function emitStage(next: CorpusStage): void {
  stage = next;
  progress = null;
  broadcast();
}

export function emitProgress(next: CorpusProgress): void {
  progress = next;
  broadcast();
}

export function finishCorpusOp(err?: unknown): void {
  if (err) lastError = errorMessage(err);
  running = false;
  operation = null;
  stage = null;
  progress = null;
  broadcast();
}

function encodeSse(chunk: string): Uint8Array {
  return new TextEncoder().encode(chunk);
}

/** Stay-open SSE: snapshot on connect, then status updates and comment pings. */
export function corpusEventStream(): Response {
  let unsub: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (status: CorpusStatus) => {
        try {
          controller.enqueue(encodeSse(`data: ${JSON.stringify(status)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send(getCorpusStatus());
      unsub = subscribeCorpusStatus(send);
      ping = setInterval(() => {
        try {
          controller.enqueue(encodeSse(": ping\n\n"));
        } catch {
          /* closed */
        }
      }, PING_MS);
    },
    cancel() {
      unsub?.();
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

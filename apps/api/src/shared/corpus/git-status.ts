import type { CloneProgress } from "./git.ts";

export type CorpusGitOperation = "clone" | "pull";

export type CorpusGitStage = "clone" | "fetch" | "checkout" | "merge";

export type CorpusGitProgress = CloneProgress;

export type CorpusGitStatus = {
  running: boolean;
  operation: CorpusGitOperation | null;
  stage: CorpusGitStage | null;
  progress: CorpusGitProgress | null;
  lastError: string | null;
};

const PING_MS = 15_000;

let running = false;
let operation: CorpusGitOperation | null = null;
let stage: CorpusGitStage | null = null;
let progress: CorpusGitProgress | null = null;
let lastError: string | null = null;

const listeners = new Set<(status: CorpusGitStatus) => void>();

export function getCorpusGitStatus(): CorpusGitStatus {
  return { running, operation, stage, progress, lastError };
}

export function subscribeCorpusGit(
  listener: (status: CorpusGitStatus) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function broadcast(): void {
  const snapshot = getCorpusGitStatus();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function start(op: CorpusGitOperation): boolean {
  if (running) return false;
  running = true;
  operation = op;
  stage = op === "clone" ? "clone" : "fetch";
  progress = null;
  lastError = null;
  broadcast();
  return true;
}

function setStage(next: CorpusGitStage): void {
  stage = next;
  progress = null;
  broadcast();
}

function setProgress(next: CorpusGitProgress): void {
  progress = next;
  broadcast();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function tryStartClone(): boolean {
  return start("clone");
}

export function tryStartPull(): boolean {
  return start("pull");
}

export function emitStage(next: CorpusGitStage): void {
  setStage(next);
}

export function emitProgress(next: CorpusGitProgress): void {
  setProgress(next);
}

export function finishOperation(err: unknown): void {
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
export function corpusGitEventStream(): Response {
  let unsub: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (status: CorpusGitStatus) => {
        try {
          controller.enqueue(encodeSse(`data: ${JSON.stringify(status)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send(getCorpusGitStatus());
      unsub = subscribeCorpusGit(send);
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

import { embedStaleChildren } from "../embed/index.ts";
import { resolveCorpusSettings } from "./defaults.ts";
import {
  CorpusGitError,
  corpusCheckoutDir,
  refreshCorpusCheckout,
} from "./git.ts";
import { ingestCorpusCheckout } from "./ingest-checkout.ts";
import { loadCorpusSettings, saveCorpusLastSyncedSha } from "./settings.ts";

export type CorpusSyncStage = "pull" | "ingest" | "embed";

export type CorpusSyncStatus = {
  running: boolean;
  stage: CorpusSyncStage | null;
  lastError: string | null;
};

const PING_MS = 15_000;

let running = false;
let stage: CorpusSyncStage | null = null;
let lastError: string | null = null;

const listeners = new Set<(status: CorpusSyncStatus) => void>();

export function getCorpusSyncStatus(): CorpusSyncStatus {
  return { running, stage, lastError };
}

export function subscribeCorpusSync(
  listener: (status: CorpusSyncStatus) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function broadcast(): void {
  const snapshot = getCorpusSyncStatus();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function setStage(next: CorpusSyncStage): void {
  stage = next;
  broadcast();
}

function errorMessage(err: unknown): string {
  if (err instanceof CorpusGitError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function runCorpusSync(): Promise<void> {
  try {
    setStage("pull");
    const sha = await refreshCorpusCheckout();
    const settings = resolveCorpusSettings(await loadCorpusSettings());
    setStage("ingest");
    await ingestCorpusCheckout(corpusCheckoutDir(), settings.docsRoot);
    setStage("embed");
    await embedStaleChildren({ failFast: true });
    await saveCorpusLastSyncedSha(sha);
    lastError = null;
  } catch (err) {
    lastError = errorMessage(err);
  } finally {
    running = false;
    stage = null;
    broadcast();
  }
}

/** Acquire the singleton and start work. Returns false if already running. */
export function tryStartCorpusSync(): boolean {
  if (running) return false;
  running = true;
  lastError = null;
  stage = "pull";
  broadcast();
  void runCorpusSync();
  return true;
}

function encodeSse(chunk: string): Uint8Array {
  return new TextEncoder().encode(chunk);
}

/** Stay-open SSE: snapshot on connect, then stage updates and comments. */
export function corpusSyncEventStream(): Response {
  let unsub: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (status: CorpusSyncStatus) => {
        try {
          controller.enqueue(encodeSse(`data: ${JSON.stringify(status)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send(getCorpusSyncStatus());
      unsub = subscribeCorpusSync(send);
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

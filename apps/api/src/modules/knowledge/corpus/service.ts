/**
 * Corpus service. Owns the corpus operations (clone / pull / rechunk /
 * embed / sync) and the single-operation lock + progress stream they share.
 *
 * Lower-level pieces stay separate: `git.ts` (git plumbing), `walk.ts`
 * (filesystem walk), `ingest-checkout.ts` (page persist), `dal.ts` (chunk
 * rows), `settings/` (kb_corpus_settings).
 */

import { chunkify } from "../../../shared/chunkify/chunkify.ts";
import { Embedder, type EmbedStaleChildrenResult } from "../embedder/index.ts";
import { listPageBodies, replacePageChunks } from "../pages/index.ts";
import {
  type CloneProgress,
  cloneCorpusStream,
  corpusCheckoutDir,
  pullCorpusStream,
  refreshCorpusCheckout,
} from "./git.ts";
import { ingestCorpusCheckout } from "./ingest-checkout.ts";
import {
  type ResolvedCorpusSettings,
  resolveCorpusSettings,
  type StoredCorpusSettings,
} from "./settings/defaults.ts";
import { CorpusSettings } from "./settings/service.ts";

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

/** Thrown when an operation is requested while another is already running. */
export class CorpusLockedError extends Error {
  readonly httpStatus = 409;

  constructor() {
    super("A corpus operation is already running.");
    this.name = "CorpusLockedError";
  }
}

const PING_MS = 15_000;

let running = false;
let operation: CorpusOperation | null = null;
let stage: CorpusStage | null = null;
let progress: CorpusProgress | null = null;
let lastError: string | null = null;

const listeners = new Set<(status: CorpusStatus) => void>();

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
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

function encodeSse(chunk: string): Uint8Array {
  return new TextEncoder().encode(chunk);
}

export abstract class Corpus {
  /** Current operation snapshot. */
  static status(): CorpusStatus {
    return { running, operation, stage, progress, lastError };
  }

  /** Stay-open SSE: snapshot on connect, then status updates and comment pings. */
  static events(): Response {
    let unsub: (() => void) | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (status: CorpusStatus) => {
          try {
            controller.enqueue(
              encodeSse(`data: ${JSON.stringify(status)}\n\n`),
            );
          } catch {
            /* closed */
          }
        };
        send(Corpus.status());
        unsub = subscribe(send);
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

  /** Acquire the single-operation lock, or `false` when one is running. */
  static tryStart(op: CorpusOperation): boolean {
    if (running) return false;
    running = true;
    operation = op;
    stage = initialStage(op);
    progress = null;
    lastError = null;
    broadcast();
    return true;
  }

  static emitStage(next: CorpusStage): void {
    stage = next;
    progress = null;
    broadcast();
  }

  static emitProgress(next: CorpusProgress): void {
    progress = next;
    broadcast();
  }

  static finish(err?: unknown): void {
    if (err) lastError = errorMessage(err);
    running = false;
    operation = null;
    stage = null;
    progress = null;
    broadcast();
  }

  /** Clone the configured repo into the local checkout. */
  static async clone(): Promise<StoredCorpusSettings> {
    if (!Corpus.tryStart("clone")) throw new CorpusLockedError();
    try {
      const result = await cloneCorpusStream(Corpus.emitProgress);
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Pull the latest commit into the local checkout. */
  static async pull(): Promise<StoredCorpusSettings> {
    if (!Corpus.tryStart("pull")) throw new CorpusLockedError();
    try {
      const result = await pullCorpusStream(Corpus.emitStage);
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Re-chunk every `kb_pages` row into fresh parent/child rows. */
  static async rechunk(): Promise<{
    pagesProcessed: number;
    pagesSkipped: number;
  }> {
    if (!Corpus.tryStart("chunkify")) throw new CorpusLockedError();
    try {
      Corpus.emitStage("chunkify");
      const pages = await listPageBodies();

      let pagesProcessed = 0;
      let pagesSkipped = 0;

      for (const page of pages) {
        const chunks = chunkify(page.body);
        const parentRows = chunks.parents.map((parent) => {
          const id = `${page.id}:p:${parent.index}`;
          return {
            id,
            pageId: page.id,
            parentIndex: parent.index,
            text: parent.text,
            startOffset: parent.start,
            endOffset: parent.end,
          };
        });
        const childRows = chunks.children.map((child) => {
          const parentId = `${page.id}:p:${child.parentIndex}`;
          return {
            id: `${parentId}:c:${child.index}`,
            parentId,
            pageId: page.id,
            childIndex: child.index,
            text: child.text,
            startOffset: child.start,
            endOffset: child.end,
          };
        });

        await replacePageChunks(page.id, parentRows, childRows);

        pagesProcessed += 1;
        if (chunks.parents.length === 0) pagesSkipped += 1;
      }

      Corpus.finish();
      return { pagesProcessed, pagesSkipped };
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Embed children whose `embedding_model` is missing or stale. */
  static async embed(): Promise<EmbedStaleChildrenResult> {
    if (!Corpus.tryStart("embed")) throw new CorpusLockedError();
    try {
      Corpus.emitStage("embed");
      const result = await Embedder.embedStaleChildren({ failFast: true });
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Start the full sync pipeline (fetch → ingest → embed → record sha). */
  static sync(): void {
    if (!Corpus.tryStart("sync")) throw new CorpusLockedError();
    void Corpus.runSync().catch(() => {
      /* errors already recorded in status via finish(err) */
    });
  }

  private static async runSync(): Promise<void> {
    try {
      Corpus.emitStage("fetch");
      const sha = await refreshCorpusCheckout();
      const settings: ResolvedCorpusSettings = resolveCorpusSettings(
        await CorpusSettings.load(),
      );
      Corpus.emitStage("ingest");
      await ingestCorpusCheckout(corpusCheckoutDir(), settings.docsRoot);
      Corpus.emitStage("embed");
      await Embedder.embedStaleChildren({ failFast: true });
      await CorpusSettings.saveLastSyncedSha(sha);
      Corpus.finish();
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }
}

function subscribe(listener: (status: CorpusStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function broadcast(): void {
  const snapshot = Corpus.status();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

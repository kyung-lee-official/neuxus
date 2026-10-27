/**
 * Corpus service. Owns the per-knowledge-base corpus operations (clone / pull /
 * ingest / rechunk / caption) and the single-operation lock + progress stream
 * they share.
 *
 * Lower-level pieces stay separate: `git.ts` (git plumbing), `settings/`
 * (`kb_corpus_settings`), and the checkout → pages write path in `../ingest/`.
 */

import {
  type CaptionPassResult,
  ImageCaptioner,
  ImageDescriptionEmbedder,
} from "../image-desc/index.ts";
import {
  type IngestCorpusCheckoutResult,
  ingestCorpusCheckout,
} from "../ingest/index.ts";
import { Page } from "../pages/index.ts";
import {
  type CloneProgress,
  cloneCorpusStream,
  corpusCheckoutDir,
  pullCorpusStream,
} from "./git.ts";
import { type StoredCorpusSettings } from "./settings/defaults.ts";

/** Corpus operation ids — single source of truth. */
export const CORPUS_OP_CLONE = "clone";
export const CORPUS_OP_PULL = "pull";
export const CORPUS_OP_INGEST = "ingest";
export const CORPUS_OP_CHUNKIFY = "chunkify";
export const CORPUS_OP_CAPTION = "caption";

/** Corpus stage ids — single source of truth. */
export const CORPUS_STG_CLONE = "clone";
export const CORPUS_STG_FETCH = "fetch";
export const CORPUS_STG_CHECKOUT = "checkout";
export const CORPUS_STG_MERGE = "merge";
export const CORPUS_STG_INGEST = "ingest";
export const CORPUS_STG_CHUNKIFY = "chunkify";
export const CORPUS_STG_CAPTION = "caption";

export type CorpusOperation =
  | typeof CORPUS_OP_CLONE
  | typeof CORPUS_OP_PULL
  | typeof CORPUS_OP_INGEST
  | typeof CORPUS_OP_CHUNKIFY
  | typeof CORPUS_OP_CAPTION;

export type CorpusStage =
  | typeof CORPUS_STG_CLONE
  | typeof CORPUS_STG_FETCH
  | typeof CORPUS_STG_CHECKOUT
  | typeof CORPUS_STG_MERGE
  | typeof CORPUS_STG_INGEST
  | typeof CORPUS_STG_CHUNKIFY
  | typeof CORPUS_STG_CAPTION;

/** Progress for a non-git corpus operation (chunkify, embedding). */
export type WorkProgress = {
  phase: "chunkify" | "embed";
  percent: number;
  processed: number;
  total: number;
};

export type CorpusProgress = CloneProgress | WorkProgress;

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

function percentOf(processed: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.round((processed / total) * 100));
}

function initialStage(op: CorpusOperation): CorpusStage {
  switch (op) {
    case CORPUS_OP_CLONE:
      return CORPUS_STG_CLONE;
    case CORPUS_OP_PULL:
      return CORPUS_STG_FETCH;
    case CORPUS_OP_INGEST:
      return CORPUS_STG_INGEST;
    case CORPUS_OP_CHUNKIFY:
      return CORPUS_STG_CHUNKIFY;
    case CORPUS_OP_CAPTION:
      return CORPUS_STG_CAPTION;
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
        // On connect, omit the last operation's error — it is a transient
        // event, delivered live via `broadcast`, not replayed on a fresh
        // connection.
        send({ ...Corpus.status(), lastError: null });
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
    lastError = err ? errorMessage(err) : null;
    running = false;
    operation = null;
    stage = null;
    progress = null;
    broadcast();
  }

  /** Clone the configured repo into the local checkout. */
  static async clone(knowledgeBaseId: string): Promise<StoredCorpusSettings> {
    if (!Corpus.tryStart(CORPUS_OP_CLONE)) throw new CorpusLockedError();
    try {
      const result = await cloneCorpusStream(
        knowledgeBaseId,
        Corpus.emitProgress,
      );
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Pull the latest commit into the local checkout. */
  static async pull(knowledgeBaseId: string): Promise<StoredCorpusSettings> {
    if (!Corpus.tryStart(CORPUS_OP_PULL)) throw new CorpusLockedError();
    try {
      const result = await pullCorpusStream(knowledgeBaseId, Corpus.emitStage);
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Ingest the checkout into `kb_pages` + image rows for one knowledge base. */
  static async ingest(
    knowledgeBaseId: string,
  ): Promise<IngestCorpusCheckoutResult> {
    if (!Corpus.tryStart(CORPUS_OP_INGEST)) throw new CorpusLockedError();
    try {
      const result = await Corpus.runIngest(knowledgeBaseId);
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  /** Force-rebuild every `kb_pages` row of one knowledge base into fresh trees. */
  static rechunk(knowledgeBaseId: string): void {
    if (!Corpus.tryStart(CORPUS_OP_CHUNKIFY)) throw new CorpusLockedError();
    void Corpus.runChunkify(knowledgeBaseId).catch(() => {
      /* errors already recorded in status via finish(err) */
    });
  }

  /** Caption every stale `vision-captioning` image of one knowledge base. */
  static async caption(knowledgeBaseId: string): Promise<CaptionPassResult> {
    if (!Corpus.tryStart(CORPUS_OP_CAPTION)) throw new CorpusLockedError();
    try {
      const result = await Corpus.runCaption(knowledgeBaseId);
      Corpus.finish();
      return result;
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  private static async runChunkify(knowledgeBaseId: string): Promise<void> {
    try {
      Corpus.emitStage(CORPUS_STG_CHUNKIFY);
      await Page.chunkifyPages(knowledgeBaseId, {
        force: true,
        onPageProgress: (processed, total) => {
          Corpus.emitProgress({
            phase: "chunkify",
            percent: percentOf(processed, total),
            processed,
            total,
          });
        },
        onEmbedProgress: (processed, total) => {
          Corpus.emitProgress({
            phase: "embed",
            percent: percentOf(processed, total),
            processed,
            total,
          });
        },
      });
      Corpus.finish();
    } catch (err) {
      Corpus.finish(err);
      throw err;
    }
  }

  private static async runIngest(
    knowledgeBaseId: string,
  ): Promise<IngestCorpusCheckoutResult> {
    Corpus.emitStage(CORPUS_STG_INGEST);
    const checkout = corpusCheckoutDir(knowledgeBaseId);
    return ingestCorpusCheckout(knowledgeBaseId, checkout);
  }

  private static async runCaption(
    knowledgeBaseId: string,
  ): Promise<CaptionPassResult> {
    Corpus.emitStage(CORPUS_STG_CAPTION);
    const checkout = corpusCheckoutDir(knowledgeBaseId);
    const result = await ImageCaptioner.captionStale({
      knowledgeBaseId,
      checkoutDir: checkout,
      failFast: true,
    });
    await ImageDescriptionEmbedder.embedStale({
      knowledgeBaseId,
      failFast: true,
    });
    return result;
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

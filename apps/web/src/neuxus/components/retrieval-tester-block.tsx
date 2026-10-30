"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  ApiError,
  type RetrieveImageResult,
  type RetrieveParentResult,
  retrieveEvidence,
} from "@/neuxus/lib/api";

const primaryButton =
  "rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function scoreText(score: number): string {
  return score.toFixed(4);
}

function ParentCard({ parent }: { parent: RetrieveParentResult }) {
  return (
    <article className="flex flex-col gap-1.5 rounded border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 font-display text-ink text-sm">
          {parent.title || parent.pageId}
        </h4>
        <span className="font-mono text-muted text-xs">
          score {scoreText(parent.score)}
        </span>
      </div>
      <p className="m-0 font-mono text-muted text-xs">
        {parent.pageId} · {parent.parentId}
      </p>
      <pre className="m-0 whitespace-pre-wrap break-words font-sans text-ink text-sm leading-snug">
        {parent.text}
      </pre>
    </article>
  );
}

function ImageCard({ image }: { image: RetrieveImageResult }) {
  return (
    <article className="flex flex-col gap-1.5 rounded border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 font-display text-ink text-sm">
          {image.title || image.pageId}
        </h4>
        <span className="font-mono text-muted text-xs">
          score {scoreText(image.score)}
        </span>
      </div>
      <p className="m-0 font-mono text-muted text-xs">
        {image.pageId} · {image.imagePath}
      </p>
      <p className="m-0 text-ink text-sm leading-snug">{image.description}</p>
    </article>
  );
}

/** Evidence-only retrieval test for one knowledge base. */
export function RetrievalTesterBlock({
  actorApiKey,
  knowledgeBaseId,
}: {
  actorApiKey: string;
  knowledgeBaseId: string;
}) {
  const [question, setQuestion] = useState("");
  const [includeChildren, setIncludeChildren] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      retrieveEvidence({
        apiKey: actorApiKey,
        knowledgeBaseId,
        question,
        includeChildren,
      }),
  });

  const result = mutation.data ?? null;
  const hits = result?.outcome.kind === "hits" ? result.outcome : null;
  const busy = mutation.isPending;

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Test retrieval</h2>
      <p className="m-0 text-muted text-sm">
        Runs the same retrieval as Ask against{" "}
        <span className="font-mono">{knowledgeBaseId}</span>: embed the
        question, search child vectors, expand and cap parents, then search
        image descriptions. No model call.
      </p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim() === "") return;
          mutation.mutate();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span>Question</span>
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={question}
            disabled={busy}
            placeholder="Which profiles support layer height 0.2 mm?"
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeChildren}
            disabled={busy}
            onChange={(event) => setIncludeChildren(event.target.checked)}
          />
          Include raw child hits
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className={primaryButton}
            disabled={busy || question.trim() === ""}
          >
            {busy ? "Retrieving…" : "Run retrieval"}
          </button>
          {result && !busy ? (
            <span className="text-muted text-xs">
              {result.latencyMs} ms · {result.embeddingModel}
            </span>
          ) : null}
        </div>
      </form>

      {mutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(mutation.error)}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3 border-line border-t pt-3">
          {result.outcome.kind === "no_hits" ? (
            <p className="m-0 text-muted text-sm">
              No hits. The question embedded successfully, but neither parents
              nor image descriptions matched.
            </p>
          ) : (
            <>
              <p className="m-0 font-mono text-muted text-xs">
                {hits?.signals.hits ?? 0} child hits ·{" "}
                {hits?.signals.usedParents ?? 0} parents ·{" "}
                {hits?.images.length ?? 0} images · top{" "}
                {hits?.signals.topScore == null
                  ? "—"
                  : scoreText(hits.signals.topScore)}{" "}
                · margin{" "}
                {hits?.signals.margin == null
                  ? "—"
                  : scoreText(hits.signals.margin)}
                {hits?.signals.truncated ? " · truncated" : ""}
              </p>

              <div className="flex flex-col gap-2">
                <h3 className="m-0 font-display text-base text-ink">
                  Parents ({hits?.parents.length ?? 0})
                </h3>
                {hits && hits.parents.length > 0 ? (
                  hits.parents.map((parent) => (
                    <ParentCard key={parent.parentId} parent={parent} />
                  ))
                ) : (
                  <p className="m-0 text-muted text-sm">No parent hits.</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="m-0 font-display text-base text-ink">
                  Images ({hits?.images.length ?? 0})
                </h3>
                {hits && hits.images.length > 0 ? (
                  hits.images.map((image) => (
                    <ImageCard
                      key={`${image.pageId}:${image.imagePath}`}
                      image={image}
                    />
                  ))
                ) : (
                  <p className="m-0 text-muted text-sm">No image hits.</p>
                )}
              </div>

              {hits?.children && hits.children.length > 0 ? (
                <details className="rounded border border-line bg-canvas p-3">
                  <summary className="cursor-pointer font-display text-ink text-sm">
                    Raw child hits ({hits.children.length})
                  </summary>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                    {hits.children.map((child) => (
                      <li
                        key={child.childId}
                        className="border-line border-t pt-2 first:border-t-0 first:pt-0"
                      >
                        <p className="m-0 font-mono text-muted text-xs">
                          {child.childId} · {child.pageId} · score{" "}
                          {scoreText(child.score)}
                        </p>
                        <pre className="m-0 mt-1 whitespace-pre-wrap break-words font-sans text-ink text-sm leading-snug">
                          {child.text}
                        </pre>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}

          <details className="rounded border border-line bg-canvas p-3">
            <summary className="cursor-pointer font-display text-ink text-sm">
              Raw JSON
            </summary>
            <pre className="m-0 mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-snug">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

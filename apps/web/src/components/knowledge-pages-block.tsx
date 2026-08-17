"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ApiError,
  getKnowledgePage,
  listKnowledgePages,
  UserQueryKey,
} from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function InspectPre({ text }: { text: string }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas p-2.5 font-mono text-ink text-xs leading-snug">
      {text === "" ? "(empty)" : text}
    </pre>
  );
}

function offsetLabel(
  startOffset: number | null,
  endOffset: number | null,
): string | null {
  if (startOffset == null && endOffset == null) return null;
  return `${startOffset ?? "?"}–${endOffset ?? "?"}`;
}

export function KnowledgePagesBlock({ actorApiKey }: { actorApiKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("page");

  const listQuery = useQuery({
    queryKey: UserQueryKey.KnowledgePages,
    queryFn: () => listKnowledgePages(actorApiKey),
  });

  const pageQuery = useQuery({
    queryKey: UserQueryKey.KnowledgePage(selectedId ?? ""),
    queryFn: () => {
      if (!selectedId) throw new Error("No page selected");
      return getKnowledgePage(actorApiKey, selectedId);
    },
    enabled: Boolean(selectedId),
  });

  const openPage = (id: string) => {
    router.push(`${pathname}?page=${encodeURIComponent(id)}`);
  };

  const backToList = () => {
    router.push(pathname);
  };

  if (selectedId) {
    const page = pageQuery.data;
    const err = pageQuery.isError ? errorMessage(pageQuery.error) : null;
    const heading = page?.title?.trim()
      ? page.title
      : (page?.slug ?? selectedId);

    return (
      <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded border border-line bg-transparent px-3 py-1.5 text-ink text-sm"
            onClick={backToList}
          >
            Back to pages
          </button>
        </div>
        {pageQuery.isLoading ? (
          <p className="m-0 text-muted text-sm">Loading page…</p>
        ) : null}
        {err ? <p className="m-0 text-danger text-sm">{err}</p> : null}
        {page ? (
          <>
            <h2 className="m-0 font-display text-ink text-lg">{heading}</h2>
            <dl className="m-0 grid gap-1.5 text-sm">
              <div>
                <dt className="m-0 text-muted">Slug</dt>
                <dd className="m-0 break-all font-mono text-ink text-xs">
                  {page.slug}
                </dd>
              </div>
              <div>
                <dt className="m-0 text-muted">Source path</dt>
                <dd className="m-0 break-all font-mono text-ink text-xs">
                  {page.sourcePath ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="m-0 text-muted">Content hash</dt>
                <dd className="m-0 break-all font-mono text-ink text-xs">
                  {page.contentHash}
                </dd>
              </div>
              <div>
                <dt className="m-0 text-muted">Type</dt>
                <dd className="m-0 text-ink">{page.type ?? "—"}</dd>
              </div>
              <div>
                <dt className="m-0 text-muted">Tags</dt>
                <dd className="m-0 text-ink">
                  {page.tags.length === 0 ? "—" : page.tags.join(", ")}
                </dd>
              </div>
              <div>
                <dt className="m-0 text-muted">Updated</dt>
                <dd className="m-0 font-mono text-ink text-xs">
                  {formatDateTime(page.updatedAt)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-col gap-1.5">
              <h3 className="m-0 font-display text-base text-ink">Body</h3>
              <InspectPre text={page.body} />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="m-0 font-display text-base text-ink">
                Parents ({page.parents.length})
              </h3>
              {page.parents.length === 0 ? (
                <p className="m-0 text-muted text-sm">No parents.</p>
              ) : (
                page.parents.map((parent) => {
                  const span = offsetLabel(
                    parent.startOffset,
                    parent.endOffset,
                  );
                  return (
                    <div
                      key={parent.id}
                      className="flex flex-col gap-2 rounded border border-line p-3"
                    >
                      <p className="m-0 font-mono text-muted text-xs">
                        Parent {parent.parentIndex}
                        {span ? ` · ${span}` : ""}
                      </p>
                      <InspectPre text={parent.text} />
                      <div className="flex flex-col gap-2 border-line border-l pl-3">
                        {parent.children.length === 0 ? (
                          <p className="m-0 text-muted text-sm">No children.</p>
                        ) : (
                          parent.children.map((child) => {
                            const childSpan = offsetLabel(
                              child.startOffset,
                              child.endOffset,
                            );
                            return (
                              <div
                                key={child.id}
                                className="flex flex-col gap-1.5"
                              >
                                <p className="m-0 font-mono text-muted text-xs">
                                  Child {child.childIndex}
                                  {childSpan ? ` · ${childSpan}` : ""}
                                  {" · "}
                                  {child.embedded ? "embedded" : "not embedded"}
                                  {child.embeddingModel
                                    ? ` · ${child.embeddingModel}`
                                    : ""}
                                  {child.embeddedAt
                                    ? ` · ${formatDateTime(child.embeddedAt)}`
                                    : ""}
                                </p>
                                <InspectPre text={child.text} />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  const err = listQuery.isError ? errorMessage(listQuery.error) : null;
  const pages = listQuery.data?.pages ?? [];

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Pages</h2>
      {listQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading pages…</p>
      ) : null}
      {err ? <p className="m-0 text-danger text-sm">{err}</p> : null}
      {!listQuery.isLoading && !err && pages.length === 0 ? (
        <p className="m-0 text-muted text-sm">
          No pages yet. Run Sync to ingest the corpus.
        </p>
      ) : null}
      {pages.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {pages.map((page) => {
            const label = page.title.trim() === "" ? page.slug : page.title;
            return (
              <li key={page.id} className="m-0">
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 rounded border border-line bg-canvas px-3 py-2.5 text-left hover:border-accent"
                  onClick={() => openPage(page.id)}
                >
                  <span className="font-display text-ink text-sm">{label}</span>
                  <span className="break-all font-mono text-muted text-xs">
                    {page.slug}
                  </span>
                  <span className="text-muted text-xs">
                    {page.sourcePath ?? "no source path"} ·{" "}
                    {formatDateTime(page.updatedAt)} · {page.parentCount}{" "}
                    parents · {page.childCount} children
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

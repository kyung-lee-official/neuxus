"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listKnowledgeBases, UserQueryKey } from "@/neuxus/lib/api";
import { useNeuxusToken } from "./neuxus-shell";
import { RetrievalTesterBlock } from "./retrieval-tester-block";

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Retrieval test page: pick any knowledge bases, then run evidence retrieval. */
export function RetrievalPanel({
  initialKnowledgeBaseIds,
}: {
  initialKnowledgeBaseIds: string[];
}) {
  const token = useNeuxusToken();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedIds, setSelectedIds] = useState(initialKnowledgeBaseIds);

  const basesQuery = useQuery({
    queryKey: UserQueryKey.KnowledgeBases,
    queryFn: () => listKnowledgeBases(token),
  });
  const bases = basesQuery.data ?? [];

  useEffect(() => {
    if (bases.length === 0) return;
    const known = new Set(bases.map((base) => base.id));
    setSelectedIds((current) => {
      const valid = current.filter((id) => known.has(id));
      if (valid.length > 0) {
        return sameIds(valid, current) ? current : valid;
      }
      const first = bases[0]?.id;
      return first ? [first] : current;
    });
  }, [bases]);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const id of selectedIds) params.append("kb", id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, selectedIds]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Retrieval</h1>
        <p className="m-0 text-muted text-sm">
          Pick any knowledge bases, then test the evidence retrieval that backs
          Ask against them.
        </p>
        {basesQuery.isLoading ? (
          <p className="m-0 text-muted text-sm">Loading knowledge bases…</p>
        ) : basesQuery.isError ? (
          <p className="m-0 text-danger text-sm">
            Could not load knowledge bases.
          </p>
        ) : bases.length === 0 ? (
          <p className="m-0 text-muted text-sm">
            No knowledge bases yet. Create one from the Knowledge base page.
          </p>
        ) : (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-sm">Knowledge bases</legend>
            <div className="flex flex-wrap gap-2">
              {bases.map((base) => (
                <label
                  key={base.id}
                  className="flex items-center gap-2 rounded border border-line bg-canvas px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(base.id)}
                    onChange={() => toggle(base.id)}
                  />
                  <span className="font-mono text-xs">{base.id}</span>
                  <span className="text-muted text-xs">{base.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      {selectedIds.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
          <p className="m-0 text-muted text-sm">
            Select at least one knowledge base to run retrieval.
          </p>
        </section>
      ) : (
        <RetrievalTesterBlock
          key={selectedIds.join(",")}
          actorApiKey={token}
          knowledgeBaseIds={selectedIds}
        />
      )}
    </div>
  );
}

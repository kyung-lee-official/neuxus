"use client";

import { useQuery } from "@tanstack/react-query";
import { listKnowledgeBases, UserQueryKey } from "@/lib/api";

/**
 * Admin knowledge-base picker. Lists `kb_knowledge_bases`; the selected id is
 * owned by the caller and threaded into the KB-scoped panels.
 */
export function KnowledgeBaseSelector({
  actorApiKey,
  selectedId,
  onSelect,
}: {
  actorApiKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: UserQueryKey.KnowledgeBases,
    queryFn: () => listKnowledgeBases(actorApiKey),
  });
  const bases = query.data ?? [];

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span>Knowledge base</span>
      <select
        className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
        value={selectedId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        disabled={query.isLoading || bases.length === 0}
      >
        {bases.length === 0 ? (
          <option value="">No knowledge bases</option>
        ) : null}
        {bases.map((base) => (
          <option key={base.id} value={base.id}>
            {base.name} ({base.id})
          </option>
        ))}
      </select>
      {query.isError ? (
        <span className="text-danger text-xs">
          Could not load knowledge bases.
        </span>
      ) : null}
    </label>
  );
}

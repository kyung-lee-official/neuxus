"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { listKnowledgeBases, UserQueryKey } from "@/lib/api";
import { useAdminUser } from "./admin-shell";
import { CorpusSettingsBlock } from "./corpus-settings-block";
import { KnowledgeBaseSelector } from "./knowledge-base-selector";
import { KnowledgePagesBlock } from "./knowledge-pages-block";

export function KnowledgeBasePanel() {
  const user = useAdminUser();
  const [kbId, setKbId] = useState<string | null>(null);

  const basesQuery = useQuery({
    queryKey: UserQueryKey.KnowledgeBases,
    queryFn: () => listKnowledgeBases(user.apiKey),
  });

  useEffect(() => {
    if (kbId) return;
    const first = basesQuery.data?.[0];
    if (first) setKbId(first.id);
  }, [kbId, basesQuery.data]);

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Knowledge base</h1>
        <p className="m-0 text-muted text-sm">
          Pick a knowledge base, then inspect ingested pages and manage its
          corpus.
        </p>
        <KnowledgeBaseSelector
          actorApiKey={user.apiKey}
          selectedId={kbId}
          onSelect={setKbId}
        />
      </section>
      {kbId ? (
        <>
          <CorpusSettingsBlock
            actorApiKey={user.apiKey}
            knowledgeBaseId={kbId}
          />
          <Suspense
            fallback={
              <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
                <p className="m-0 text-muted text-sm">Loading pages…</p>
              </section>
            }
          >
            <KnowledgePagesBlock
              actorApiKey={user.apiKey}
              knowledgeBaseId={kbId}
            />
          </Suspense>
        </>
      ) : (
        <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
          <p className="m-0 text-muted text-sm">
            No knowledge base found. Create one first.
          </p>
        </section>
      )}
    </div>
  );
}

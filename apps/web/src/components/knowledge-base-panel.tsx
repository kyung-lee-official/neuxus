"use client";

import { Suspense } from "react";
import { useAdminUser } from "./admin-shell";
import { CorpusSettingsBlock } from "./corpus-settings-block";
import { KnowledgePagesBlock } from "./knowledge-pages-block";

export function KnowledgeBasePanel() {
  const user = useAdminUser();

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Knowledge base</h1>
        <p className="m-0 text-muted text-sm">
          Inspect ingested pages: markdown body, parent and child chunks, and
          content hashes. Upload and re-embed come later.
        </p>
      </section>
      <CorpusSettingsBlock actorApiKey={user.apiKey} />
      <Suspense
        fallback={
          <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
            <p className="m-0 text-muted text-sm">Loading pages…</p>
          </section>
        }
      >
        <KnowledgePagesBlock actorApiKey={user.apiKey} />
      </Suspense>
    </div>
  );
}

export function KnowledgeBasePanel() {
  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Knowledge base</h1>
        <p className="m-0 text-muted text-sm">
          Inspect ingested pages: markdown body, parent and child chunks, and
          content hashes. Upload and re-embed come later.
        </p>
      </section>
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
        <h2 className="m-0 font-display text-ink text-lg">Pages</h2>
        <p className="m-0 text-muted text-sm">
          No pages API yet. This list will show slug, title, content hash, and
          updated time once listing is wired.
        </p>
      </section>
    </div>
  );
}

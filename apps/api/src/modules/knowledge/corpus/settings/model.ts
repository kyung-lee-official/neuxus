import { type Static, t } from "elysia";

const corpusFields = {
  repoUrl: t.Union([
    t.String({ examples: ["https://github.com/org/kb.git"] }),
    t.Null(),
  ]),
  branch: t.Union([t.String({ examples: ["main"] }), t.Null()]),
  docsRoot: t.Union([t.String({ examples: ["docs"] }), t.Null()]),
};

/** Schemas for the corpus settings routes (`kb_corpus_settings` id `default`). */
export const CorpusSettingsModel = {
  corpusBody: t.Object(corpusFields),
  corpusResponse: t.Object({
    ...corpusFields,
    lastSyncedSha: t.Union([t.String(), t.Null()]),
  }),
} as const;

export type CorpusSettingsModel = {
  [K in keyof typeof CorpusSettingsModel]: Static<
    (typeof CorpusSettingsModel)[K]
  >;
};

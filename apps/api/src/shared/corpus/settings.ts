import { getPrisma } from "../db.ts";
import {
  type CorpusSettingsRow,
  normalizeDocsRoot,
  type StoredCorpusSettings,
  storedCorpusSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** Upsert `kb_corpus_settings` id `default`. Empty strings stored as null. */
export async function saveCorpusSettings(
  row: CorpusSettingsRow,
): Promise<StoredCorpusSettings> {
  const repoUrl = blankToNull(row.repoUrl);
  const branch = blankToNull(row.branch);
  const docsRoot = normalizeDocsRoot(row.docsRoot) ?? null;

  await getPrisma().knowledgeCorpusSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      repoUrl,
      branch,
      docsRoot,
    },
    update: {
      repoUrl,
      branch,
      docsRoot,
    },
  });

  return loadCorpusSettings();
}

/** Record `last_synced_sha` after clone/pull. Does not change remote fields. */
export async function saveCorpusLastSyncedSha(
  sha: string,
): Promise<StoredCorpusSettings> {
  await getPrisma().knowledgeCorpusSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      lastSyncedSha: sha,
    },
    update: {
      lastSyncedSha: sha,
    },
  });
  return loadCorpusSettings();
}

/** Load `kb_corpus_settings` id `default`. Nulls stay null. */
export async function loadCorpusSettings(): Promise<StoredCorpusSettings> {
  const row = await getPrisma().knowledgeCorpusSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return storedCorpusSettings(null);
  return storedCorpusSettings({
    repoUrl: row.repoUrl,
    branch: row.branch,
    docsRoot: row.docsRoot,
    lastSyncedSha: row.lastSyncedSha,
  });
}

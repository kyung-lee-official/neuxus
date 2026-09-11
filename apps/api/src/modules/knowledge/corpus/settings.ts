import {
  findCorpusSettings,
  upsertCorpusLastSyncedSha,
  upsertCorpusRemoteSettings,
} from "./dal.ts";
import {
  type CorpusSettingsRow,
  normalizeDocsRoot,
  type StoredCorpusSettings,
  storedCorpusSettings,
} from "./defaults.ts";

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** Upsert `kb_corpus_settings` id `default`. Empty strings stored as null. */
export async function saveCorpusSettings(
  row: CorpusSettingsRow,
): Promise<StoredCorpusSettings> {
  await upsertCorpusRemoteSettings({
    repoUrl: blankToNull(row.repoUrl),
    branch: blankToNull(row.branch),
    docsRoot: normalizeDocsRoot(row.docsRoot) ?? null,
  });
  return loadCorpusSettings();
}

/** Record `last_synced_sha` after clone/pull. Does not change remote fields. */
export async function saveCorpusLastSyncedSha(
  sha: string,
): Promise<StoredCorpusSettings> {
  await upsertCorpusLastSyncedSha(sha);
  return loadCorpusSettings();
}

/** Load `kb_corpus_settings` id `default`. Nulls stay null. */
export async function loadCorpusSettings(): Promise<StoredCorpusSettings> {
  return storedCorpusSettings(await findCorpusSettings());
}

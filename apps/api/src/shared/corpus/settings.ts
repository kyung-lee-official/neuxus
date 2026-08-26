import { sql } from "bun";
import {
  type CorpusSettingsRow,
  normalizeDocsRoot,
  type StoredCorpusSettings,
  storedCorpusSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

type CorpusSettingsRowRaw = {
  repo_url: string | null;
  branch: string | null;
  docs_root: string | null;
  last_synced_sha: string | null;
};

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

  await sql`
    INSERT INTO kb_corpus_settings (
      id,
      repo_url,
      branch,
      docs_root,
      last_synced_sha
    )
    VALUES (
      ${SETTINGS_ID},
      ${repoUrl},
      ${branch},
      ${docsRoot},
      NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      repo_url = EXCLUDED.repo_url,
      branch = EXCLUDED.branch,
      docs_root = EXCLUDED.docs_root
  `;

  return loadCorpusSettings();
}

/** Record `last_synced_sha` after clone/pull. Does not change remote fields. */
export async function saveCorpusLastSyncedSha(
  sha: string,
): Promise<StoredCorpusSettings> {
  await sql`
    INSERT INTO kb_corpus_settings (id, last_synced_sha)
    VALUES (${SETTINGS_ID}, ${sha})
    ON CONFLICT (id) DO UPDATE SET
      last_synced_sha = EXCLUDED.last_synced_sha
  `;
  return loadCorpusSettings();
}

/** Load `kb_corpus_settings` id `default`. Nulls stay null. */
export async function loadCorpusSettings(): Promise<StoredCorpusSettings> {
  const rows = await sql<CorpusSettingsRowRaw[]>`
    SELECT repo_url, branch, docs_root, last_synced_sha
    FROM kb_corpus_settings
    WHERE id = ${SETTINGS_ID}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return storedCorpusSettings(null);
  return storedCorpusSettings({
    repoUrl: row.repo_url,
    branch: row.branch,
    docsRoot: row.docs_root,
    lastSyncedSha: row.last_synced_sha,
  });
}

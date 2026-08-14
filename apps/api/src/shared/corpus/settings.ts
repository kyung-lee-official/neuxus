import { db } from "../db.ts";
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

  await db()`
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

/** Load `kb_corpus_settings` id `default`. Nulls stay null. */
export async function loadCorpusSettings(): Promise<StoredCorpusSettings> {
  const rows = await db()`
    SELECT repo_url, branch, docs_root, last_synced_sha
    FROM kb_corpus_settings
    WHERE id = ${SETTINGS_ID}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return storedCorpusSettings(null);
  return storedCorpusSettings({
    repoUrl: typeof row.repo_url === "string" ? row.repo_url : null,
    branch: typeof row.branch === "string" ? row.branch : null,
    docsRoot: typeof row.docs_root === "string" ? row.docs_root : null,
    lastSyncedSha:
      typeof row.last_synced_sha === "string" ? row.last_synced_sha : null,
  });
}

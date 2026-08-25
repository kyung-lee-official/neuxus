/** Fallbacks when a sync walker reads a null column (not used to fill the admin form). */

export const CORPUS_DEFAULTS = {
  repoUrl: null as string | null,
  branch: "main",
  docsRoot: "",
  lastSyncedSha: null as string | null,
} as const;

export type CorpusSettingsRow = {
  repoUrl?: string | null;
  branch?: string | null;
  docsRoot?: string | null;
  lastSyncedSha?: string | null;
};

export type StoredCorpusSettings = {
  repoUrl: string | null;
  branch: string | null;
  docsRoot: string | null;
  lastSyncedSha: string | null;
};

export type ResolvedCorpusSettings = {
  repoUrl: string | null;
  branch: string;
  docsRoot: string;
  lastSyncedSha: string | null;
};

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

/** Trim and strip trailing slashes; empty becomes undefined. */
export function normalizeDocsRoot(
  value: string | null | undefined,
): string | undefined {
  const t = nonEmpty(value);
  if (t == null) return undefined;
  return t.replace(/\/+$/, "") || undefined;
}

/** Stored columns only — null stays null (admin GET/PUT). */
export function storedCorpusSettings(
  row?: CorpusSettingsRow | null,
): StoredCorpusSettings {
  return {
    repoUrl: nonEmpty(row?.repoUrl) ?? null,
    branch: nonEmpty(row?.branch) ?? null,
    docsRoot: normalizeDocsRoot(row?.docsRoot) ?? null,
    lastSyncedSha: nonEmpty(row?.lastSyncedSha) ?? null,
  };
}

export function resolveCorpusSettings(
  row?: CorpusSettingsRow | null,
): ResolvedCorpusSettings {
  return {
    repoUrl: nonEmpty(row?.repoUrl) ?? CORPUS_DEFAULTS.repoUrl,
    branch: nonEmpty(row?.branch) ?? CORPUS_DEFAULTS.branch,
    docsRoot: normalizeDocsRoot(row?.docsRoot) ?? CORPUS_DEFAULTS.docsRoot,
    lastSyncedSha:
      nonEmpty(row?.lastSyncedSha) ?? CORPUS_DEFAULTS.lastSyncedSha,
  };
}

/** Fallbacks when a corpus walker reads a null column (not used to fill the admin form). */

export const CORPUS_DEFAULTS = {
  repoUrl: null as string | null,
  branch: "main",
  lastSyncedSha: null as string | null,
} as const;

export type CorpusSettingsRow = {
  repoUrl?: string | null;
  branch?: string | null;
  lastSyncedSha?: string | null;
};

export type StoredCorpusSettings = {
  repoUrl: string | null;
  branch: string | null;
  lastSyncedSha: string | null;
};

export type ResolvedCorpusSettings = {
  repoUrl: string | null;
  branch: string;
  lastSyncedSha: string | null;
};

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

/** Apply `CORPUS_DEFAULTS` to a stored row (walker view). */
export function resolveCorpusSettings(
  row?: CorpusSettingsRow | null,
): ResolvedCorpusSettings {
  return {
    repoUrl: nonEmpty(row?.repoUrl) ?? CORPUS_DEFAULTS.repoUrl,
    branch: nonEmpty(row?.branch) ?? CORPUS_DEFAULTS.branch,
    lastSyncedSha:
      nonEmpty(row?.lastSyncedSha) ?? CORPUS_DEFAULTS.lastSyncedSha,
  };
}

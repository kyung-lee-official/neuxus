/**
 * Chunkify-settings domain. One row per knowledge base
 * (`kb_chunk_settings`, keyed by `knowledge_base_id`); nullable columns, with
 * code defaults in `CHUNKIFY_DEFAULTS` applied when a column is null.
 */

import {
  CHUNKIFY_DEFAULTS,
  type ChunkifyOptions,
  type ResolvedChunkifyOptions,
  resolveChunkifyOptions,
} from "../defaults.ts";
import {
  type ChunkSettingsRecord,
  findChunkSettings,
  upsertChunkSettings,
} from "./dal.ts";

export type ChunkSettingsRow = {
  childTargetTokens?: number | null;
  childHardMaxTokens?: number | null;
  childOverlapTokens?: number | null;
  childCrumbMinTokens?: number | null;
  parentMaxTokens?: number | null;
  fenceIntroGlueMaxTokens?: number | null;
  tokenizerEncoding?: string | null;
};

function positiveIntOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function encodingOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function storedChunkSettings(
  row?: ChunkSettingsRecord | null,
): ChunkSettingsRow {
  return {
    childTargetTokens: row?.childTargetTokens ?? null,
    childHardMaxTokens: row?.childHardMaxTokens ?? null,
    childOverlapTokens: row?.childOverlapTokens ?? null,
    childCrumbMinTokens: row?.childCrumbMinTokens ?? null,
    parentMaxTokens: row?.parentMaxTokens ?? null,
    fenceIntroGlueMaxTokens: row?.fenceIntroGlueMaxTokens ?? null,
    tokenizerEncoding: row?.tokenizerEncoding ?? null,
  };
}

function chunkifyOptionsFromRow(
  row?: ChunkSettingsRecord | null,
): ChunkifyOptions {
  if (!row) return {};
  return {
    childTargetTokens: row.childTargetTokens ?? undefined,
    childHardMaxTokens: row.childHardMaxTokens ?? undefined,
    childOverlapTokens: row.childOverlapTokens ?? undefined,
    childCrumbMinTokens: row.childCrumbMinTokens ?? undefined,
    parentMaxTokens: row.parentMaxTokens ?? undefined,
    fenceIntroGlueMaxTokens: row.fenceIntroGlueMaxTokens ?? undefined,
    tokenizerEncoding: row.tokenizerEncoding ?? undefined,
  };
}

export type AdminChunkSettings = ChunkSettingsRow & {
  defaults: ResolvedChunkifyOptions;
};

export abstract class ChunkifierSettings {
  /** Resolved knobs for one knowledge base (stored values or code defaults). */
  static async load(knowledgeBaseId: string): Promise<ResolvedChunkifyOptions> {
    return resolveChunkifyOptions(
      chunkifyOptionsFromRow(await findChunkSettings(knowledgeBaseId)),
    );
  }

  /** Stored values + code defaults, for the admin form. */
  static async loadAdmin(knowledgeBaseId: string): Promise<AdminChunkSettings> {
    return {
      ...storedChunkSettings(await findChunkSettings(knowledgeBaseId)),
      defaults: resolveChunkifyOptions(),
    };
  }

  /** Upsert the chunkify knobs for one knowledge base. Invalid values stored as null. */
  static async save(
    knowledgeBaseId: string,
    row: ChunkSettingsRow,
  ): Promise<ResolvedChunkifyOptions> {
    await upsertChunkSettings(knowledgeBaseId, {
      childTargetTokens: positiveIntOrNull(row.childTargetTokens),
      childHardMaxTokens: positiveIntOrNull(row.childHardMaxTokens),
      childOverlapTokens: positiveIntOrNull(row.childOverlapTokens),
      childCrumbMinTokens: positiveIntOrNull(row.childCrumbMinTokens),
      parentMaxTokens: positiveIntOrNull(row.parentMaxTokens),
      fenceIntroGlueMaxTokens: positiveIntOrNull(row.fenceIntroGlueMaxTokens),
      tokenizerEncoding: encodingOrNull(row.tokenizerEncoding),
    });
    return ChunkifierSettings.load(knowledgeBaseId);
  }

  /** Write `CHUNKIFY_DEFAULTS` into the row. */
  static async reset(knowledgeBaseId: string): Promise<AdminChunkSettings> {
    await ChunkifierSettings.save(knowledgeBaseId, {
      childTargetTokens: CHUNKIFY_DEFAULTS.childTargetTokens,
      childHardMaxTokens: CHUNKIFY_DEFAULTS.childHardMaxTokens,
      childOverlapTokens: CHUNKIFY_DEFAULTS.childOverlapTokens,
      childCrumbMinTokens: CHUNKIFY_DEFAULTS.childCrumbMinTokens,
      parentMaxTokens: CHUNKIFY_DEFAULTS.parentMaxTokens,
      fenceIntroGlueMaxTokens: CHUNKIFY_DEFAULTS.fenceIntroGlueMaxTokens,
      tokenizerEncoding: CHUNKIFY_DEFAULTS.tokenizerEncoding,
    });
    return ChunkifierSettings.loadAdmin(knowledgeBaseId);
  }
}

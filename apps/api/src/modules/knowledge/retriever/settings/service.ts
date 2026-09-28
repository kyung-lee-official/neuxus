/**
 * Retriever-settings domain. One row per knowledge base
 * (`kb_retrieve_settings`, keyed by `knowledge_base_id`); nullable columns,
 * with code defaults in `RETRIEVE_DEFAULTS` applied when a column is null.
 */

import { findRetrieveSettings, upsertRetrieveSettings } from "./dal.ts";
import {
  RETRIEVE_DEFAULTS,
  type ResolvedRetrieveOptions,
  resolveRetrieveOptions,
} from "./defaults.ts";

export type RetrieveSettingsRow = {
  childLimit?: number | null;
  maxParents?: number | null;
  maxCharacters?: number | null;
};

export type StoredRetrieveSettings = {
  childLimit: number | null;
  maxParents: number | null;
  maxCharacters: number | null;
};

function positiveIntOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function storedRetrieveSettings(
  row?: RetrieveSettingsRow | null,
): StoredRetrieveSettings {
  return {
    childLimit: positiveIntOrNull(row?.childLimit),
    maxParents: positiveIntOrNull(row?.maxParents),
    maxCharacters: positiveIntOrNull(row?.maxCharacters),
  };
}

export type AdminRetrieveSettings = StoredRetrieveSettings & {
  defaults: {
    childLimit: number;
    maxParents: number;
    maxCharacters: number;
  };
};

export abstract class RetrieverSettings {
  /** Resolved knobs for one knowledge base (stored values or code defaults). */
  static async load(knowledgeBaseId: string): Promise<ResolvedRetrieveOptions> {
    return resolveRetrieveOptions(await findRetrieveSettings(knowledgeBaseId));
  }

  /** Stored values + code defaults, for the admin form. */
  static async loadAdmin(
    knowledgeBaseId: string,
  ): Promise<AdminRetrieveSettings> {
    const stored = storedRetrieveSettings(
      await findRetrieveSettings(knowledgeBaseId),
    );
    return {
      ...stored,
      defaults: {
        childLimit: RETRIEVE_DEFAULTS.childLimit,
        maxParents: RETRIEVE_DEFAULTS.maxParents,
        maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
      },
    };
  }

  /** Upsert the retrieval settings for one knowledge base. Invalid values stored as null. */
  static async save(
    knowledgeBaseId: string,
    row: RetrieveSettingsRow,
  ): Promise<ResolvedRetrieveOptions> {
    await upsertRetrieveSettings(knowledgeBaseId, {
      childLimit: positiveIntOrNull(row.childLimit),
      maxParents: positiveIntOrNull(row.maxParents),
      maxCharacters: positiveIntOrNull(row.maxCharacters),
    });

    return RetrieverSettings.load(knowledgeBaseId);
  }

  /** Write `RETRIEVE_DEFAULTS` into the row. */
  static async reset(knowledgeBaseId: string): Promise<AdminRetrieveSettings> {
    await RetrieverSettings.save(knowledgeBaseId, {
      childLimit: RETRIEVE_DEFAULTS.childLimit,
      maxParents: RETRIEVE_DEFAULTS.maxParents,
      maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
    });
    return RetrieverSettings.loadAdmin(knowledgeBaseId);
  }
}

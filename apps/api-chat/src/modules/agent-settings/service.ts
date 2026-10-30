import {
  type AgentSettingsRow,
  type AgentSettingsUpdate,
  findAgentSettings,
  upsertAgentSettings,
} from "./dal.ts";

export const AGENT_SETTINGS_DEFAULTS = {
  maxToolIterations: 4,
  streamTimeoutMs: 300_000,
  runMaxAttempts: 2,
} as const;

export type AgentSettingsSnapshot = {
  deepseekApiKey: string;
  maxToolIterations: number;
  streamTimeoutMs: number;
  runMaxAttempts: number;
};

const initial: AgentSettingsSnapshot = {
  deepseekApiKey: "",
  ...AGENT_SETTINGS_DEFAULTS,
};

let current: AgentSettingsSnapshot = { ...initial };

function positiveOr(
  value: number | null | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function snapshotFromRow(row: AgentSettingsRow | null): AgentSettingsSnapshot {
  return {
    deepseekApiKey: row?.deepseekApiKey?.trim() ?? "",
    maxToolIterations: positiveOr(
      row?.maxToolIterations,
      AGENT_SETTINGS_DEFAULTS.maxToolIterations,
    ),
    streamTimeoutMs: positiveOr(
      row?.streamTimeoutMs,
      AGENT_SETTINGS_DEFAULTS.streamTimeoutMs,
    ),
    runMaxAttempts: positiveOr(
      row?.runMaxAttempts,
      AGENT_SETTINGS_DEFAULTS.runMaxAttempts,
    ),
  };
}

export type AgentSettingsView = {
  hasDeepseekApiKey: boolean;
  maxToolIterations: number;
  streamTimeoutMs: number;
  runMaxAttempts: number;
  defaults: typeof AGENT_SETTINGS_DEFAULTS;
};

function viewFromSnapshot(snapshot: AgentSettingsSnapshot): AgentSettingsView {
  return {
    hasDeepseekApiKey: snapshot.deepseekApiKey !== "",
    maxToolIterations: snapshot.maxToolIterations,
    streamTimeoutMs: snapshot.streamTimeoutMs,
    runMaxAttempts: snapshot.runMaxAttempts,
    defaults: AGENT_SETTINGS_DEFAULTS,
  };
}

export abstract class AgentSettings {
  /** Current process cache; tools and workers read this synchronously. */
  static current(): AgentSettingsSnapshot {
    return current;
  }

  static view(): AgentSettingsView {
    return viewFromSnapshot(current);
  }

  /** Load the singleton row; missing values use code defaults. */
  static async load(): Promise<AgentSettingsView> {
    const row = await findAgentSettings();
    current = snapshotFromRow(row);
    return viewFromSnapshot(current);
  }

  /** Upsert settings. `undefined` keeps a field; `null` clears it. */
  static async save(input: {
    deepseekApiKey?: string | null;
    maxToolIterations?: number | null;
    streamTimeoutMs?: number | null;
    runMaxAttempts?: number | null;
  }): Promise<AgentSettingsView> {
    const data: AgentSettingsUpdate = {};

    if (input.deepseekApiKey !== undefined) {
      const key = input.deepseekApiKey?.trim() ?? "";
      data.deepseekApiKey = key === "" ? null : key;
    }
    if (input.maxToolIterations !== undefined) {
      data.maxToolIterations = input.maxToolIterations ?? null;
    }
    if (input.streamTimeoutMs !== undefined) {
      data.streamTimeoutMs = input.streamTimeoutMs ?? null;
    }
    if (input.runMaxAttempts !== undefined) {
      data.runMaxAttempts = input.runMaxAttempts ?? null;
    }

    const row = await upsertAgentSettings(data);
    current = snapshotFromRow(row);
    return viewFromSnapshot(current);
  }
}

/** Test seam for in-memory tool availability and budget checks. */
export function setAgentSettingsForTests(
  overrides: Partial<AgentSettingsSnapshot>,
): void {
  current = { ...current, ...overrides };
}

export function resetAgentSettingsForTests(): void {
  current = { ...initial };
}

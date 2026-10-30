import { getPrisma } from "../../shared/db.ts";

export type AgentSettingsRow = {
  deepseekApiKey: string | null;
  maxToolIterations: number | null;
  streamTimeoutMs: number | null;
  runMaxAttempts: number | null;
};

export type AgentSettingsUpdate = {
  deepseekApiKey?: string | null;
  maxToolIterations?: number | null;
  streamTimeoutMs?: number | null;
  runMaxAttempts?: number | null;
};

export async function findAgentSettings(): Promise<AgentSettingsRow | null> {
  const row = await getPrisma().agentSettings.findUnique({
    where: { id: "default" },
  });
  if (!row) return null;
  return {
    deepseekApiKey: row.deepseekApiKey,
    maxToolIterations: row.maxToolIterations,
    streamTimeoutMs: row.streamTimeoutMs,
    runMaxAttempts: row.runMaxAttempts,
  };
}

export async function upsertAgentSettings(
  data: AgentSettingsUpdate,
): Promise<AgentSettingsRow> {
  const row = await getPrisma().agentSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  return {
    deepseekApiKey: row.deepseekApiKey,
    maxToolIterations: row.maxToolIterations,
    streamTimeoutMs: row.streamTimeoutMs,
    runMaxAttempts: row.runMaxAttempts,
  };
}

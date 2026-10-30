import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { AgentSettingsModel } from "./model.ts";
import { AgentSettings } from "./service.ts";

/** Admin-only agent configuration, stored in `agent_settings`. */
export const agentSettings = new Elysia({ prefix: "/agent-settings" })
  .use(auth)
  .get("/", () => AgentSettings.view(), {
    requireAdmin: true,
    response: AgentSettingsModel.response,
    detail: {
      tags: [API_TAGS.agentSettings],
      summary: "Read agent settings",
      description:
        "Returns resolved budgets and whether a DeepSeek API key is stored. The key itself is never returned.",
      security: [bearerSecurity],
    },
  })
  .put("/", ({ body }) => AgentSettings.save(body), {
    requireAdmin: true,
    body: AgentSettingsModel.updateBody,
    response: AgentSettingsModel.response,
    detail: {
      tags: [API_TAGS.agentSettings],
      summary: "Update agent settings",
      description:
        "Omit the API key to keep it, send an empty string or null to clear it. Null numeric fields fall back to code defaults.",
      security: [bearerSecurity],
    },
  });

import { openapi } from "@elysia/openapi";
import { cors } from "@elysiajs/cors";
import { Elysia, status } from "elysia";
import { agentRuns } from "./modules/agent-runs/route.ts";
import { startAgentRunWorker } from "./modules/agent-runs/worker.ts";
import { health } from "./modules/health/route.ts";
import { knowledgeBases } from "./modules/knowledge-bases/route.ts";
import { Logger, LogSettings, PostgresTransport } from "./modules/log/index.ts";
import { logRoutes } from "./modules/log/route.ts";
import { chatSessions } from "./modules/personal-data/chat-sessions/route.ts";
import { query } from "./modules/query/route.ts";
import { users } from "./modules/users/route.ts";
import { serverPort } from "./shared/config.ts";
import { apiTagList, bearerSecurityScheme } from "./shared/openapi.ts";

const logSettings = await LogSettings.load();
const usePostgres = logSettings.sinks.includes("postgres");
if (usePostgres) {
  Logger.setTransport(
    new PostgresTransport({ capacity: logSettings.queueSize }),
  );
}

const app = new Elysia()
  .use(
    openapi({
      documentation: {
        info: {
          title: "neuxus chat API",
          version: "0.0.1",
          description:
            "Stateful chat adapter for neuxus. Owns users, sessions, messages, and personal memory, and calls the stateless neuxus API for knowledge-base-enriched synthesis.",
        },
        tags: apiTagList,
        components: {
          securitySchemes: {
            Bearer: bearerSecurityScheme,
          },
        },
      },
    }),
  )
  .use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .onError(({ code, error, request }) => {
    if (code === "PARSE") {
      return status(400, { error: "Invalid JSON body" });
    }
    if (code === "NOT_FOUND") {
      return status(404, { error: "Not found" });
    }
    if (code === "VALIDATION") {
      return status(400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (error instanceof Error) {
      const path = new URL(request.url).pathname;
      console.error(`[http:${code}] ${request.method} ${path}`, error);
      return status(500, {
        error: error.message || "Internal Server Error",
      });
    }
  })
  .use(health)
  .use(query)
  .use(agentRuns)
  .use(knowledgeBases)
  .use(chatSessions)
  .use(users)
  .use(logRoutes)
  .listen(serverPort());

await startAgentRunWorker();

if (usePostgres) {
  Logger.startWorker();
  Logger.installShutdownHandlers(logSettings.drainTimeoutMs);
}

console.log(
  `neuxus chat API listening on http://localhost:${app.server?.port}`,
);
console.log(`OpenAPI docs: http://localhost:${app.server?.port}/openapi`);
console.log(`OpenAPI spec: http://localhost:${app.server?.port}/openapi/json`);
console.log(
  "Users: GET/POST /users, GET/PATCH/DELETE /users/:id, GET /users/:id/data, GET /users/:id/logs, DELETE /users/:id/memories/:memoryId",
);
console.log("Sessions: GET/POST /sessions, PATCH/DELETE /sessions/:id");
console.log("Knowledge bases: GET /knowledge-bases (proxied from neuxus)");
console.log("Memory: POST /remember");
console.log("Query: POST /query (JSON), POST /query/stream (SSE)");
console.log(
  "Durable runs: POST /query/async; GET /query/runs/:id, /query/runs/:id/events",
);
console.log("Log: GET/PUT /log/settings; POST /log/settings/reset, /log/purge");

export type App = typeof app;
export default app;

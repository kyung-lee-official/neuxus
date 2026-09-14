import { openapi } from "@elysia/openapi";
import { cors } from "@elysiajs/cors";
import { Elysia, status } from "elysia";
import { health } from "./modules/health/index.ts";
import { knowledge } from "./modules/knowledge/index.ts";
import { Logger, LogSettings, PostgresTransport } from "./modules/log/index.ts";
import { logRoutes } from "./modules/log/routes.ts";
import { modelProviders } from "./modules/model-providers/index.ts";
import { chatSessions } from "./modules/personal-data/chat-sessions/index.ts";
import { query } from "./modules/query/index.ts";
import { serverSetting } from "./modules/server-setting/index.ts";
import { users } from "./modules/users/index.ts";
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
          title: "neuxus API",
          version: "0.0.1",
          description:
            "Bun + Elysia HTTP API for neuxus: users, sessions, ask-mode chat, knowledge base, and admin server settings.",
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
  .use(knowledge)
  .use(modelProviders)
  .use(logRoutes)
  .use(serverSetting)
  .use(query)
  .use(chatSessions)
  .use(users)
  .listen(serverPort());

if (usePostgres) {
  Logger.startWorker();
  Logger.installShutdownHandlers(logSettings.drainTimeoutMs);
}

console.log(`neuxus API listening on http://localhost:${app.server?.port}`);
console.log(`OpenAPI docs: http://localhost:${app.server?.port}/openapi`);
console.log(`OpenAPI spec: http://localhost:${app.server?.port}/openapi/json`);
console.log(
  "User CRUD: GET/POST /users, GET/PATCH/DELETE /users/:id, GET /users/:id/data, GET /users/:id/logs, DELETE /users/:id/memories/:memoryId",
);
console.log(
  "Sessions: GET/POST /sessions, PATCH /sessions/:id; POST /query accepts body.sessionId",
);
console.log("Knowledge: GET /knowledge/pages, GET /knowledge/pages/*");
console.log(
  "Corpus: GET/PUT /knowledge/corpus/settings; POST /knowledge/corpus/clone, /knowledge/corpus/pull, /knowledge/corpus/chunkify, /knowledge/corpus/embed, /knowledge/corpus/sync; GET /knowledge/corpus/events",
);
console.log(
  "Retriever: GET/PUT /knowledge/retriever/settings; POST /knowledge/retriever/settings/reset",
);
console.log(
  "Model providers: GET /model-providers/providers, GET/PUT/DELETE /model-providers/providers/:providerId/connection, POST /model-providers/providers/:providerId/test/embed|chat|image",
);
console.log("Log: GET/PUT /log/settings; POST /log/settings/reset, /log/purge");
console.log(
  "Server setting: GET/PUT /server-setting/task-model-map; POST /server-setting/nuke",
);

export type App = typeof app;
export default app;

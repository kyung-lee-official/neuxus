import { cors } from "@elysiajs/cors";
import { Elysia, status } from "elysia";
import logixlysia from "logixlysia";
import { health } from "./modules/health/index.ts";
import { knowledge } from "./modules/knowledge/index.ts";
import { query } from "./modules/query/index.ts";
import { serverSetting } from "./modules/server-setting/index.ts";
import { sessions } from "./modules/sessions/index.ts";
import { users } from "./modules/users/index.ts";
import { serverPort } from "./shared/config.ts";
import {
  getLogTransport,
  installShutdownHandlers,
  loadLogSettings,
  PostgresTransport,
  setLogTransport,
  startLogWorker,
} from "./shared/log/index.ts";

const logSettings = await loadLogSettings();
const usePostgres = logSettings.sinks.includes("postgres");
if (usePostgres) {
  setLogTransport(new PostgresTransport({ capacity: logSettings.queueSize }));
}

const app = new Elysia()
  .use(
    logixlysia({
      config: {
        service: "neuxus-api",
        showStartupMessage: false,
        showContextTree: false,
        contextDepth: 0,
        slowThreshold: 500,
        verySlowThreshold: 1000,
        timestamp: { translateTime: "yyyy-mm-dd HH:MM:ss.SSS" },
        ip: true,
        pino: logSettings.pretty ? { prettyPrint: true } : undefined,
        transports: usePostgres ? [getLogTransport()] : [],
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
  .onError(({ code, error }) => {
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
  })
  .use(health)
  .use(knowledge)
  .use(serverSetting)
  .use(query)
  .use(sessions)
  .use(users)
  .listen(serverPort());

if (usePostgres) {
  startLogWorker();
  installShutdownHandlers(logSettings.drainTimeoutMs);
}

console.log(`neuxus API listening on http://localhost:${app.server?.port}`);
console.log(
  "User CRUD: GET/POST /users, GET/PATCH/DELETE /users/:id, GET /users/:id/data, DELETE /users/:id/memories/:memoryId",
);
console.log(
  "Sessions: GET/POST /sessions, PATCH /sessions/:id; POST /query accepts body.sessionId",
);
console.log("Knowledge: GET /knowledge/pages, GET /knowledge/pages/*");
console.log(
  "Server setting: GET/PUT /server-setting/embed, /synthesis, /corpus, /log; POST /embed/reset, /synthesis/reset, /log/reset, /corpus/clone, /corpus/pull, /corpus/chunkify, /corpus/embed, /corpus/sync; GET /corpus/events; POST /nuke",
);

export type App = typeof app;
export default app;

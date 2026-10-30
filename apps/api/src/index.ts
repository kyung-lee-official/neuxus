import { openapi } from "@elysia/openapi";
import { cors } from "@elysiajs/cors";
import { Elysia, status } from "elysia";
import { health } from "./modules/health/route.ts";
import { knowledge } from "./modules/knowledge/route.ts";
import { Logger, LogSettings, PostgresTransport } from "./modules/log/index.ts";
import { logRoutes } from "./modules/log/route.ts";
import { messages } from "./modules/messages/route.ts";
import { modelProviders } from "./modules/model-providers/route.ts";
import { models } from "./modules/models/route.ts";
import { retrieve } from "./modules/retrieve/route.ts";
import { serverSetting } from "./modules/server-setting/route.ts";
import { serverPort } from "./shared/config.ts";
import { apiTagList, bearerSecurityScheme } from "./shared/openapi.ts";
import {
  ProtocolError,
  protocolErrorBody,
  requestIdFrom,
} from "./shared/protocol.ts";

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
            "Bun + Elysia HTTP API for the neuxus: knowledge base, model providers, logs, and server settings. neuxus routes authenticate with a service token.",
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
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-api-key",
        "anthropic-version",
        "anthropic-beta",
        "X-Neuxus-Knowledge-Base",
        "X-Neuxus-Extensions",
        "X-Request-Id",
      ],
      exposeHeaders: ["X-Request-Id", "X-Neuxus-Code"],
    }),
  )
  .onRequest(({ request, set }) => {
    set.headers["X-Request-Id"] = requestIdFrom(request);
  })
  .onError(({ code, error, request, set }) => {
    set.headers["X-Request-Id"] = requestIdFrom(request);
    const path = new URL(request.url).pathname;
    const protocolPath = path === "/retrieve" || path.startsWith("/v1/");

    if (error instanceof ProtocolError) {
      set.headers["X-Neuxus-Code"] = error.code;
      return status(error.statusCode, protocolErrorBody(error));
    }
    if (code === "PARSE") {
      if (protocolPath) {
        set.headers["X-Neuxus-Code"] = "invalid_request";
        return status(400, {
          type: "error" as const,
          error: {
            type: "invalid_request_error" as const,
            message: "Invalid JSON body",
          },
        });
      }
      return status(400, { error: "Invalid JSON body" });
    }
    if (code === "NOT_FOUND") {
      return status(404, { error: "Not found" });
    }
    if (code === "VALIDATION") {
      if (protocolPath) {
        set.headers["X-Neuxus-Code"] = "invalid_request";
        return status(400, {
          type: "error" as const,
          error: {
            type: "invalid_request_error" as const,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
      return status(400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (error instanceof Error) {
      console.error(`[http:${code}] ${request.method} ${path}`, error);
      if (protocolPath) {
        set.headers["X-Neuxus-Code"] = "internal_error";
        return status(500, {
          type: "error" as const,
          error: {
            type: "api_error" as const,
            message: "Internal Server Error",
          },
        });
      }
      return status(500, {
        error: error.message || "Internal Server Error",
      });
    }
  })
  .use(health)
  .use(messages)
  .use(retrieve)
  .use(models)
  .use(knowledge)
  .use(modelProviders)
  .use(logRoutes)
  .use(serverSetting)
  .listen(serverPort());

if (usePostgres) {
  Logger.startWorker();
  Logger.installShutdownHandlers(logSettings.drainTimeoutMs);
}

console.log(`neuxus API listening on http://localhost:${app.server?.port}`);
console.log(`OpenAPI docs: http://localhost:${app.server?.port}/openapi`);
console.log(`OpenAPI spec: http://localhost:${app.server?.port}/openapi/json`);
console.log("neuxus routes require NEUXUS_SERVICE_TOKEN.");
console.log(
  "Protocol: POST /v1/messages, POST /retrieve, GET /v1/models; GET /knowledge-bases",
);
console.log("Knowledge: GET /knowledge/pages, GET /knowledge/pages/*");
console.log(
  "Corpus: GET/PUT /knowledge/corpus/settings; POST /knowledge/corpus/clone, /knowledge/corpus/pull, /knowledge/corpus/chunkify, /knowledge/corpus/embed; GET /knowledge/corpus/events",
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

import { openapi } from "@elysia/openapi";
import { cors } from "@elysiajs/cors";
import { Elysia, status } from "elysia";
import { health } from "./modules/health/route.ts";
import { serverPort } from "./shared/config.ts";
import { apiTagList, bearerSecurityScheme } from "./shared/openapi.ts";

const app = new Elysia()
  .use(
    openapi({
      documentation: {
        info: {
          title: "neuxus chat API",
          version: "0.0.1",
          description:
            "Stateful chat adapter for neuxus. Owns sessions, messages, memory, and end-user identity; calls the stateless neuxus core.",
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
  .listen(serverPort());

console.log(
  `neuxus chat API listening on http://localhost:${app.server?.port}`,
);
console.log(`OpenAPI docs: http://localhost:${app.server?.port}/openapi`);
console.log(`OpenAPI spec: http://localhost:${app.server?.port}/openapi/json`);

export type App = typeof app;
export default app;

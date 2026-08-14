import { cors } from "@elysiajs/cors";
import { Elysia, status } from "elysia";
import { health } from "./modules/health/index.ts";
import { query } from "./modules/query/index.ts";
import { serverSetting } from "./modules/server-setting/index.ts";
import { sessions } from "./modules/sessions/index.ts";
import { users } from "./modules/users/index.ts";
import { serverPort } from "./shared/config.ts";

const app = new Elysia()
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
  .use(serverSetting)
  .use(query)
  .use(sessions)
  .use(users)
  .listen(serverPort());

console.log(`neuxus API listening on http://localhost:${app.server?.port}`);
console.log(
  "User CRUD: GET/POST /users, GET/PATCH/DELETE /users/:id, GET /users/:id/data, DELETE /users/:id/memories/:memoryId",
);
console.log(
  "Sessions: GET/POST /sessions, PATCH /sessions/:id; POST /query accepts body.sessionId",
);
console.log(
  "Server setting: GET/PUT /server-setting/embed, /server-setting/synthesis, /server-setting/corpus; POST /server-setting/corpus/clone, /corpus/pull, /nuke",
);

export type App = typeof app;
export default app;

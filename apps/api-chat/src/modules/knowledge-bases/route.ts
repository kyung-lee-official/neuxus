import { Elysia, status } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import {
  listCoreKnowledgeBases,
  NeuxusClientError,
} from "../query/core-client.ts";

/** Knowledge bases available to the signed-in chat user. */
export const knowledgeBases = new Elysia({ prefix: "/knowledge-bases" })
  .use(auth)
  .get(
    "/",
    async () => {
      try {
        return { knowledgeBases: await listCoreKnowledgeBases() };
      } catch (err) {
        if (err instanceof NeuxusClientError) {
          const code =
            err.status === 401 || err.status === 403 ? 502 : err.status;
          throw status(code, { error: err.message });
        }
        const message = err instanceof Error ? err.message : String(err);
        throw status(502, { error: message });
      }
    },
    {
      requireUser: true,
      detail: {
        tags: [API_TAGS.knowledgeBases],
        summary: "List knowledge bases from neuxus",
        security: [bearerSecurity],
      },
    },
  );

import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { Knowledge } from "./service.ts";

export const knowledge = new Elysia({ prefix: "/knowledge" })
  .use(auth)
  .get("/pages", () => Knowledge.listPages(), {
    requireAdmin: true,
  })
  .get("/pages/*", ({ params }) => Knowledge.getPage(params["*"]), {
    requireAdmin: true,
  });

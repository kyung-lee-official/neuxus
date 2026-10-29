import { Elysia } from "elysia";
import { NeuxusAuth } from "./service.ts";

/** neuxus routes authenticate with a service token, never an end-user account. */
export const serviceAuth = new Elysia({ name: "NeuxusAuth.Service" }).macro({
  requireService: {
    async resolve({ headers }) {
      if (!NeuxusAuth.isValid(headers)) return NeuxusAuth.unauthorized();
      return {};
    },
  },
});

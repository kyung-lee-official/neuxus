import { Elysia } from "elysia";
import { Auth } from "./service.ts";

/** Request-scoped auth macros — explicit `.use(auth)` on modules that need them. */
export const auth = new Elysia({ name: "Auth.Service" }).macro({
  requireUser: {
    async resolve({ headers }) {
      const user = await Auth.resolveUserFromHeaders(headers);
      if (!user) return Auth.unauthorized();
      return { user };
    },
  },
  requireAdmin: {
    async resolve({ headers }) {
      const user = await Auth.resolveUserFromHeaders(headers);
      if (!user) return Auth.unauthorized();
      if (user.role !== "admin") return Auth.forbidden();
      return { user };
    },
  },
});

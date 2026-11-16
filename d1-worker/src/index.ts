
import { handleRoutes } from "./routes/index.js";
import type { Env } from "./routes/index.js";

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    return handleRoutes(request, env);
  }
};

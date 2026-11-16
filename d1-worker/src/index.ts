
import { handleRoutes } from "./routes/index.js";
import type { Env as RoutesEnv } from "./routes/index.js";
import {
  handleCors,
  addCorsHeaders
} from "./lib/cors.js";

interface Env extends RoutesEnv {
  ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const corsResponse = handleCors(request, env);

    if (corsResponse) {
      return corsResponse;
    }

    const response = await handleRoutes(request, env);

    return addCorsHeaders(response, request, env);
  }
};

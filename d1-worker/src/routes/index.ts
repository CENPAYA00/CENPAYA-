
import { Router } from "../lib/router.js";
import { healthHandler } from "./health.js";

export interface Env {
  DB: D1Database;
}

const router = new Router<Env>();

router.get("/health", healthHandler);

export function handleRoutes(
  request: Request,
  env: Env
): Promise<Response> {
  return router.handle(request, env);
}

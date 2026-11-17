
export interface Env {
  DB: D1Database;

  // Comma-separated list of trusted website origins.
  ALLOWED_ORIGINS?: string;
}

import { Env } from "./env.js";
import { bearerToken } from "./http-utils.js";
import { signSupabaseUserJwt, verifyD1IdentityAssertionClaims } from "./jwt.js";
import { createUserSupabaseClient } from "./supabase.js";

export class IdentityError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "IdentityError";
  }
}

export interface AuthenticatedIdentity {
  userId: string;
  supabase: ReturnType<typeof createUserSupabaseClient>;
}

const IDENTITY_ASSERTION_URL = "https://d1-identity.internal/internal/v1/identity/assert";
const IDENTITY_TIMEOUT_MS = 4_000;

export async function authenticateD1Session(request: Request, env: Env): Promise<AuthenticatedIdentity> {
  const sessionToken = bearerToken(request);
  if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256) {
    throw new IdentityError("unauthorized", 401);
  }

  if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET || !env.D1_TO_SUPABASE_HMAC_SECRET) {
    throw new IdentityError("identity_service_not_configured", 503);
  }

  let assertionResponse: Response;
  try {
    assertionResponse = await env.D1_IDENTITY.fetch(IDENTITY_ASSERTION_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + sessionToken,
        "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });
  } catch {
    throw new IdentityError("identity_service_unavailable", 503);
  }

  if (assertionResponse.status === 401 || assertionResponse.status === 403) {
    throw new IdentityError("unauthorized", 401);
  }
  if (!assertionResponse.ok) throw new IdentityError("identity_service_unavailable", 503);

  let assertion: string | undefined;
  try {
    const payload = await assertionResponse.json() as { assertion?: unknown };
    if (typeof payload.assertion === "string") assertion = payload.assertion;
  } catch {
    throw new IdentityError("invalid_identity_response", 503);
  }
  if (!assertion) throw new IdentityError("invalid_identity_response", 503);

  let verifiedAssertion: { userId: string; jti: string; expiresAt: number };
  try {
    verifiedAssertion = await verifyD1IdentityAssertionClaims(assertion, env.D1_TO_SUPABASE_HMAC_SECRET);
  } catch {
    throw new IdentityError("unauthorized", 401);
  }

  // Consume the signed assertion once in D1. A replayed token is rejected even
  // during the allowed clock-skew window.
  let consumeResponse: Response;
  try {
    consumeResponse = await env.D1_IDENTITY.fetch("https://d1-identity.internal/internal/v1/identity/consume", {
      method: "POST",
      headers: {
        "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jti: verifiedAssertion.jti, expires_at: verifiedAssertion.expiresAt }),
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });
  } catch {
    throw new IdentityError("identity_service_unavailable", 503);
  }
  if (consumeResponse.status === 409) throw new IdentityError("unauthorized", 401);
  if (!consumeResponse.ok) throw new IdentityError("identity_service_unavailable", 503);

  const userId = verifiedAssertion.userId;
  let userJwt: string;
  try {
    userJwt = await signSupabaseUserJwt(userId, env);
  } catch {
    throw new IdentityError("supabase_jwt_not_configured", 503);
  }

  let supabase: ReturnType<typeof createUserSupabaseClient>;
  try {
    supabase = createUserSupabaseClient(env, userJwt);
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .abortSignal(AbortSignal.timeout(4_000))
      .maybeSingle();

    if (error) throw new IdentityError("financial_identity_lookup_failed", 503);
    if (!data || data.id !== userId) throw new IdentityError("financial_identity_not_linked", 403);
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError("financial_identity_lookup_failed", 503);
  }

  return { userId, supabase };
}

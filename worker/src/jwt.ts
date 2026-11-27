const encoder = new TextEncoder();
const UUID_RE = /^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export interface D1IdentityClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

export type SupabaseJwtAlgorithm = "HS256" | "RS256" | "ES256";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeJsonSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
}

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("weak_hmac_secret");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function signHmacJwt(
  claims: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = header + "." + payload;
  const key = await hmacKey(secret, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)));
  return signingInput + "." + base64UrlEncode(signature);
}

export async function verifyHs256Jwt(token: string, secret: string): Promise<Record<string, unknown>> {
  if (token.length > 8192) throw new Error("invalid_signed_token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("invalid_signed_token");
  const header = decodeJsonSegment<{ alg?: string; typ?: string }>(parts[0]);
  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("invalid_signed_token_algorithm");
  const key = await hmacKey(secret, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC", key, asArrayBuffer(base64UrlDecode(parts[2])), encoder.encode(parts[0] + "." + parts[1]),
  );
  if (!valid) throw new Error("invalid_signed_token_signature");
  const claims = decodeJsonSegment<Record<string, unknown>>(parts[1]);
  if (typeof claims.exp === "number" && claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("signed_token_expired");
  }
  return claims;
}

export async function verifyD1IdentityAssertionClaims(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ userId: string; jti: string; expiresAt: number }> {
  if (token.length > 4096) throw new Error("invalid_assertion");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("invalid_assertion");

  const header = decodeJsonSegment<{ alg?: string; typ?: string }>(parts[0]);
  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("invalid_assertion_algorithm");

  const signingInput = parts[0] + "." + parts[1];
  const key = await hmacKey(secret, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    asArrayBuffer(base64UrlDecode(parts[2])),
    encoder.encode(signingInput),
  );
  if (!valid) throw new Error("invalid_assertion_signature");

  const claims = decodeJsonSegment<Partial<D1IdentityClaims>>(parts[1]);
  if (
    claims.iss !== "cenpaya-d1-worker" ||
    claims.aud !== "cenpaya-supabase-worker" ||
    typeof claims.sub !== "string" ||
    !UUID_RE.test(claims.sub) ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    typeof claims.jti !== "string" ||
    claims.jti.length < 16 ||
    claims.jti.length > 200
  ) {
    throw new Error("invalid_assertion_claims");
  }

  const issuedAt = claims.iat as number;
  const expiresAt = claims.exp as number;
  // Workers can have small clock differences and service-binding requests can be delayed.
  // Keep the assertion short-lived, but tolerate at most 15 seconds of skew on either side.
  const CLOCK_SKEW_SECONDS = 15;
  const MAX_ASSERTION_LIFETIME_SECONDS = 120;
  if (
    issuedAt > nowSeconds + CLOCK_SKEW_SECONDS ||
    expiresAt <= nowSeconds - CLOCK_SKEW_SECONDS ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_ASSERTION_LIFETIME_SECONDS ||
    nowSeconds - issuedAt > MAX_ASSERTION_LIFETIME_SECONDS + CLOCK_SKEW_SECONDS
  ) {
    throw new Error("invalid_assertion_time");
  }

  return { userId: claims.sub, jti: claims.jti, expiresAt };
}

export async function verifyD1IdentityAssertion(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return (await verifyD1IdentityAssertionClaims(token, secret, nowSeconds)).userId;
}

function parsePrivateJwk(raw: string): JsonWebKey & { kid?: string; d?: string } {
  const jwk = JSON.parse(raw) as JsonWebKey & { kid?: string; d?: string };
  if (!jwk || typeof jwk !== "object" || !jwk.d) throw new Error("invalid_supabase_private_jwk");
  return jwk;
}

async function signSupabaseJwt(
  subject: string,
  role: "authenticated" | "cenpaya_payment_worker",
  env: {
    SUPABASE_JWT_ALGORITHM?: string;
    SUPABASE_JWT_SECRET?: string;
    SUPABASE_JWT_PRIVATE_JWK?: string;
    SUPABASE_JWT_KID?: string;
  },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!UUID_RE.test(subject)) throw new Error("invalid_user_id");
  const algorithm = (env.SUPABASE_JWT_ALGORITHM || "").toUpperCase() as SupabaseJwtAlgorithm;
  if (!["HS256", "RS256", "ES256"].includes(algorithm)) {
    throw new Error("supabase_jwt_algorithm_not_configured");
  }

  // The database project does not permit creating custom Postgres roles.
  // Payment-worker JWTs therefore use the existing authenticated role plus
  // a private, Worker-signed app_metadata claim checked inside privileged RPCs.
  const claims = {
    aud: "authenticated",
    role: "authenticated",
    ...(role === "cenpaya_payment_worker"
      ? { app_metadata: { cenpaya_payment_worker: true } }
      : {}),
    sub: subject,
    iat: nowSeconds,
    exp: nowSeconds + 60,
    iss: "supabase",
  };
  const jwk = env.SUPABASE_JWT_PRIVATE_JWK ? parsePrivateJwk(env.SUPABASE_JWT_PRIVATE_JWK) : null;
  const kid = env.SUPABASE_JWT_KID || jwk?.kid;
  const header = base64UrlEncode(encoder.encode(JSON.stringify({
    alg: algorithm,
    typ: "JWT",
    ...(kid ? { kid } : {}),
  })));
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = header + "." + payload;
  let key: CryptoKey;
  let signature: ArrayBuffer;

  if (algorithm === "HS256") {
    if (!env.SUPABASE_JWT_SECRET || env.SUPABASE_JWT_SECRET.length < 32) {
      throw new Error("supabase_jwt_secret_not_configured");
    }
    key = await hmacKey(env.SUPABASE_JWT_SECRET, ["sign"]);
    signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  } else if (algorithm === "RS256") {
    if (!jwk || jwk.kty !== "RSA") throw new Error("supabase_rsa_private_jwk_required");
    key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
    );
    signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput));
  } else {
    if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256") {
      throw new Error("supabase_es256_private_jwk_required");
    }
    key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
    signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput),
    );
  }

  return signingInput + "." + base64UrlEncode(new Uint8Array(signature));
}

export async function signSupabaseUserJwt(
  subject: string,
  env: {
    SUPABASE_JWT_ALGORITHM?: string;
    SUPABASE_JWT_SECRET?: string;
    SUPABASE_JWT_PRIVATE_JWK?: string;
    SUPABASE_JWT_KID?: string;
  },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return signSupabaseJwt(subject, "authenticated", env, nowSeconds);
}

export async function signSupabasePaymentWorkerJwt(
  subject: string,
  env: {
    SUPABASE_JWT_ALGORITHM?: string;
    SUPABASE_JWT_SECRET?: string;
    SUPABASE_JWT_PRIVATE_JWK?: string;
    SUPABASE_JWT_KID?: string;
  },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return signSupabaseJwt(subject, "cenpaya_payment_worker", env, nowSeconds);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

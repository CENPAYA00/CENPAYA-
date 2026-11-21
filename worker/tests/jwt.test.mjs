import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  signHmacJwt,
  signSupabaseUserJwt,
  verifyD1IdentityAssertion,
} from "../.test-build/jwt.js";

const secret = "test-only-d1-assertion-secret-with-more-than-32-bytes";
const userId = "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11";

function decodePayload(token) {
  const segment = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(segment + "=".repeat((4 - segment.length % 4) % 4)));
}

void describe("D1 identity assertion verification", () => {
  void it("accepts a valid short-lived assertion and returns only its UUID subject", async () => {
    const now = 1_800_000_000;
    const token = await signHmacJwt({
      iss: "cenpaya-d1-worker",
      aud: "cenpaya-supabase-worker",
      sub: userId,
      iat: now,
      exp: now + 25,
      jti: "fresh-random-assertion-id-1234",
    }, secret);

    assert.equal(await verifyD1IdentityAssertion(token, secret, now), userId);
  });

  void it("rejects a modified signature", async () => {
    const now = 1_800_000_000;
    const token = await signHmacJwt({
      iss: "cenpaya-d1-worker", aud: "cenpaya-supabase-worker",
      sub: userId, iat: now, exp: now + 20, jti: "fresh-random-assertion-id-1234",
    }, secret);
    const parts = token.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    await assert.rejects(() => verifyD1IdentityAssertion(parts.join("."), secret, now));
  });

  void it("rejects a wrong audience, invalid subject, future issue time and long lifetime", async () => {
    const now = 1_800_000_000;
    const base = {
      iss: "cenpaya-d1-worker", aud: "cenpaya-supabase-worker",
      sub: userId, iat: now, exp: now + 20, jti: "fresh-random-assertion-id-1234",
    };
    for (const claims of [
      { ...base, aud: "wrong-audience" },
      { ...base, sub: "not-a-uuid" },
      { ...base, iat: now + 1 },
      { ...base, exp: now + 31 },
      { ...base, exp: now },
    ]) {
      const token = await signHmacJwt(claims, secret);
      await assert.rejects(() => verifyD1IdentityAssertion(token, secret, now));
    }
  });
});

void describe("Supabase user JWT creation", () => {
  void it("creates a 60-second authenticated JWT for the verified UUID only", async () => {
    const now = 1_800_000_000;
    const token = await signSupabaseUserJwt(userId, {
      SUPABASE_JWT_ALGORITHM: "HS256",
      SUPABASE_JWT_SECRET: "test-only-supabase-jwt-secret-with-more-than-32-bytes",
    }, now);
    const claims = decodePayload(token);
    assert.equal(claims.sub, userId);
    assert.equal(claims.aud, "authenticated");
    assert.equal(claims.role, "authenticated");
    assert.equal(claims.iss, "supabase");
    assert.equal(claims.exp - claims.iat, 60);
  });

  void it("fails closed when the project's signing key is not configured", async () => {
    await assert.rejects(() => signSupabaseUserJwt(userId, {}, 1_800_000_000));
  });
});

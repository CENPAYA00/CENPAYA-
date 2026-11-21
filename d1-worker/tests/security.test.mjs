import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { constantTimeEqual, signD1IdentityAssertion } from "../.test-build/security.js";

globalThis.crypto ??= webcrypto;

const secret = "test-only-d1-to-supabase-hmac-secret-with-more-than-32-bytes";
const userId = "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11";

function decode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(base64 + "=".repeat((4 - base64.length % 4) % 4), "base64");
}

void describe("D1 identity assertion signing", () => {
  void it("signs a 120-second assertion with the expected issuer, audience, subject and unique jti", async () => {
    const token = await signD1IdentityAssertion(userId, secret);
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    const header = JSON.parse(decode(headerPart).toString("utf8"));
    const claims = JSON.parse(decode(payloadPart).toString("utf8"));
    assert.deepEqual(header, { alg: "HS256", typ: "JWT" });
    assert.equal(claims.iss, "cenpaya-d1-worker");
    assert.equal(claims.aud, "cenpaya-supabase-worker");
    assert.equal(claims.sub, userId);
    assert.equal(claims.exp - claims.iat, 120);
    assert.equal(typeof claims.jti, "string");
    assert.ok(claims.jti.length >= 16 && claims.jti.length <= 200);

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, decode(signaturePart), new TextEncoder().encode(headerPart + "." + payloadPart),
    );
    assert.equal(valid, true);
  });

  void it("uses constant-time equality semantics for internal secrets", () => {
    assert.equal(constantTimeEqual("shared-secret", "shared-secret"), true);
    assert.equal(constantTimeEqual("shared-secret", "shared-secret-x"), false);
    assert.equal(constantTimeEqual("", ""), true);
  });
});

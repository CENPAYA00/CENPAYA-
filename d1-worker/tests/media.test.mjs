import test from "node:test";
import assert from "node:assert/strict";
import { signMediaUrl, extractMediaKey } from "../.test-build/media.js";

const origin = "https://d1-worker.example";
const env = {
  MEDIA_BUCKET: {},
  MEDIA_URL_SIGNING_SECRET: "test-media-signing-secret-at-least-32-bytes"
};

test("signed media URLs verify for the same worker origin", async () => {
  const key = "chat/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/image.jpg";
  const url = await signMediaUrl(env, origin, key);
  assert.ok(url);
  assert.equal(await extractMediaKey(url, env, new URL(origin)), key);
});

test("signed media URLs reject another origin and tampered signatures", async () => {
  const key = "marketplace/00000000-0000-4000-8000-000000000001/listings-images/image.jpg";
  const url = await signMediaUrl(env, origin, key);
  assert.ok(url);
  assert.equal(await extractMediaKey(url, env, new URL("https://attacker.example")), null);
  const tampered = new URL(url);
  tampered.searchParams.set("sig", "0".repeat(64));
  assert.equal(await extractMediaKey(tampered.toString(), env, new URL(origin)), null);
});

test("signed media URLs reject expired links and unsupported object namespaces", async () => {
  const key = "chat/00000000-0000-4000-8000-000000000001/file.webm";
  const url = await signMediaUrl(env, origin, key, 60);
  assert.ok(url);
  const expired = new URL(url);
  expired.searchParams.set("exp", String(Math.floor(Date.now() / 1000) - 1));
  assert.equal(await extractMediaKey(expired.toString(), env, new URL(origin)), null);
  assert.equal(await signMediaUrl(env, origin, "users/private/file.jpg"), null);
  const postKey = "posts/00000000-0000-4000-8000-000000000001/post-image.jpg";
  const postUrl = await signMediaUrl(env, origin, postKey);
  assert.ok(postUrl);
  assert.equal(await extractMediaKey(postUrl, env, new URL(origin)), postKey);
});

test("media signing fails closed without the bucket binding or a strong secret", async () => {
  assert.equal(await signMediaUrl({ MEDIA_URL_SIGNING_SECRET: "short" }, origin, "chat/thread/user/file.jpg"), null);
  assert.equal(await signMediaUrl({ MEDIA_BUCKET: {} }, origin, "chat/thread/user/file.jpg"), null);
});

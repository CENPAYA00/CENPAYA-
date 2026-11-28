import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

const migrationsDirectory = new URL("../../database/d1/migrations/", import.meta.url);

test("D1 migration files use unique numeric identifiers", async () => {
  const files = (await readdir(migrationsDirectory)).filter(name => name.endsWith(".sql"));
  const versions = new Map();

  for (const file of files) {
    const match = file.match(/^(\d+)_/);
    assert.ok(match, `Migration filename must start with a numeric identifier: ${file}`);
    const version = match[1];
    const previous = versions.get(version);
    assert.equal(previous, undefined, `Duplicate D1 migration identifier ${version}: ${previous} and ${file}`);
    versions.set(version, file);
  }

  for (const version of ["0078", "0079", "0080", "0081", "0082"]) {
    assert.ok(versions.has(version), `Expected forward migration ${version} to exist`);
  }
});

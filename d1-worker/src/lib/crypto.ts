
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_HASH_LENGTH = 256;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    "="
  );

  const binary = atob(padded);

  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );
}

export function createRandomToken(
  byteLength = 32
): string {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw new Error("Invalid token length");
  }

  const bytes = crypto.getRandomValues(
    new Uint8Array(byteLength)
  );

  return toBase64Url(bytes);
}

export async function hashToken(
  token: string
): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(
  password: string
): Promise<string> {
  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    PASSWORD_HASH_LENGTH
  );

  return [
    "pbkdf2-sha256",
    PASSWORD_ITERATIONS,
    toBase64Url(salt),
    toBase64Url(new Uint8Array(derivedBits))
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
      return false;
    }

    const iterations = Number(parts[1]);

    if (
      !Number.isInteger(iterations) ||
      iterations < PASSWORD_ITERATIONS ||
      iterations > 1_000_000
    ) {
      return false;
    }

    const salt = fromBase64Url(parts[2]);
    const expectedHash = fromBase64Url(parts[3]);

    if (salt.length !== 16 || expectedHash.length !== 32) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      PASSWORD_HASH_LENGTH
    );

    const actualHash = new Uint8Array(derivedBits);

    let difference = 0;

    for (let index = 0; index < expectedHash.length; index++) {
      difference |= actualHash[index] ^ expectedHash[index];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

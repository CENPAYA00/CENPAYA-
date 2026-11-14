
const encoder = new TextEncoder();

const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BITS = 256;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);

  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(value),
  );

  return new Uint8Array(digest);
}

export async function randomToken(bytes = 32): Promise<string> {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(value);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 128) {
    throw new Error('INVALID_PASSWORD_LENGTH');
  }

  const salt = crypto.getRandomValues(
    new Uint8Array(PASSWORD_SALT_BYTES),
  );

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    PASSWORD_KEY_BITS,
  );

  return [
    'pbkdf2-sha256',
    PASSWORD_ITERATIONS,
    toBase64Url(salt),
    toBase64Url(new Uint8Array(derived)),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const parts = storedHash.split('$');

    if (
      parts.length !== 4 ||
      parts[0] !== 'pbkdf2-sha256'
    ) {
      return false;
    }

    const iterations = Number(parts[1]);

    if (
      !Number.isInteger(iterations) ||
      iterations < 100_000 ||
      iterations > 1_000_000
    ) {
      return false;
    }

    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);

    if (salt.length !== PASSWORD_SALT_BYTES || expected.length !== 32) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const actual = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt,
          iterations,
        },
        key,
        PASSWORD_KEY_BITS,
      ),
    );

    let difference = 0;

    for (let i = 0; i < expected.length; i++) {
      difference |= expected[i] ^ actual[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
  }


import { Client } from 'pg';
import { hashPassword, randomToken, sha256 } from './auth-crypto';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  type EmailEnv,
} from './email';
import { jsonResponse, readJsonObject } from './http-utils';

interface AuthFlowEnv extends EmailEnv {
  HYPERDRIVE: Hyperdrive;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function withClient<T>(
  env: AuthFlowEnv,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    statement_timeout: 15000,
  });

  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function validEmail(value: string): boolean {
  return value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value: string): boolean {
  return value.length >= 8 &&
    value.length <= 128 &&
    /[a-zA-Z]/.test(value) &&
    /[0-9]/.test(value);
}

function validDateOfBirth(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== value) return false;

  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();

  const monthDifference = now.getUTCMonth() - date.getUTCMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && now.getUTCDate() < date.getUTCDate())
  ) {
    age--;
  }

  return age >= 13 && age <= 120;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value.trim();

  if (!cleaned || cleaned.length > maxLength) return null;

  return cleaned;
}

async function createEmailToken(
  client: Client,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
): Promise<string> {
  const token = await randomToken(32);
  const tokenHash = hex(await sha256(token));

  await client.query(
    `UPDATE public.auth_email_tokens
        SET consumed_at = NOW()
      WHERE user_id = $1
        AND purpose = $2
        AND consumed_at IS NULL`,
    [userId, purpose],
  );

  await client.query(
    `INSERT INTO public.auth_email_tokens
       (user_id, purpose, token_hash, expires_at)
     VALUES
       ($1, $2, decode($3, 'hex'), NOW() + INTERVAL '30 minutes')`,
    [userId, purpose, tokenHash],
  );

  return token;
}

export async function registerAccount(
  request: Request,
  env: AuthFlowEnv,
  headers: Headers,
): Promise<Response> {
  const body = await readJsonObject(request, 12000);

  if (!body) {
    return jsonResponse({ error: 'invalid_request' }, 400, headers);
  }

  const firstName = cleanText(body.first_name, 60);
  const lastName = cleanText(body.last_name, 60);
  const email = typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : '';
  const password = typeof body.password === 'string'
    ? body.password
    : '';
  const gender = cleanText(body.gender, 30);
  const dateOfBirth = typeof body.date_of_birth === 'string'
    ? body.date_of_birth
    : '';
  const language = body.preferred_lang === 'fr' ? 'fr' : 'en';

  if (
    !firstName ||
    !lastName ||
    !validEmail(email) ||
    !validPassword(password) ||
    !gender ||
    !validDateOfBirth(dateOfBirth) ||
    body.accepted_terms !== true
  ) {
    return jsonResponse({ error: 'invalid_signup_details' }, 400, headers);
  }

  const usernameBase = `${firstName}_${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);

  const username = `${usernameBase}_${(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000)}`;

  const passwordHash = await hashPassword(password);

  try {
    return await withClient(env, async client => {
      await client.query('BEGIN');

      try {
        // Serialize same-email signup attempts.
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [email],
        );

        const existing = await client.query(
          `SELECT id
             FROM public.users
            WHERE LOWER(email) = $1
            LIMIT 1`,
          [email],
        );

        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return jsonResponse({
            error: 'email_already_registered',
          }, 409, headers);
        }

        const inserted = await client.query(
          `INSERT INTO public.users
             (username, email, password_hash, country_iso,
              preferred_lang, is_email_verified, user_metadata)
           VALUES
             ($1, $2, $3, 'CM', $4, 0, $5::jsonb)
           RETURNING id`,
          [
            username,
            email,
            passwordHash,
            language,
            JSON.stringify({
              first_name: firstName,
              last_name: lastName,
              gender,
              date_of_birth: dateOfBirth,
            }),
          ],
        );

        const userId = String(inserted.rows[0].id);

        await client.query(
          `INSERT INTO public.user_legal_acceptances
             (user_id, document_slug, version, accepted_at)
           VALUES ($1, 'terms-of-service', 'v1.0', NOW())`,
          [userId],
        );

        const token = await createEmailToken(
          client,
          userId,
          'verify_email',
        );

        // Send before commit so a failed email does not leave an
        // unreachable, unverified account behind.
        await sendVerificationEmail(env, email, token);

        await client.query('COMMIT');

        return jsonResponse({
          success: true,
          verification_required: true,
        }, 201, headers);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  } catch {
    return jsonResponse({ error: 'signup_unavailable' }, 503, headers);
  }
}

export async function verifyEmail(
  request: Request,
  env: AuthFlowEnv,
  headers: Headers,
): Promise<Response> {
  const body = await readJsonObject(request);

  const token = typeof body?.token === 'string'
    ? body.token
    : '';

  if (token.length < 32 || token.length > 256) {
    return jsonResponse({ error: 'invalid_or_expired_token' }, 400, headers);
  }

  const tokenHash = hex(await sha256(token));

  try {
    return await withClient(env, async client => {
      await client.query('BEGIN');

      try {
        const result = await client.query(
          `SELECT id, user_id
             FROM public.auth_email_tokens
            WHERE token_hash = decode($1, 'hex')
              AND purpose = 'verify_email'
              AND consumed_at IS NULL
              AND expires_at > NOW()
            FOR UPDATE`,
          [tokenHash],
        );

        const record = result.rows[0];

        if (!record) {
          await client.query('ROLLBACK');
          return jsonResponse({
            error: 'invalid_or_expired_token',
          }, 400, headers);
        }

        await client.query(
          `UPDATE public.users
              SET is_email_verified = 1
            WHERE id = $1`,
          [record.user_id],
        );

        await client.query(
          `UPDATE public.auth_email_tokens
              SET consumed_at = NOW()
            WHERE id = $1`,
          [record.id],
        );

        await client.query('COMMIT');

        return jsonResponse({ success: true }, 200, headers);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  } catch {
    return jsonResponse({ error: 'verification_unavailable' }, 503, headers);
  }
}

export async function requestPasswordReset(
  request: Request,
  env: AuthFlowEnv,
  headers: Headers,
): Promise<Response> {
  const body = await readJsonObject(request);
  const email = typeof body?.email === 'string'
    ? body.email.trim().toLowerCase()
    : '';

  // Always return the same public response to prevent email enumeration.
  const genericResponse = () => jsonResponse({
    success: true,
    message: 'If the account exists, a reset email will be sent.',
  }, 200, headers);

  if (!validEmail(email)) return genericResponse();

  try {
    await withClient(env, async client => {
      const result = await client.query(
        `SELECT id, email
           FROM public.users
          WHERE LOWER(email) = $1
            AND is_email_verified = 1
            AND banned = 0
            AND is_deactivated = 0
          LIMIT 1`,
        [email],
      );

      const user = result.rows[0];
      if (!user) return;

      const token = await createEmailToken(
        client,
        String(user.id),
        'reset_password',
      );

      await sendPasswordResetEmail(env, String(user.email), token);
    });
  } catch {
    // Do not reveal whether the email exists or whether delivery failed.
  }

  return genericResponse();
}

export async function resetPassword(
  request: Request,
  env: AuthFlowEnv,
  headers: Headers,
): Promise<Response> {
  const body = await readJsonObject(request);

  const token = typeof body?.token === 'string'
    ? body.token
    : '';
  const password = typeof body?.password === 'string'
    ? body.password
    : '';

  if (
    token.length < 32 ||
    token.length > 256 ||
    !validPassword(password)
  ) {
    return jsonResponse({ error: 'invalid_reset_request' }, 400, headers);
  }

  const tokenHash = hex(await sha256(token));
  const newHash = await hashPassword(password);

  try {
    return await withClient(env, async client => {
      await client.query('BEGIN');

      try {
        const result = await client.query(
          `SELECT id, user_id
             FROM public.auth_email_tokens
            WHERE token_hash = decode($1, 'hex')
              AND purpose = 'reset_password'
              AND consumed_at IS NULL
              AND expires_at > NOW()
            FOR UPDATE`,
          [tokenHash],
        );

        const record = result.rows[0];

        if (!record) {
          await client.query('ROLLBACK');
          return jsonResponse({
            error: 'invalid_or_expired_token',
          }, 400, headers);
        }

        await client.query(
          `UPDATE public.users
              SET password_hash = $2,
                  password_updated_at = NOW()
            WHERE id = $1`,
          [record.user_id, newHash],
        );

        await client.query(
          `UPDATE public.auth_email_tokens
              SET consumed_at = NOW()
            WHERE user_id = $1
              AND purpose = 'reset_password'
              AND consumed_at IS NULL`,
          [record.user_id],
        );

        // Resetting a password revokes every existing login session.
        await client.query(
          `UPDATE public.auth_sessions
              SET revoked_at = NOW()
            WHERE user_id = $1
              AND revoked_at IS NULL`,
          [record.user_id],
        );

        await client.query('COMMIT');

        return jsonResponse({ success: true }, 200, headers);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  } catch {
    return jsonResponse({ error: 'password_reset_unavailable' }, 503, headers);
  }
                           }
              

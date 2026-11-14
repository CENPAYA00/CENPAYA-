
export interface EmailEnv {
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  CENPAYA_ORIGIN: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendTransactionalEmail(
  env: EmailEnv,
  recipient: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error('EMAIL_CONFIGURATION_MISSING');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [recipient],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    // Do not expose provider responses or credentials to clients.
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}

export async function sendVerificationEmail(
  env: EmailEnv,
  recipient: string,
  token: string,
): Promise<void> {
  const url = new URL('/verify-otp', env.CENPAYA_ORIGIN);
  url.searchParams.set('token', token);
  url.searchParams.set('email', recipient);

  const safeUrl = escapeHtml(url.toString());

  await sendTransactionalEmail(
    env,
    recipient,
    'Verify your CenPaya email address',
    `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
        <h2>Welcome to CenPaya</h2>
        <p>Confirm your email address to finish creating your account.</p>
        <p>
          <a href="${safeUrl}"
             style="display:inline-block;padding:13px 22px;background:#1769e0;color:#fff;text-decoration:none;border-radius:8px">
            Verify email address
          </a>
        </p>
        <p>This link expires in 30 minutes and can only be used once.</p>
        <p>If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  );
}

export async function sendPasswordResetEmail(
  env: EmailEnv,
  recipient: string,
  token: string,
): Promise<void> {
  const url = new URL('/reset-password', env.CENPAYA_ORIGIN);
  url.searchParams.set('token', token);

  const safeUrl = escapeHtml(url.toString());

  await sendTransactionalEmail(
    env,
    recipient,
    'Reset your CenPaya password',
    `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
        <h2>Password reset</h2>
        <p>We received a request to reset your CenPaya password.</p>
        <p>
          <a href="${safeUrl}"
             style="display:inline-block;padding:13px 22px;background:#1769e0;color:#fff;text-decoration:none;border-radius:8px">
            Reset password
          </a>
        </p>
        <p>This link expires in 30 minutes and can only be used once.</p>
        <p>If you did not request this, ignore this email. Your password will not change.</p>
      </div>
    `,
  );
}

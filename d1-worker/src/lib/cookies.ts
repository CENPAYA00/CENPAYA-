
const SESSION_COOKIE_NAME = "__Host-cenpaya_session";

export function getCookie(
  request: Request,
  name: string
): string | null {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = part
      .slice(0, separatorIndex)
      .trim();

    if (cookieName !== name) {
      continue;
    }

    const cookieValue = part
      .slice(separatorIndex + 1)
      .trim();

    try {
      return decodeURIComponent(cookieValue);
    } catch {
      return null;
    }
  }

  return null;
}

export function createSessionCookie(
  token: string,
  maxAgeSeconds: number
): string {
  if (!token || /[\r\n;]/.test(token)) {
    throw new Error("Invalid session token");
  }

  if (
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0
  ) {
    throw new Error("Invalid session cookie lifetime");
  }

  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

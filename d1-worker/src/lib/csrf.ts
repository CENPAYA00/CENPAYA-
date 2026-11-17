
const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS"
]);

export function passesCsrfOriginCheck(
  request: Request,
  allowedOrigins?: string
): boolean {
  const method = request.method.toUpperCase();

  // Read-only requests do not require this check.
  if (SAFE_METHODS.has(method)) {
    return true;
  }

  // State-changing requests must include an Origin header.
  const requestOrigin = request.headers.get("Origin");

  if (!requestOrigin || !allowedOrigins) {
    return false;
  }

  let normalizedOrigin: string;

  try {
    const parsedOrigin = new URL(requestOrigin);

    // Origin headers must contain an origin, not a path.
    if (
      parsedOrigin.origin !== requestOrigin ||
      !["http:", "https:"].includes(parsedOrigin.protocol)
    ) {
      return false;
    }

    normalizedOrigin = parsedOrigin.origin;
  } catch {
    return false;
  }

  const trustedOrigins = allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return trustedOrigins.includes(normalizedOrigin);
}

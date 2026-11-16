
export function isNonEmptyString(
  value: unknown,
  maxLength = 255
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value)
  );
}

export function isValidInteger(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function getPagination(
  url: URL,
  defaultLimit = 20,
  maxLimit = 100
): { limit: number; offset: number } {
  const requestedLimit = Number(url.searchParams.get("limit"));
  const requestedOffset = Number(url.searchParams.get("offset"));

  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : defaultLimit;

  const offset =
    Number.isInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0;

  return { limit, offset };
}


export type JsonBodyResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      status: 400 | 413 | 415;
      message: string;
    };

const DEFAULT_MAX_BODY_SIZE = 1_000_000;

export async function readJsonBody<
  T extends Record<string, unknown>
>(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_SIZE
): Promise<JsonBodyResult<T>> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new Error("Invalid maximum body size");
  }

  const contentType = request.headers
    .get("Content-Type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (
    contentType !== "application/json" &&
    !contentType?.endsWith("+json")
  ) {
    return {
      ok: false,
      status: 415,
      message: "Content-Type must be JSON"
    };
  }

  const contentLength = request.headers.get("Content-Length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return {
        ok: false,
        status: 400,
        message: "Invalid Content-Length"
      };
    }

    if (Number(contentLength) > maxBytes) {
      return {
        ok: false,
        status: 413,
        message: "Request body is too large"
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      status: 400,
      message: "Request body is missing"
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();

        return {
          ok: false,
          status: 413,
          message: "Request body is too large"
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Unable to read request body"
    };
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;

  try {
    const text = new TextDecoder("utf-8", {
      fatal: true
    }).decode(body);

    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Invalid JSON body"
    };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return {
      ok: false,
      status: 400,
      message: "JSON body must be an object"
    };
  }

  return {
    ok: true,
    data: parsed as T
  };
}

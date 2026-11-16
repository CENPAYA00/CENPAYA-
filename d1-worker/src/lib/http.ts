
export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: HeadersInit = {}
): Response {
  const headers = new Headers(extraHeaders);

  headers.set(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

export function errorResponse(
  message: string,
  status = 400
): Response {
  return jsonResponse(
    {
      success: false,
      error: message
    },
    status
  );
}

export async function readJson<T>(
  request: Request
): Promise<
  | { success: true; data: T }
  | { success: false; response: Response }
> {
  const contentType = request.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      success: false,
      response: errorResponse(
        "Content-Type must be application/json",
        415
      )
    };
  }

  try {
    const data: unknown = await request.json();

    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return {
        success: false,
        response: errorResponse(
          "Request body must be a JSON object",
          400
        )
      };
    }

    return {
      success: true,
      data: data as T
    };
  } catch {
    return {
      success: false,
      response: errorResponse(
        "Invalid JSON request body",
        400
      )
    };
  }
}

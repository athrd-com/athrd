import {
  isThreadSyncSource,
  syncThreadIndex,
  ThreadSyncError,
} from "~/server/thread-index";

export async function POST(request: Request): Promise<Response> {
  const accessToken = getBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return jsonResponse(
      { ok: false, error: { code: "missing_token", message: "Missing bearer token." } },
      401,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "invalid_json", message: "Request body must be JSON." } },
      400,
    );
  }

  if (!isRecord(body)) {
    return jsonResponse(
      { ok: false, error: { code: "invalid_request", message: "Request body must be an object." } },
      400,
    );
  }

  const { source, sourceId } = body;
  if (!isThreadSyncSource(source) || typeof sourceId !== "string" || !sourceId.trim()) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "Request body must include source and sourceId.",
        },
      },
      400,
    );
  }

  try {
    const result = await syncThreadIndex({
      source,
      sourceId,
      accessToken,
    });

    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof ThreadSyncError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.status,
      );
    }

    console.error("thread-sync-unexpected-error", {
      errorClass: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(
      {
        ok: false,
        error: {
          code: "internal_error",
          message: "Unable to sync thread.",
        },
      },
      500,
    );
  }
}

function getBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

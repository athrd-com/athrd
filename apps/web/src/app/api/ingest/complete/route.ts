import {
  authenticateIngestRequest,
  completeIngestRequestSchema,
  completeThreadIngest,
  IngestHttpError,
} from "~/server/ingest";
import { ZodError } from "zod";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await authenticateIngestRequest(request);
    const body = completeIngestRequestSchema.parse(await request.json());
    const result = await completeThreadIngest({
      metadata: body.metadata,
      github: body.github,
      artifact: body.artifact,
      storage: body.storage,
      actor,
    });

    return Response.json(result);
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

function ingestErrorResponse(error: unknown): Response {
  if (error instanceof IngestHttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json({ error: "Invalid ingest completion request." }, {
      status: 400,
    });
  }

  console.error("ingest-complete-failed", error);
  return Response.json({ error: "Unable to complete ingest." }, { status: 500 });
}

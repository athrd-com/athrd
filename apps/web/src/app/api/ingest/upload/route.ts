import {
  authenticateIngestRequest,
  createSignedThreadUpload,
  IngestHttpError,
  signedUploadRequestSchema,
} from "~/server/ingest";
import { ZodError } from "zod";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await authenticateIngestRequest(request);
    const body = signedUploadRequestSchema.parse(await request.json());
    const upload = await createSignedThreadUpload({
      metadata: body.metadata,
      github: body.github,
      artifact: body.artifact,
      actor,
    });

    return Response.json(upload);
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

function ingestErrorResponse(error: unknown): Response {
  if (error instanceof IngestHttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json({ error: "Invalid signed upload request." }, {
      status: 400,
    });
  }

  console.error("ingest-upload-failed", error);
  return Response.json({ error: "Unable to create signed upload." }, { status: 500 });
}

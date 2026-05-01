import {
  authenticateGithubRequest,
  createSignedThreadUpload,
  IngestHttpError,
  signedUploadRequestSchema,
} from "~/server/ingest";
import { ZodError } from "zod";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await authenticateGithubRequest(request);
    const body = signedUploadRequestSchema.parse(await request.json());
    const result = await createSignedThreadUpload({
      metadata: body.metadata,
      github: body.github,
      artifact: body.artifact,
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
    return Response.json({ error: "Invalid ingest upload request." }, {
      status: 400,
    });
  }

  console.error("ingest-upload-failed", error);
  return Response.json({ error: "Unable to create signed upload URL." }, {
    status: 500,
  });
}

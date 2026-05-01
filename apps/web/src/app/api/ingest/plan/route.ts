import {
  authenticateGithubRequest,
  createIngestPlan,
  ingestPlanRequestSchema,
  IngestHttpError,
} from "~/server/ingest";
import { ZodError } from "zod";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await authenticateGithubRequest(request);
    const body = ingestPlanRequestSchema.parse(await request.json());
    const plan = await createIngestPlan(body.metadata, actor, body.github);

    return Response.json(plan);
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

function ingestErrorResponse(error: unknown): Response {
  if (error instanceof IngestHttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json({ error: "Invalid ingest plan request." }, { status: 400 });
  }

  console.error("ingest-plan-failed", error);
  return Response.json({ error: "Unable to create ingest plan." }, { status: 500 });
}

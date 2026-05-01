import {
  authenticateGithubRequest,
  createCliAccessToken,
  IngestHttpError,
} from "~/server/ingest";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await authenticateGithubRequest(request);
    return Response.json(createCliAccessToken(actor));
  } catch (error) {
    return cliTokenErrorResponse(error);
  }
}

function cliTokenErrorResponse(error: unknown): Response {
  if (error instanceof IngestHttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("cli-token-exchange-failed", error);
  return Response.json(
    { error: "Unable to exchange CLI token." },
    { status: 500 },
  );
}

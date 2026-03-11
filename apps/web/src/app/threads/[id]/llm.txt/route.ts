import { renderLlmTxt } from "@/lib/llm-export";
import { loadThreadContext, ThreadLoadError } from "@/lib/thread-loader";

export const revalidate = 300;

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const context = await loadThreadContext(id);
    const body = renderLlmTxt({
      thread: context.parsedThread,
      metadata: {
        repoName: context.repoName,
        modelsUsed: context.modelsUsed,
        ide: context.ide,
        title: context.title,
      },
    });

    return textResponse(body, 200);
  } catch (error) {
    const logPayload = {
      threadId: id,
      exportVariant: "llm.txt",
      errorClass: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    };

    if (error instanceof ThreadLoadError) {
      console.warn("thread-export-not-found-or-parse-failed", {
        ...logPayload,
        code: error.code,
      });
      return textResponse("Not found", 404);
    }

    console.error("thread-export-unexpected-error", logPayload);
    return textResponse("Internal Server Error", 500);
  }
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

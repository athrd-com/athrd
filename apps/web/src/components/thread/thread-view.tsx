import AThrdThread from "@/components/thread/athrd-thread";
import ThreadHeader from "@/components/thread/thread-header";
import { detectIDE, parseThread } from "@/parsers";
import type { AThrd } from "@/types/athrd";
import type { ClaudeThread as ClaudeThreadType } from "@/types/claude";
import type { CodexThread as CodexThreadType } from "@/types/codex";
import type { GeminiThread as GeminiThreadType } from "@/types/gemini";
import { IDE } from "@/types/ide";
import type { VSCodeThread as IVSCodeThread } from "@/types/vscode";
import type { GistData, GistFile } from "~/lib/github";

interface ThreadViewProps {
  gist: GistData;
  file: GistFile;
}

export default function ThreadView({ gist, file }: ThreadViewProps) {
  const owner = gist.owner;
  let content: Record<string, unknown> = {};
  let ide = IDE.VSCODE;
  let repoName: string | undefined;
  let modelsUsed: string[] = [];
  let parsedThread: AThrd | null = null;

  try {
    content = JSON.parse(file.content || "{}");

    // Detect IDE from __athrd metadata or auto-detect
    const athrdMeta = content.__athrd as Record<string, unknown> | undefined;
    if (athrdMeta?.ide) {
      ide = athrdMeta.ide as IDE;
    } else {
      // Try auto-detection
      const detectedIde = detectIDE(content);
      if (detectedIde) {
        ide = detectedIde;
      }
    }

    // Extract repo name from metadata
    if (athrdMeta?.githubRepo) {
      repoName = athrdMeta.githubRepo as string;
    }

    // Extract models used (before parsing, from raw content)
    modelsUsed = extractModelsUsed(content, ide);

    // Parse the thread into unified AThrd format
    parsedThread = parseThread(content, ide);
  } catch (error) {
    console.error(error);
    return (
      <div className="px-4 py-8">
        <h1 className="mb-4 font-bold text-3xl">Thread {gist.id}</h1>
        <p className="text-red-600">
          Error parsing thread from {file.filename}:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <code className="">
          <pre>{JSON.stringify(file.content, null, 2)}</pre>
        </code>
      </div>
    );
  }

  if (!parsedThread) {
    return (
      <div className="px-4 py-8">
        <h1 className="mb-4 font-bold text-3xl">Thread {gist.id}</h1>
        <p className="text-red-600">Unable to parse thread format.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ThreadHeader
        id={gist.id}
        owner={owner}
        title={gist.description}
        createdAt={gist.created_at}
        ide={ide}
        repoName={repoName}
        modelsUsed={modelsUsed}
        repoUrl={repoName ? `https://github.com/${repoName}` : undefined}
      />
      <AThrdThread owner={owner} thread={parsedThread} />
    </div>
  );
}

/**
 * Extract models used from raw content before parsing
 */
function extractModelsUsed(
  content: Record<string, unknown>,
  ide: IDE
): string[] {
  const models = new Set<string>();

  try {
    if (ide === IDE.VSCODE) {
      const vscodeContent = content as unknown as IVSCodeThread;
      vscodeContent.requests?.forEach((req) => {
        if (req.modelId) models.add(req.modelId);
      });
    }

    if (ide === IDE.CLAUDE || ide === (IDE.CLAUDE_CODE as string)) {
      const claudeContent = content as unknown as ClaudeThreadType;
      claudeContent.requests?.forEach((req) => {
        if (req.message?.model) models.add(req.message.model);
      });
    }

    if (ide === IDE.GEMINI) {
      const geminiContent = content as unknown as GeminiThreadType;
      geminiContent.messages?.forEach((msg) => {
        if ("model" in msg && msg.model) models.add(msg.model);
      });
    }

    if (ide === IDE.CODEX) {
      const codexContent = content as unknown as CodexThreadType;
      codexContent.messages?.forEach((msg) => {
        if (msg.type === "turn_context" && msg.payload?.model) {
          models.add(msg.payload.model);
        }
      });
    }

    // Cursor doesn't expose model info in the current type
  } catch {
    // Ignore errors during model extraction
  }

  return Array.from(models);
}

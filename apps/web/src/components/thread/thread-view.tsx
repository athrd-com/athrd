import ClaudeThread from "@/components/claude/claude-thread";
import ThreadHeader from "@/components/thread/thread-header";
import VSCodeThread from "@/components/vscode/vscode-thread";
import type { ClaudeThread as ClaudeThreadType } from "@/types/claude";
import type { CodexThread as CodexThreadType } from "@/types/codex";
import type { GeminiThread as GeminiThreadType } from "@/types/gemini";
import { IDE } from "@/types/ide";
import type { VSCodeThread as IVSCodeThread } from "@/types/vscode";
import type { GistData, GistFile } from "~/lib/github";
import CodexThread from "../codex/codex-thread";
import GeminiThread from "../gemini/gemini-thread";

interface ThreadViewProps {
  gist: GistData;
  file: GistFile;
}

export default function ThreadView({ gist, file }: ThreadViewProps) {
  const owner = gist.owner;
  let content = {};
  let ide = IDE.VSCODE;
  let repoName: string | undefined;
  let modelsUsed: string[] = [];

  try {
    content = JSON.parse(file.content || "{}");
    // @ts-ignore TODO: fix this properly later
    if (content?.__athrd?.ide === IDE.CLAUDE) ide = IDE.CLAUDE;
    // @ts-ignore TODO: fix this properly later
    if (content?.__athrd?.ide === IDE.GEMINI) ide = IDE.GEMINI;
    // @ts-ignore TODO: fix this properly later
    if (content?.__athrd?.ide === IDE.CODEX) ide = IDE.CODEX;

    // @ts-ignore
    if (content?.__athrd?.githubRepo) repoName = content.__athrd.githubRepo;

    if (ide === IDE.VSCODE) {
      const vscodeContent = content as IVSCodeThread;
      const models = new Set<string>();
      vscodeContent.requests.forEach((req) => {
        models.add(req.modelId);
      });
      modelsUsed = Array.from(models);
    }

    if (ide === IDE.CLAUDE) {
      const claudeContent = content as ClaudeThreadType;
      const models = new Set<string>();
      if (claudeContent.requests) {
        claudeContent.requests.forEach((req) => {
          models.add(req.message.model);
        });
      }
      modelsUsed = Array.from(models);
    }

    if (ide === IDE.GEMINI) {
      const geminiContent = content as GeminiThreadType;
      const models = new Set<string>();
      if (geminiContent.messages) {
        geminiContent.messages.forEach((msg) => {
          if ("model" in msg) {
            models.add(msg.model);
          }
        });
      }
      modelsUsed = Array.from(models);
    }

    if (ide === IDE.CODEX) {
      const codexThread = content as CodexThreadType;
      const models = new Set<string>();
      codexThread.messages.forEach((msg) => {
        if (msg.type === "turn_context") {
          models.add(msg.payload.model);
        }
      });
      modelsUsed = Array.from(models);
    }
  } catch (error) {
    return (
      <div className="px-4 py-8">
        <h1 className="mb-4 font-bold text-3xl">Thread {gist.id}</h1>
        <p className="text-red-600">
          Error parsing JSON from {file.filename}:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <code className="">
          <pre>{JSON.stringify(file.content, null, 2)}</pre>
        </code>
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
      {ide === IDE.VSCODE && <VSCodeThread owner={owner} thread={content as IVSCodeThread} />}
      {ide === IDE.CLAUDE && <ClaudeThread owner={owner} thread={content as ClaudeThreadType} />}
      {ide === IDE.GEMINI && <GeminiThread owner={owner} thread={content as GeminiThreadType} />}
      {ide === IDE.CODEX && <CodexThread owner={owner} thread={content as CodexThreadType} />}
    </div>
  );
}

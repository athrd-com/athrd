import ClaudeThread from "@/components/claude/claude-thread";
import ThreadHeader from "@/components/thread/thread-header";
import VSCodeThread from "@/components/vscode/vscode-thread";
import type { ClaudeThread as ClaudeThreadType } from "@/types/claude";
import { IDE } from "@/types/ide";
import type { VSCodeThread as IVSCodeThread } from "@/types/vscode";
import { notFound } from "next/navigation";
import { fetchGist } from "~/lib/github";

// Enable static generation and caching
export const revalidate = 604800; // Cache for 1 week

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { gist, file } = await fetchGist(id);
  if (!gist || !file) {
    notFound();
  }

  const owner = gist.owner;
  let content = {};
  let ide = IDE.VSCODE;
  let repoName: string | undefined;
  let modelsUsed: string[] = [];

  try {
    content = JSON.parse(file.content || "{}");
    // @ts-ignore TODO: fix this properly later
    if (content?.__athrd?.ide === IDE.CLAUDE) ide = IDE.CLAUDE;

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
  } catch (error) {
    return (
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 font-bold text-3xl">Thread {id}</h1>
        <p className="text-red-600">
          Error parsing JSON from {file.filename}:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <code className="">
          <pre>{JSON.stringify(file.content, null, 2)}</pre>
        </code>
      </main>
    );
  }

  return (
    <div className="min-h-screen w-full text-white font-sans selection:bg-blue-500/30">
      <main className="relative z-10 container mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <ThreadHeader
          owner={owner}
          title={gist.description}
          createdAt={gist.created_at}
          ide={ide}
          repoName={repoName}
          modelsUsed={modelsUsed}
          repoUrl={repoName ? `https://github.com/${repoName}` : undefined}
        />
        {ide === IDE.VSCODE && <VSCodeThread owner={owner} thread={content} />}
        {ide === IDE.CLAUDE && <ClaudeThread owner={owner} thread={content} />}
      </main>
    </div>
  );
}

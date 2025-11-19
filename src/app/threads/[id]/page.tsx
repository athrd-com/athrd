import ClaudeThread from "@/components/claude/claude-thread";
import ThreadHeader from "@/components/thread/thread-header";
import VSCodeThread from "@/components/vscode/vscode-thread";
import { IDE } from "@/types/ide";
import { notFound } from "next/navigation";
import { fetchGist } from "~/lib/github";

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

  try {
    content = JSON.parse(file.content || "{}");
    // @ts-ignore TODO: fix this properly later
    if (content.__athrd.ide === IDE.CLAUDE) ide = IDE.CLAUDE;
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
        />
        {ide === IDE.VSCODE && <VSCodeThread owner={owner} thread={content} />}
        {ide === IDE.CLAUDE && <ClaudeThread owner={owner} thread={content} />}
      </main>
    </div>
  );
}

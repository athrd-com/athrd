import AThrdThread from "@/components/thread/athrd-thread";
import ThreadHeader from "@/components/thread/thread-header";
import { parseThreadContextFromGistFile } from "@/lib/thread-loader";
import type { AThrd } from "@/types/athrd";
import type { IDE } from "@/types/ide";
import type { GistData, GistFile } from "~/lib/github";

interface ThreadViewProps {
  gist: GistData;
  file: GistFile;
}

export default function ThreadView({ gist, file }: ThreadViewProps) {
  const owner = gist.owner;
  let ide: IDE;
  let repoName: string | undefined;
  let repoUrl: string | undefined;
  let modelsUsed: string[] = [];
  let parsedThread: AThrd;

  try {
    const threadContext = parseThreadContextFromGistFile(gist, file);
    ide = threadContext.ide;
    repoName = threadContext.repoName;
    repoUrl = repoName ? `https://github.com/${repoName}` : undefined;
    modelsUsed = threadContext.modelsUsed;
    parsedThread = threadContext.parsedThread;
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
          <pre>{JSON.stringify(file.content || "", null, 2)}</pre>
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
        repoUrl={repoUrl}
      />
      <AThrdThread
        owner={owner}
        thread={parsedThread}
        repoName={repoName}
        repoUrl={repoUrl}
      />
    </div>
  );
}

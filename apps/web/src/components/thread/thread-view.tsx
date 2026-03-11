import AThrdThread from "@/components/thread/athrd-thread";
import ThreadHeader from "@/components/thread/thread-header";
import type { ThreadContext } from "@/lib/thread-loader";

interface ThreadViewProps {
  context: ThreadContext;
  isOwner?: boolean;
}

export default function ThreadView({
  context,
  isOwner = false,
}: ThreadViewProps) {
  const repoUrl = context.repoName
    ? `https://github.com/${context.repoName}`
    : undefined;

  return (
    <div className="w-full">
      <ThreadHeader
        id={context.record.id}
        owner={context.record.owner}
        title={context.title}
        createdAt={context.record.createdAt}
        ide={context.ide}
        repoName={context.repoName}
        modelsUsed={context.modelsUsed}
        repoUrl={repoUrl}
        isOwner={isOwner}
      />
      <AThrdThread
        owner={context.record.owner}
        thread={context.parsedThread}
        repoName={context.repoName}
        repoUrl={repoUrl}
        commitHash={context.commitHash}
      />
    </div>
  );
}

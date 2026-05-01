import ThreadView from "@/components/thread/thread-view";
import { loadThreadContext, ThreadLoadError } from "@/lib/thread-loader";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; compareId: string }>;
}): Promise<Metadata> {
  const { id, compareId } = await params;

  return {
    title: `Compare Threads ${id} vs ${compareId} - ATHRD`,
    description: `Compare two threads side by side: ${id} and ${compareId}`,
    openGraph: {
      title: `Compare Threads ${id} vs ${compareId} - ATHRD`,
      description: `Compare two threads side by side: ${id} and ${compareId}`,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string; compareId: string }>;
}) {
  const { id, compareId } = await params;

  const [first, second] = await Promise.all([
    loadThreadContextOrNull(id),
    loadThreadContextOrNull(compareId),
  ]);

  return (
    <div className="min-h-screen w-full text-white font-sans selection:bg-blue-500/30">
      <main className="relative z-10 container mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* First Thread */}
          <div className="w-full overflow-hidden">
            {first ? (
              <ThreadView context={first} />
            ) : (
              <div className="p-8 text-center text-red-400 border border-red-900/50 rounded-lg bg-red-950/10">
                Thread {id} not found
              </div>
            )}
          </div>

          {/* Second Thread */}
          <div className="w-full overflow-hidden border-l border-gray-800 pl-8">
            {second ? (
              <ThreadView context={second} />
            ) : (
              <div className="p-8 text-center text-red-400 border border-red-900/50 rounded-lg bg-red-950/10">
                Thread {compareId} not found
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

async function loadThreadContextOrNull(id: string) {
  try {
    return await loadThreadContext(id);
  } catch (error) {
    if (error instanceof ThreadLoadError) {
      return null;
    }

    throw error;
  }
}
